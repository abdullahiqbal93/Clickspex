import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { cssAdapter, scaffoldAdapters, tailwindAdapter } from "@ui-devtools/adapters";
import { detectProject, scanProjectContext } from "@ui-devtools/core/project";
import { z } from "zod";

import type { UIChangeIntent } from "@ui-devtools/shared";

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  top: z.number(),
  right: z.number(),
  bottom: z.number(),
  left: z.number(),
});

const boxSideSchema = z.object({
  top: z.string(),
  right: z.string(),
  bottom: z.string(),
  left: z.string(),
});

const boxModelSchema = z.object({
  margin: boxSideSchema,
  border: boxSideSchema,
  padding: boxSideSchema,
  content: z.object({ width: z.string(), height: z.string() }),
});

const styleChangeSchema = z.object({
  selector: z.string(),
  property: z.string(),
  beforeValue: z.string(),
  afterValue: z.string(),
  timestamp: z.string(),
});

const accessibilityNoteSchema = z.object({
  id: z.string(),
  severity: z.enum(["info", "warning", "error"]),
  title: z.string(),
  message: z.string(),
});

export const pathInputSchema = z.object({ path: z.string().min(1) });
export type PathInput = z.infer<typeof pathInputSchema>;

export const changeIntentInputSchema = z.object({
  changeIntent: z.object({
    id: z.string(),
    timestamp: z.string(),
    pageUrl: z.string(),
    viewport: z.object({ width: z.number(), height: z.number(), devicePixelRatio: z.number() }),
    target: z.object({
      tagName: z.string(),
      id: z.string().optional(),
      classList: z.array(z.string()),
      textPreview: z.string().optional(),
      selector: z.string(),
      domPath: z.string(),
      attributes: z.record(z.string()),
    }),
    before: z.object({ styles: z.record(z.string()), rect: rectSchema, boxModel: boxModelSchema }),
    after: z.object({
      styles: z.record(z.string()),
      rect: rectSchema.optional(),
      boxModel: boxModelSchema.optional(),
    }),
    changes: z.array(styleChangeSchema),
    accessibilityNotes: z.array(accessibilityNoteSchema),
    visualIntent: z.string().optional(),
    frameworkHints: z.array(z.string()).optional(),
  }),
});
export type ChangeIntentInput = z.infer<typeof changeIntentInputSchema>;

type ToolResult = {
  ok: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
  };
};

const secretPatterns = [/^\.env/i, /secret/i, /credential/i, /token/i, /key$/i];

const isSecretFile = (name: string): boolean =>
  secretPatterns.some((pattern) => pattern.test(name));

const structuredError = (code: string, error: unknown): ToolResult => ({
  ok: false,
  error: {
    code,
    message: error instanceof Error ? error.message : "Unknown MCP tool error",
  },
});

const listFiles = async (rootPath: string, depth = 0): Promise<string[]> => {
  if (depth > 2) {
    return [];
  }

  const entries = await readdir(rootPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || isSecretFile(entry.name)) {
      continue;
    }

    const entryPath = join(rootPath, entry.name);

    if (entry.isDirectory()) {
      const nested = await listFiles(entryPath, depth + 1);
      files.push(...nested.map((file) => join(entry.name, file)));
      continue;
    }

    files.push(entry.name);
  }

  return files.sort();
};

export const handleScanProject = async (input: PathInput): Promise<ToolResult> => {
  try {
    const parsed = pathInputSchema.parse(input);
    const rootPath = resolve(parsed.path);
    const stats = await stat(rootPath);

    if (!stats.isDirectory()) {
      return { ok: false, error: { code: "not_directory", message: "Path is not a directory." } };
    }

    return { ok: true, data: { rootPath, files: await listFiles(rootPath) } };
  } catch (error) {
    return structuredError("scan_project_failed", error);
  }
};

export const handleDetectFramework = async (input: PathInput): Promise<ToolResult> => {
  try {
    const parsed = pathInputSchema.parse(input);
    return { ok: true, data: await detectProject(resolve(parsed.path)) };
  } catch (error) {
    return structuredError("detect_framework_failed", error);
  }
};

export const handleReadProjectSummary = async (input: PathInput): Promise<ToolResult> => {
  try {
    const parsed = pathInputSchema.parse(input);
    const rootPath = resolve(parsed.path);
    const context = await scanProjectContext(rootPath);
    let packageJsonSummary: unknown = null;

    try {
      const rawPackageJson = await readFile(join(rootPath, "package.json"), "utf8");
      const parsedPackageJson = JSON.parse(rawPackageJson) as { name?: string; version?: string };
      packageJsonSummary = {
        name: parsedPackageJson.name ?? null,
        version: parsedPackageJson.version ?? null,
        dependencies: context.packageJson?.dependencies ?? {},
        devDependencies: context.packageJson?.devDependencies ?? {},
      };
    } catch {
      packageJsonSummary = null;
    }

    return {
      ok: true,
      data: { rootPath, packageJson: packageJsonSummary, configFiles: context.configFiles },
    };
  } catch (error) {
    return structuredError("read_project_summary_failed", error);
  }
};

export const handleGenerateExport = (input: ChangeIntentInput): ToolResult => {
  try {
    const parsed = changeIntentInputSchema.parse(input);
    const changeIntent = parsed.changeIntent as UIChangeIntent;
    return {
      ok: true,
      data: {
        css: cssAdapter.generateExport(changeIntent),
        tailwind: tailwindAdapter.generateExport(changeIntent),
      },
    };
  } catch (error) {
    return structuredError("generate_export_failed", error);
  }
};

export const handlePreviewPatchSuggestions = async (
  input: ChangeIntentInput,
): Promise<ToolResult> => {
  try {
    const parsed = changeIntentInputSchema.parse(input);
    const changeIntent = parsed.changeIntent as UIChangeIntent;
    return {
      ok: true,
      data: [
        ...(await cssAdapter.generatePatch(changeIntent)),
        ...(await tailwindAdapter.generatePatch(changeIntent)),
        ...(await Promise.all(
          scaffoldAdapters.map((adapter) => adapter.generatePatch(changeIntent)),
        ).then((patches) => patches.flat())),
      ],
    };
  } catch (error) {
    return structuredError("preview_patch_suggestions_failed", error);
  }
};
