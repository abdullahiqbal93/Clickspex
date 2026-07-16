import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";

import type {
  ProjectContext,
  ProjectFileKind,
  ProjectFileSummary,
  ProjectIndexSkippedPath,
} from "@clickspex/shared";
import type { Dirent } from "node:fs";

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
  respectGitIgnore?: boolean;
};

type IgnoreRule = {
  pattern: string;
  directoryOnly: boolean;
  anchored: boolean;
  matchesBasename: boolean;
  regex: RegExp;
};

const DEFAULT_MAX_DEPTH = 7;
const DEFAULT_MAX_FILES = 300;
const DEFAULT_MAX_FILE_BYTES = 250_000;
const MAX_REPORTED_SKIPPED_PATHS = 100;
const MAX_REPORTED_TRUNCATED_PATHS = 25;

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

const priorityDirectories = ["src", "app", "pages", "components", "styles"];
const expectedDirectories = new Set(priorityDirectories);
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

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const gitIgnorePatternToRegex = (pattern: string): RegExp => {
  const escaped = pattern
    .split("*")
    .map((part) => escapeRegExp(part))
    .join("[^/]*");
  return new RegExp(`^${escaped}$`);
};

const parseGitIgnore = async (rootPath: string): Promise<IgnoreRule[]> => {
  try {
    const raw = await readFile(join(rootPath, ".gitignore"), "utf8");

    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("!"))
      .map((line) => {
        const anchored = line.startsWith("/");
        const withoutAnchor = anchored ? line.slice(1) : line;
        const directoryOnly = withoutAnchor.endsWith("/");
        const pattern = directoryOnly ? withoutAnchor.slice(0, -1) : withoutAnchor;
        return {
          pattern,
          directoryOnly,
          anchored,
          matchesBasename: !pattern.includes("/"),
          regex: gitIgnorePatternToRegex(pattern),
        };
      });
  } catch {
    return [];
  }
};

const isIgnoredByRule = (
  projectPath: string,
  entryName: string,
  isDirectory: boolean,
  rule: IgnoreRule,
): boolean => {
  if (rule.directoryOnly && !isDirectory) {
    return false;
  }

  if (rule.matchesBasename) {
    return (
      rule.regex.test(entryName) || projectPath.split("/").some((part) => rule.regex.test(part))
    );
  }

  if (rule.anchored) {
    return rule.regex.test(projectPath) || projectPath.startsWith(`${rule.pattern}/`);
  }

  return (
    rule.regex.test(projectPath) ||
    projectPath.endsWith(`/${rule.pattern}`) ||
    projectPath.includes(`/${rule.pattern}/`)
  );
};

const isIgnored = (
  projectPath: string,
  entryName: string,
  isDirectory: boolean,
  ignoreRules: IgnoreRule[],
): boolean =>
  ignoreRules.some((rule) => isIgnoredByRule(projectPath, entryName, isDirectory, rule));

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

