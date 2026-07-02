import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";

import type { ProjectContext, ProjectFileKind, ProjectFileSummary } from "@ui-buddy/shared";

export type DetectedItem = {
  name: string;
  category: "framework" | "styling" | "tooling";
  confidence: number;
  evidence: string[];
};

export type ProjectDetectionReport = {
  rootPath: string;
  packageManager: "pnpm" | "npm" | "yarn" | "unknown";
  configFiles: string[];
  directories: string[];
  detections: DetectedItem[];
  files: ProjectFileSummary[];
  indexStats?: ProjectContext["indexStats"];
};

type PackageJson = {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

type ProjectScanOptions = {
  includeSource?: boolean;
  indexProject?: boolean;
  maxDepth?: number;
  maxFiles?: number;
  maxFileBytes?: number;
};

const DEFAULT_MAX_DEPTH = 7;
const DEFAULT_MAX_FILES = 300;
const DEFAULT_MAX_FILE_BYTES = 250_000;

const configPatterns = [
  /^next\.config\./,
  /^vite\.config\./,
  /^angular\.json$/,
  /^vue\.config\./,
  /^svelte\.config\./,
  /^tailwind\.config\./,
  /^nuxt\.config\./,
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^package-lock\.json$/,
  /^yarn\.lock$/,
];

const expectedDirectories = new Set(["src", "app", "pages", "components", "styles"]);
const skippedDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);
const secretFilePatterns = [/^\.env/i, /secret/i, /credential/i, /token/i, /key$/i];
const sourceExtensions = new Set([
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".pcss",
  ".html",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".vue",
  ".svelte",
]);
const stylesheetExtensions = new Set([".css", ".scss", ".sass", ".less", ".pcss"]);
const componentExtensions = new Set([".jsx", ".tsx", ".vue", ".svelte"]);

const toProjectPath = (path: string): string => path.replaceAll("\\", "/");

const uniqueSorted = (values: Iterable<string>): string[] =>
  Array.from(new Set(Array.from(values).filter((value) => value.length > 0))).sort();

const isSecretLikeFile = (name: string): boolean =>
  secretFilePatterns.some((pattern) => pattern.test(name));

const readPackageJson = async (rootPath: string): Promise<PackageJson | undefined> => {
  try {
    const raw = await readFile(join(rootPath, "package.json"), "utf8");
    const parsed = JSON.parse(raw) as PackageJson;
    return {
      dependencies: parsed.dependencies ?? {},
      devDependencies: parsed.devDependencies ?? {},
    };
  } catch {
    return undefined;
  }
};

const classifyFile = (projectPath: string): ProjectFileKind => {
  const extension = extname(projectPath).toLowerCase();

  if (stylesheetExtensions.has(extension)) {
    return "stylesheet";
  }

  if (
    projectPath.startsWith("app/") ||
    projectPath.startsWith("pages/") ||
    projectPath.includes("/routes/")
  ) {
    return "route";
  }

  if (componentExtensions.has(extension) || projectPath.includes("/components/")) {
    return "component";
  }

  if (configPatterns.some((pattern) => pattern.test(projectPath.split("/").at(-1) ?? ""))) {
    return "config";
  }

  return "other";
};

const extractCssSelectors = (content: string): string[] => {
  const selectors: string[] = [];
  const selectorRegex = /(^|})\s*([^{}@]+)\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = selectorRegex.exec(content)) !== null) {
    const selectorGroup = match[2] ?? "";
    selectors.push(
      ...selectorGroup
        .split(",")
        .map((selector) => selector.trim())
        .filter((selector) => selector.length > 0 && !selector.startsWith("@")),
    );
  }

  return uniqueSorted(selectors).slice(0, 80);
};

