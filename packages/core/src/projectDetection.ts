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
};

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ProjectContext } from "@ui-devtools/shared";

type PackageJson = {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

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

const expectedDirectories = new Set(["src", "app", "pages", "components"]);

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

export const scanProjectContext = async (rootPath: string): Promise<ProjectContext> => {
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

  return {
    rootPath,
    packageManager,
    configFiles: context.configFiles,
    directories: context.directories,
    detections,
  };
};
