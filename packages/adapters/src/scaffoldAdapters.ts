import { createUnsupportedPatchSuggestion } from "@ui-devtools/shared";

import type {
  AdapterDetectionResult,
  AdapterExport,
  FrameworkAdapter,
  ProjectContext,
  UIChangeIntent,
} from "@ui-devtools/shared";

const scaffoldDefinitions = [
  ["react", "React"],
  ["next", "Next.js"],
  ["vue", "Vue"],
  ["angular", "Angular"],
  ["svelte", "Svelte"],
  ["shadcn", "shadcn/ui"],
  ["mui", "MUI"],
  ["css-modules", "CSS Modules"],
  ["scss", "SCSS"],
  ["styled-components", "styled-components"],
] as const;

const createScaffoldAdapter = (id: string, name: string): FrameworkAdapter => ({
  id,
  name,
  detect: (_projectContext: ProjectContext): AdapterDetectionResult => ({
    adapterId: id,
    name,
    detected: false,
    confidence: 0,
    evidence: [],
  }),
  generatePatch: () => [createUnsupportedPatchSuggestion(id, `${name} patch generation`)],
  generateExport: (_changeIntent: UIChangeIntent): AdapterExport => ({
    adapterId: id,
    label: name,
    content: "",
    warnings: ["This adapter does not generate real patches in v1."],
  }),
});

// TODO(v2): Implement framework-aware source discovery and patch generation for these adapters.
export const scaffoldAdapters: FrameworkAdapter[] = scaffoldDefinitions.map(([id, name]) =>
  createScaffoldAdapter(id, name),
);
