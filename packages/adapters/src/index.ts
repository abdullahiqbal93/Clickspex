export { cssAdapter, generateCssFromChangeIntent } from "./cssAdapter";
export { scaffoldAdapters } from "./scaffoldAdapters";
export { generateTailwindClassesFromChangeIntent, tailwindAdapter } from "./tailwindAdapter";

export type {
  AdapterDetectionResult,
  AdapterExport,
  FrameworkAdapter,
  PatchSuggestion,
  ProjectContext,
} from "@ui-devtools/shared";
