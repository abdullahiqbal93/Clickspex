import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { cssAdapter, scaffoldAdapters, tailwindAdapter } from "@ui-buddy/adapters";
import { detectProject, scanProjectContext } from "@ui-buddy/core/project";
import {
  STYLE_RESPONSIVE_TARGETS,
  STYLE_TARGET_STATES,
  SUPPORTED_STYLE_PROPERTIES,
  type UIChangeIntent,
  type UIChangeSession,
} from "@ui-buddy/shared";
import { z } from "zod";

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
  property: z.enum(SUPPORTED_STYLE_PROPERTIES),
  beforeValue: z.string(),
  afterValue: z.string(),
  timestamp: z.string(),
  // Optional pseudo-state (hover/focus/...). Without this field zod silently
  // strips `state`, so pseudo-state changes were exported as base styles.
  state: z.enum(STYLE_TARGET_STATES).optional(),
  // Same reasoning for responsive breakpoint targets.
  responsiveTarget: z.enum(STYLE_RESPONSIVE_TARGETS).optional(),
});

const accessibilityNoteSchema = z.object({
  id: z.string(),
  severity: z.enum(["info", "warning", "error"]),
  title: z.string(),
  message: z.string(),
});

export const pathInputSchema = z.object({ path: z.string().min(1) });
export type PathInput = z.infer<typeof pathInputSchema>;

const changeIntentObjectSchema = z.object({
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
    fallbackSelectors: z.array(z.string()).optional(),
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
  rawCss: z.string().optional(),
});

export const changeIntentInputSchema = z.object({
  changeIntent: changeIntentObjectSchema,
});
export type ChangeIntentInput = z.infer<typeof changeIntentInputSchema>;

export const patchPreviewInputSchema = changeIntentInputSchema.extend({
  projectPath: z.string().min(1).optional(),
});
export type PatchPreviewInput = z.infer<typeof patchPreviewInputSchema>;

const structuralEditSchema = z.object({
  id: z.string(),
  kind: z.enum(["move", "delete", "text", "image", "attribute"]),
  timestamp: z.string(),
  target: z.object({
    tagName: z.string(),
    id: z.string().optional(),
    classList: z.array(z.string()),
    selector: z.string(),
    domPath: z.string(),
    fallbackSelectors: z.array(z.string()).optional(),
  }),
  summary: z.string(),
  details: z.record(z.string()),
});

const promptStackHintSchema = z.object({
  name: z.string(),
  confidence: z.number().optional(),
  evidence: z.array(z.string()).optional(),
  guidance: z.string().optional(),
  sourceModel: z.string().optional(),
});

const promptClassConventionSchema = z.object({
  name: z.string(),
  stablePatterns: z.array(z.string()).optional(),
  weakPatterns: z.array(z.string()).optional(),
  generatedPatterns: z.array(z.string()).optional(),
  utilityPatterns: z.array(z.string()).optional(),
  cssModulePatterns: z.array(z.string()).optional(),
  notes: z.array(z.string()).optional(),
});

const promptProjectContextSchema = z.object({
  stackHints: z.array(promptStackHintSchema).optional(),
  classConventions: z.array(promptClassConventionSchema).optional(),
  sourceHints: z.array(z.string()).optional(),
  designTokenHints: z.array(z.string()).optional(),
});
const sessionObjectSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  pageUrl: z.string(),
  viewport: z.object({ width: z.number(), height: z.number(), devicePixelRatio: z.number() }),
  elements: z.array(changeIntentObjectSchema),
  structuralEdits: z.array(structuralEditSchema),
  frameworkHints: z.array(z.string()).optional(),
  promptContext: promptProjectContextSchema.optional(),
  stats: z.object({
    editedElements: z.number(),
    styleChanges: z.number(),
    structuralEdits: z.number(),
  }),
});

export const generateSessionExportInputSchema = z.object({ session: sessionObjectSchema });
export type GenerateSessionExportInput = z.infer<typeof generateSessionExportInputSchema>;

export const previewSessionInputSchema = generateSessionExportInputSchema.extend({
  projectPath: z.string().min(1).optional(),
});
export type PreviewSessionInput = z.infer<typeof previewSessionInputSchema>;

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

