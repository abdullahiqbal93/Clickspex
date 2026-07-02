export { cssAdapter, generateCssFromChangeIntent } from "./cssAdapter.js";
export { scaffoldAdapters } from "./scaffoldAdapters.js";
export { generateTailwindClassesFromChangeIntent, tailwindAdapter } from "./tailwindAdapter.js";

export type {
  AdapterDetectionResult,
  AdapterExport,
  FrameworkAdapter,
  PatchSuggestion,
  ProjectContext,
} from "@ui-buddy/shared";