const extractClassNames = (content: string, includeCssSelectors: boolean): string[] => {
  const classes: string[] = [];
  const classAttributeRegex = /\bclass(?:Name)?\s*=\s*(["'`])([^"'`]+)\1/g;
  const cssClassRegex = /\.([_a-zA-Z]+[_a-zA-Z0-9-]*)/g;
  let match: RegExpExecArray | null;

  while ((match = classAttributeRegex.exec(content)) !== null) {
    classes.push(...(match[2] ?? "").split(/\s+/));
  }

  if (includeCssSelectors) {
    while ((match = cssClassRegex.exec(content)) !== null) {
      classes.push(match[1] ?? "");
    }
  }

  return uniqueSorted(classes).slice(0, 120);
};

const extractIds = (content: string, includeCssSelectors: boolean): string[] => {
  const ids: string[] = [];
  const idAttributeRegex = /\bid\s*=\s*(["'`])([^"'`]+)\1/g;
  const cssIdRegex = /#([_a-zA-Z]+[_a-zA-Z0-9-]*)/g;
  let match: RegExpExecArray | null;

  while ((match = idAttributeRegex.exec(content)) !== null) {
    ids.push(match[2] ?? "");
  }

  if (includeCssSelectors) {
    while ((match = cssIdRegex.exec(content)) !== null) {
      ids.push(match[1] ?? "");
    }
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
  const isStylesheet = stylesheetExtensions.has(extension);
  const selectors = isStylesheet ? extractCssSelectors(content) : [];

  return {
    path: projectPath,
    kind: classifyFile(projectPath),
    size,
    selectors,
    classNames: extractClassNames(content, isStylesheet),
    ids: extractIds(content, isStylesheet),
    imports: extractImports(content),
    ...(includeSource ? { content } : {}),
  };
};

const entryPriority = (entry: { name: string; isDirectory: () => boolean }): number => {
  if (!entry.isDirectory()) {
    return 100;
  }

  const priority = priorityDirectories.indexOf(entry.name);
  return priority === -1 ? 50 : priority;
};

const sortEntries = <T extends { name: string; isDirectory: () => boolean }>(entries: T[]): T[] =>
  [...entries].sort((a, b) => entryPriority(a) - entryPriority(b) || a.name.localeCompare(b.name));

const recordSkipped = (
  skippedPaths: ProjectIndexSkippedPath[],
  path: string,
  reason: ProjectIndexSkippedPath["reason"],
): void => {
  if (skippedPaths.length < MAX_REPORTED_SKIPPED_PATHS) {
    skippedPaths.push({ path, reason });
  }
};

const recordTruncated = (truncatedPaths: string[], path: string): void => {
  if (truncatedPaths.length < MAX_REPORTED_TRUNCATED_PATHS) {
    truncatedPaths.push(path);
  }
};

const scanSourceFiles = async (
  rootPath: string,
  options: Required<
    Pick<
      ProjectScanOptions,
      "includeSource" | "maxDepth" | "maxFiles" | "maxFileBytes" | "respectGitIgnore"
    >
  >,
): Promise<Pick<ProjectContext, "files" | "sourceFiles" | "indexStats">> => {
  const files: ProjectFileSummary[] = [];
  const sourceFiles: NonNullable<ProjectContext["sourceFiles"]> = [];
  const skippedPaths: ProjectIndexSkippedPath[] = [];
  const truncatedPaths: string[] = [];
  const ignoreRules = options.respectGitIgnore ? await parseGitIgnore(rootPath) : [];
  let skippedFiles = 0;
  let truncated = false;

  const visit = async (directoryPath: string, depth: number): Promise<void> => {
    const directoryProjectPath = toProjectPath(relative(rootPath, directoryPath)) || ".";

    if (truncated) {
      return;
    }

    if (depth > options.maxDepth) {
      truncated = true;
      skippedFiles += 1;
      recordSkipped(skippedPaths, directoryProjectPath, "max_depth");
      recordTruncated(truncatedPaths, directoryProjectPath);
      return;
    }

    let entries: Dirent[];

    try {
      entries = await readdir(directoryPath, { withFileTypes: true });
    } catch {
      skippedFiles += 1;
      recordSkipped(skippedPaths, directoryProjectPath, "read_error");
      return;
    }

    for (const entry of sortEntries(entries)) {
      if (truncated) {
        return;
      }

      const entryPath = join(directoryPath, entry.name);
      const projectPath = toProjectPath(relative(rootPath, entryPath));

      if (entry.isDirectory()) {
        if (skippedDirectories.has(entry.name)) {
          skippedFiles += 1;
          recordSkipped(skippedPaths, projectPath, "directory_ignored");
          continue;
        }

        if (isIgnored(projectPath, entry.name, true, ignoreRules)) {
          skippedFiles += 1;
          recordSkipped(skippedPaths, projectPath, "file_ignored");
          continue;
        }

        await visit(entryPath, depth + 1);
        continue;
      }

      if (!entry.isFile()) {
        skippedFiles += 1;
        recordSkipped(skippedPaths, projectPath, "file_ignored");
        continue;
      }

      if (isSecretLikeFile(entry.name)) {
        skippedFiles += 1;
        recordSkipped(skippedPaths, projectPath, "secret_like");
        continue;
      }

      if (isIgnored(projectPath, entry.name, false, ignoreRules)) {
        skippedFiles += 1;
        recordSkipped(skippedPaths, projectPath, "file_ignored");
        continue;
      }

      const extension = extname(entry.name).toLowerCase();

      if (!sourceExtensions.has(extension)) {
        skippedFiles += 1;
        recordSkipped(skippedPaths, projectPath, "unsupported_extension");
        continue;
      }

      const stats = await stat(entryPath).catch(() => null);

      if (stats === null) {
        skippedFiles += 1;
        recordSkipped(skippedPaths, projectPath, "read_error");
        continue;
      }

      if (stats.size > options.maxFileBytes) {
        skippedFiles += 1;
        recordSkipped(skippedPaths, projectPath, "too_large");
        continue;
      }

      if (files.length >= options.maxFiles) {
        truncated = true;
        skippedFiles += 1;
        recordSkipped(skippedPaths, projectPath, "max_files");
        recordTruncated(truncatedPaths, projectPath);
        return;
      }

      const summary = await summarizeFile(rootPath, entryPath, stats.size, options.includeSource);
      const { content: _content, ...fileSummary } = summary;
      files.push(fileSummary);

      if (options.includeSource && summary.content !== undefined) {
        sourceFiles.push({ ...fileSummary, content: summary.content });
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
      maxFiles: options.maxFiles,
      maxFileBytes: options.maxFileBytes,
      skippedPaths,
      truncatedPaths,
    },
  };
};

export const scanProjectContext = async (
  rootPath: string,
  options: ProjectScanOptions = {},
): Promise<ProjectContext> => {
  const entries = sortEntries(await readdir(rootPath, { withFileTypes: true }));
  const configFiles = entries
    .filter((entry) => entry.isFile() && configPatterns.some((pattern) => pattern.test(entry.name)))
    .map((entry) => entry.name)
    .sort();
  const directories = entries
    .filter((entry) => entry.isDirectory() && expectedDirectories.has(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => priorityDirectories.indexOf(a) - priorityDirectories.indexOf(b));
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
        respectGitIgnore: options.respectGitIgnore ?? true,
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