const extractClassNames = (content: string): string[] => {
  const classes: string[] = [];
  const classAttributeRegex = /\bclass(?:Name)?\s*=\s*(["'`])([^"'`]+)\1/g;
  const cssClassRegex = /\.([_a-zA-Z]+[_a-zA-Z0-9-]*)/g;
  let match: RegExpExecArray | null;

  while ((match = classAttributeRegex.exec(content)) !== null) {
    classes.push(...(match[2] ?? "").split(/\s+/));
  }

  while ((match = cssClassRegex.exec(content)) !== null) {
    classes.push(match[1] ?? "");
  }

  return uniqueSorted(classes).slice(0, 120);
};

const extractIds = (content: string): string[] => {
  const ids: string[] = [];
  const idAttributeRegex = /\bid\s*=\s*(["'`])([^"'`]+)\1/g;
  const cssIdRegex = /#([_a-zA-Z]+[_a-zA-Z0-9-]*)/g;
  let match: RegExpExecArray | null;

  while ((match = idAttributeRegex.exec(content)) !== null) {
    ids.push(match[2] ?? "");
  }

  while ((match = cssIdRegex.exec(content)) !== null) {
    ids.push(match[1] ?? "");
  }

  return uniqueSorted(ids).slice(0, 80);
};

const extractImports = (content: string): string[] => {
  const imports: string[] = [];
  const importRegex = /(?:import\s+(?:[^"']+\s+from\s+)?|@import\s+)(["'])([^"']+)\1/g;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[2] ?? "");
  }

  return uniqueSorted(imports).slice(0, 80);
};

const summarizeFile = async (
  rootPath: string,
  absolutePath: string,
  size: number,
  includeSource: boolean,
): Promise<ProjectFileSummary & { content?: string }> => {
  const projectPath = toProjectPath(relative(rootPath, absolutePath));
  const content = await readFile(absolutePath, "utf8");
  const extension = extname(projectPath).toLowerCase();
  const selectors = stylesheetExtensions.has(extension) ? extractCssSelectors(content) : [];

  return {
    path: projectPath,
    kind: classifyFile(projectPath),
    size,
    selectors,
    classNames: extractClassNames(content),
    ids: extractIds(content),
    imports: extractImports(content),
    ...(includeSource ? { content } : {}),
  };
};

const scanSourceFiles = async (
  rootPath: string,
  options: Required<
    Pick<ProjectScanOptions, "includeSource" | "maxDepth" | "maxFiles" | "maxFileBytes">
  >,
): Promise<Pick<ProjectContext, "files" | "sourceFiles" | "indexStats">> => {
  const files: ProjectFileSummary[] = [];
  const sourceFiles: NonNullable<ProjectContext["sourceFiles"]> = [];
  let skippedFiles = 0;
  let truncated = false;

  const visit = async (directoryPath: string, depth: number): Promise<void> => {
    if (truncated || depth > options.maxDepth) {
      return;
    }

    const entries = await readdir(directoryPath, { withFileTypes: true });

    for (const entry of entries) {
      if (truncated) {
        return;
      }

      const entryPath = join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        if (!skippedDirectories.has(entry.name)) {
          await visit(entryPath, depth + 1);
        }
        continue;
      }

      if (!entry.isFile() || isSecretLikeFile(entry.name)) {
        skippedFiles += 1;
        continue;
      }

      const extension = extname(entry.name).toLowerCase();

      if (!sourceExtensions.has(extension)) {
        skippedFiles += 1;
        continue;
      }

      const stats = await stat(entryPath);

      if (stats.size > options.maxFileBytes) {
        skippedFiles += 1;
        continue;
      }

      const summary = await summarizeFile(rootPath, entryPath, stats.size, options.includeSource);
      const { content: _content, ...fileSummary } = summary;
      files.push(fileSummary);

      if (options.includeSource && summary.content !== undefined) {
        sourceFiles.push({ ...fileSummary, content: summary.content });
      }

      if (files.length >= options.maxFiles) {
        truncated = true;
      }
    }
  };

  await visit(rootPath, 0);
  files.sort((a, b) => a.path.localeCompare(b.path));
  sourceFiles.sort((a, b) => a.path.localeCompare(b.path));

  return {
    files,
    ...(options.includeSource ? { sourceFiles } : {}),
    indexStats: {
      indexedFiles: files.length,
      skippedFiles,
      truncated,
      maxDepth: options.maxDepth,
      maxFileBytes: options.maxFileBytes,
    },
  };
};

export const scanProjectContext = async (
  rootPath: string,
  options: ProjectScanOptions = {},
): Promise<ProjectContext> => {
  const entries = await readdir(rootPath, { withFileTypes: true });
  const configFiles = entries
    .filter((entry) => entry.isFile() && configPatterns.some((pattern) => pattern.test(entry.name)))
    .map((entry) => entry.name)
    .sort();
  const directories = entries
    .filter((entry) => entry.isDirectory() && expectedDirectories.has(entry.name))
    .map((entry) => entry.name)
    .sort();
  const packageJson = await readPackageJson(rootPath);

  const context: ProjectContext = {
    rootPath,
    configFiles,
    directories,
  };

  if (packageJson !== undefined) {
    context.packageJson = packageJson;
  }

  if (options.indexProject ?? true) {
    Object.assign(
      context,
      await scanSourceFiles(rootPath, {
        includeSource: options.includeSource ?? false,
        maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
        maxFiles: options.maxFiles ?? DEFAULT_MAX_FILES,
        maxFileBytes: options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
      }),
    );
  }

  return context;
};

const hasDependency = (context: ProjectContext, dependencyName: string): boolean => {
  const dependencies = {
    ...context.packageJson?.dependencies,
    ...context.packageJson?.devDependencies,
  };
  return dependencyName in dependencies;
};

const hasConfig = (context: ProjectContext, prefix: string): boolean =>
  context.configFiles.some((file) => file.startsWith(prefix));

const detection = (
  name: string,
  category: DetectedItem["category"],
  evidence: string[],
  baseConfidence: number,
): DetectedItem | null => {
  if (evidence.length === 0) {
    return null;
  }

  return {
    name,
    category,
    confidence: Math.min(1, Number((baseConfidence + evidence.length * 0.15).toFixed(2))),
    evidence,
  };
};

export const detectProject = async (rootPath: string): Promise<ProjectDetectionReport> => {
  const context = await scanProjectContext(rootPath);
  const detections = [
    detection(
      "Next.js",
      "framework",
      [
        hasDependency(context, "next") ? "next dependency" : "",
        hasConfig(context, "next.config") ? "next config" : "",
      ].filter(Boolean),
      0.45,
    ),
    detection(
      "React",
      "framework",
      [hasDependency(context, "react") ? "react dependency" : ""].filter(Boolean),
      0.35,
    ),
    detection(
      "Vue",
      "framework",
      [
        hasDependency(context, "vue") ? "vue dependency" : "",
        hasConfig(context, "vue.config") ? "vue config" : "",
      ].filter(Boolean),
      0.4,
    ),
    detection(
      "Angular",
      "framework",
      [
        hasDependency(context, "@angular/core") ? "@angular/core dependency" : "",
        context.configFiles.includes("angular.json") ? "angular.json" : "",
      ].filter(Boolean),
      0.45,
    ),
    detection(
      "Svelte",
      "framework",
      [
        hasDependency(context, "svelte") ? "svelte dependency" : "",
        hasConfig(context, "svelte.config") ? "svelte config" : "",
      ].filter(Boolean),
      0.4,
    ),
    detection(
      "Vite",
      "tooling",
      [
        hasDependency(context, "vite") ? "vite dependency" : "",
        hasConfig(context, "vite.config") ? "vite config" : "",
      ].filter(Boolean),
      0.35,
    ),
    detection(
      "Tailwind CSS",
      "styling",
      [
        hasDependency(context, "tailwindcss") ? "tailwindcss dependency" : "",
        hasConfig(context, "tailwind.config") ? "tailwind config" : "",
      ].filter(Boolean),
      0.4,
    ),
  ].filter((item): item is DetectedItem => item !== null);

  const packageManager = context.configFiles.includes("pnpm-lock.yaml")
    ? "pnpm"
    : context.configFiles.includes("yarn.lock")
      ? "yarn"
      : context.configFiles.includes("package-lock.json")
        ? "npm"
        : "unknown";

  const report: ProjectDetectionReport = {
    rootPath,
    packageManager,
    configFiles: context.configFiles,
    directories: context.directories,
    detections,
    files: context.files ?? [],
  };

  if (context.indexStats !== undefined) {
    report.indexStats = context.indexStats;
  }

  return report;
};
