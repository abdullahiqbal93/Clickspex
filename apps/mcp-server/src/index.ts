import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  changeIntentInputSchema,
  generateSessionExportInputSchema,
  handleDetectFramework,
  handleGenerateExport,
  handleGenerateSessionExport,
  handleIndexProject,
  handlePreviewPatchSuggestions,
  handlePreviewSession,
  handleReadProjectSummary,
  handleScanProject,
  patchPreviewInputSchema,
  pathInputSchema,
  previewSessionInputSchema,
} from "./tools.js";

import type {
  ChangeIntentInput,
  GenerateSessionExportInput,
  PathInput,
  PatchPreviewInput,
  PreviewSessionInput,
} from "./tools.js";

const toContent = (result: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(result, null, 2),
    },
  ],
});

const server = new McpServer({ name: "ui-buddy-mcp", version: "0.1.0" });

server.tool(
  "scan_project",
  "Scan a local project path and return a read-only file summary.",
  pathInputSchema.shape,
  async (input: PathInput) => toContent(await handleScanProject(input)),
);

server.tool(
  "detect_framework",
  "Return framework detection results for a local project path.",
  pathInputSchema.shape,
  async (input: PathInput) => toContent(await handleDetectFramework(input)),
);

server.tool(
  "index_project",
  "Build a bounded source index with file kinds, selectors, classes, ids, and imports.",
  pathInputSchema.shape,
  async (input: PathInput) => toContent(await handleIndexProject(input)),
);

server.tool(
  "read_project_summary",
  "Return package.json summary, config files, directories, and indexed source metadata.",
  pathInputSchema.shape,
  async (input: PathInput) => toContent(await handleReadProjectSummary(input)),
);

server.tool(
  "generate_export_from_change_intent",
  "Accept a UIChangeIntent JSON object and return CSS and Tailwind exports.",
  changeIntentInputSchema.shape,
  async (input: ChangeIntentInput) => toContent(handleGenerateExport(input)),
);

server.tool(
  "preview_patch_suggestions",
  "Accept a UIChangeIntent JSON object plus optional projectPath and return PatchSuggestion objects.",
  patchPreviewInputSchema.shape,
  async (input: PatchPreviewInput) => toContent(await handlePreviewPatchSuggestions(input)),
);

server.tool(
  "generate_export_from_session",
  "Accept a UIChangeSession JSON object and return per-element CSS/Tailwind exports plus structural edits.",
  generateSessionExportInputSchema.shape,
  (input: GenerateSessionExportInput) => toContent(handleGenerateSessionExport(input)),
);

server.tool(
  "preview_session_patches",
  "Accept a UIChangeSession JSON object plus optional projectPath and return PatchSuggestion objects for every edited element.",
  previewSessionInputSchema.shape,
  async (input: PreviewSessionInput) => toContent(await handlePreviewSession(input)),
);

const transport = new StdioServerTransport();
await server.connect(transport);