export const handleIndexProject = async (input: PathInput): Promise<ToolResult> => {
  try {
    const parsed = pathInputSchema.parse(input);
    const rootPath = resolve(parsed.path);
    const context = await scanProjectContext(rootPath);
    return {
      ok: true,
      data: { rootPath, files: context.files ?? [], indexStats: context.indexStats },
    };
  } catch (error) {
    return structuredError("index_project_failed", error);
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
      data: {
        rootPath,
        packageJson: packageJsonSummary,
        configFiles: context.configFiles,
        directories: context.directories,
        files: context.files ?? [],
        indexStats: context.indexStats,
      },
    };
  } catch (error) {
    return structuredError("read_project_summary_failed", error);
  }
};

export const handleGenerateExport = (input: ChangeIntentInput): ToolResult => {
  try {
    const parsed = changeIntentInputSchema.parse(input);
    // zod validates the shared change intent shape before adapter code consumes it.
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
  input: PatchPreviewInput,
): Promise<ToolResult> => {
  try {
    const parsed = patchPreviewInputSchema.parse(input);
    // zod validates the shared change intent shape before adapter code consumes it.
    const changeIntent = parsed.changeIntent as UIChangeIntent;
    const projectContext =
      parsed.projectPath === undefined
        ? undefined
        : await scanProjectContext(resolve(parsed.projectPath), { includeSource: true });

    return {
      ok: true,
      data: [
        ...(await cssAdapter.generatePatch(changeIntent, projectContext)),
        ...(await tailwindAdapter.generatePatch(changeIntent, projectContext)),
        ...(await Promise.all(
          scaffoldAdapters.map((adapter) => adapter.generatePatch(changeIntent, projectContext)),
        ).then((patches) => patches.flat())),
      ],
    };
  } catch (error) {
    return structuredError("preview_patch_suggestions_failed", error);
  }
};

export const handleGenerateSessionExport = (input: GenerateSessionExportInput): ToolResult => {
  try {
    const parsed = generateSessionExportInputSchema.parse(input);
    const session = parsed.session as unknown as UIChangeSession;

    return {
      ok: true,
      data: {
        sessionId: session.id,
        stats: session.stats,
        elements: session.elements.map((intent) => ({
          selector: intent.target.selector,
          css: cssAdapter.generateExport(intent),
          tailwind: tailwindAdapter.generateExport(intent),
          rawCss: intent.rawCss ?? null,
        })),
        structuralEdits: session.structuralEdits.map((edit) => ({
          id: edit.id,
          kind: edit.kind,
          selector: edit.target.selector,
          target: edit.target,
          summary: edit.summary,
          details: edit.details,
          timestamp: edit.timestamp,
        })),
      },
    };
  } catch (error) {
    return structuredError("generate_session_export_failed", error);
  }
};

export const handlePreviewSession = async (input: PreviewSessionInput): Promise<ToolResult> => {
  try {
    const parsed = previewSessionInputSchema.parse(input);
    const session = parsed.session as unknown as UIChangeSession;
    const projectContext =
      parsed.projectPath === undefined
        ? undefined
        : await scanProjectContext(resolve(parsed.projectPath), { includeSource: true });

    const elements: Array<{ selector: string; suggestions: unknown[] }> = [];

    for (const intent of session.elements) {
      const suggestions = [
        ...(await cssAdapter.generatePatch(intent, projectContext)),
        ...(await tailwindAdapter.generatePatch(intent, projectContext)),
        ...(await Promise.all(
          scaffoldAdapters.map((adapter) => adapter.generatePatch(intent, projectContext)),
        ).then((patches) => patches.flat())),
      ];

      elements.push({ selector: intent.target.selector, suggestions });
    }

    return {
      ok: true,
      data: {
        sessionId: session.id,
        stats: session.stats,
        elements,
        structuralEdits: session.structuralEdits.map((edit) => ({
          kind: edit.kind,
          selector: edit.target.selector,
          summary: edit.summary,
        })),
      },
    };
  } catch (error) {
    return structuredError("preview_session_failed", error);
  }
};
