import { buildCssRule, styleChangesToRecord } from "@ui-devtools/core/styleDiff";

import type {
  AdapterDetectionResult,
  AdapterExport,
  FrameworkAdapter,
  PatchSuggestion,
  ProjectContext,
  UIChangeIntent,
} from "@ui-devtools/shared";

export const generateCssFromChangeIntent = (changeIntent: UIChangeIntent): string =>
  buildCssRule(changeIntent.target.selector, styleChangesToRecord(changeIntent.changes));

const detectCss = (projectContext: ProjectContext): AdapterDetectionResult => {
  const hasCssEvidence = projectContext.configFiles.some((file) => file.endsWith(".css"));

  return {
    adapterId: "css",
    name: "CSS",
    detected: hasCssEvidence,
    confidence: hasCssEvidence ? 0.7 : 0.3,
    evidence: hasCssEvidence ? ["CSS files were found in the project summary."] : [],
  };
};

const generateCssPatch = (changeIntent: UIChangeIntent): PatchSuggestion[] => {
  const css = generateCssFromChangeIntent(changeIntent);

  return [
    {
      adapterId: "css",
      title: "Apply visual changes in a stylesheet",
      confidence: 0.75,
      explanation:
        "Generated a standalone CSS rule for the selected element. v1 does not choose a source file automatically.",
      filesToChange: [],
      diffPreview: [
        "--- a/styles.css",
        "+++ b/styles.css",
        "@@",
        ...css.split("\n").map((line) => `+${line}`),
      ].join("\n"),
      warnings: ["Review selector stability before applying this rule to source code."],
      manualSteps: ["Paste the rule into the stylesheet that owns this component or page."],
    },
  ];
};

const generateCssExport = (changeIntent: UIChangeIntent): AdapterExport => ({
  adapterId: "css",
  label: "CSS",
  content: generateCssFromChangeIntent(changeIntent),
  warnings: [],
});

export const cssAdapter: FrameworkAdapter = {
  id: "css",
  name: "CSS",
  detect: detectCss,
  generatePatch: generateCssPatch,
  generateExport: generateCssExport,
};
