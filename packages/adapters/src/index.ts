export {
  cssAdapter,
  computeCssFileEdit,
  generateCssFromChangeIntent,
  type CssFileEdit,
} from "./cssAdapter.js";
export { createUnifiedDiff } from "./diffPreview.js";
export { scaffoldAdapters } from "./scaffoldAdapters.js";
export { generateTailwindClassesFromChangeIntent, tailwindAdapter } from "./tailwindAdapter.js";

export type {
  AdapterDetectionResult,
  AdapterExport,
  FrameworkAdapter,
  PatchSuggestion,
  ProjectContext,
} from "@ui-buddy/shared";
