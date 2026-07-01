import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  changeIntentInputSchema,
  handleDetectFramework,
  handleGenerateExport,
  handlePreviewPatchSuggestions,
  handleReadProjectSummary,
  handleScanProject,
  pathInputSchema,
} from "./tools.js";

import type { ChangeIntentInput, PathInput } from "./tools.js";

const toContent = (result: unknown) => ({
  content: [
    {
      type: "text" as const,
      text: JSON.stringify(result, null, 2),
    },
  ],
});

const server = new McpServer({ name: "ui-devtools-mcp", version: "0.1.0" });

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
  "read_project_summary",
  "Return package.json summary and config file list.",
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
  "Accept a UIChangeIntent JSON object and return PatchSuggestion objects.",
  changeIntentInputSchema.shape,
  async (input: ChangeIntentInput) => toContent(await handlePreviewPatchSuggestions(input)),
);

const transport = new StdioServerTransport();
await server.connect(transport);
