import {
  buildCssRule,
  buildCssRulesFromChanges,
  getStyleChangeResponsiveTarget,
  styleChangesToRuleRecords,
} from "@ui-buddy/core/styleDiff";

import { createUnifiedDiff } from "./diffPreview.js";

import type {
  AdapterDetectionResult,
  AdapterExport,
  FrameworkAdapter,
  PatchSuggestion,
  ProjectContext,
  ProjectSourceFile,
  UIChangeIntent,
} from "@ui-buddy/shared";

export const generateCssFromChangeIntent = (changeIntent: UIChangeIntent): string =>
  buildCssRulesFromChanges(changeIntent.target.selector, changeIntent.changes);

const detectCss = (projectContext: ProjectContext): AdapterDetectionResult => {
  const stylesheetFiles = projectContext.files?.filter((file) => file.kind === "stylesheet") ?? [];
  const hasCssEvidence =
    stylesheetFiles.length > 0 || projectContext.configFiles.some((file) => file.endsWith(".css"));

  return {
    adapterId: "css",
    name: "CSS",
    detected: hasCssEvidence,
    confidence: hasCssEvidence ? 0.7 : 0.3,
    evidence:
      stylesheetFiles.length > 0
        ? [`${stylesheetFiles.length} stylesheet file(s) indexed.`]
        : hasCssEvidence
          ? ["CSS files were found in the project summary."]
          : [],
  };
};

const standaloneCssPatch = (changeIntent: UIChangeIntent, warning?: string): PatchSuggestion[] => {
  const css = generateCssFromChangeIntent(changeIntent);

  return [
    {
      adapterId: "css",
      title: "Apply visual changes in a stylesheet",
      confidence: 0.55,
      explanation:
        "Generated a standalone CSS rule. Provide a project path to produce a source-aware file preview.",
      filesToChange: [],
      diffPreview: [
        "--- a/styles.css",
        "+++ b/styles.css",
        "@@",
        ...css.split("\n").map((line) => `+${line}`),
      ].join("\n"),
      warnings: [warning ?? "Review selector stability before applying this rule to source code."],
      manualSteps: ["Paste the rule into the stylesheet that owns this component or page."],
    },
  ];
};

const selectorCandidatesFor = (changeIntent: UIChangeIntent): string[] => {
  const candidates = [changeIntent.target.selector];

  if (changeIntent.target.id !== undefined && changeIntent.target.id.length > 0) {
    candidates.push(`#${changeIntent.target.id}`);
  }

  candidates.push(...changeIntent.target.classList.map((className) => `.${className}`));

  return Array.from(new Set(candidates));
};

const scoreStylesheet = (file: ProjectSourceFile, changeIntent: UIChangeIntent): number => {
  if (file.kind !== "stylesheet") {
    return 0;
  }

  const selectorCandidates = selectorCandidatesFor(changeIntent);
  let score = 0.45;

  if (selectorCandidates.some((selector) => file.selectors.includes(selector))) {
    score += 0.35;
  }

  if (
    changeIntent.target.id !== undefined &&
    changeIntent.target.id.length > 0 &&
    file.ids.includes(changeIntent.target.id)
  ) {
    score += 0.12;
  }

  const matchingClasses = changeIntent.target.classList.filter((className) =>
    file.classNames.includes(className),
  ).length;

  return Math.min(0.95, score + matchingClasses * 0.08);
};

const selectStylesheet = (
  projectContext: ProjectContext | undefined,
  changeIntent: UIChangeIntent,
): { file: ProjectSourceFile; confidence: number } | null => {
  const candidates =
    projectContext?.sourceFiles?.filter((file) => file.kind === "stylesheet") ?? [];

  if (candidates.length === 0) {
    return null;
  }

  return (
    candidates
      .map((file) => ({ file, confidence: scoreStylesheet(file, changeIntent) }))
      .sort((a, b) => b.confidence - a.confidence || a.file.path.localeCompare(b.file.path))[0] ??
    null
  );
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const upsertCssRule = (
  content: string,
  selector: string,
  declarations: Record<string, string>,
): string => {
  const selectorPattern = escapeRegExp(selector).replaceAll(/\s+/g, "\\s+");
  const ruleRegex = new RegExp(`${selectorPattern}\\s*\\{([\\s\\S]*?)\\}`, "m");
  const declarationLines = Object.entries(declarations).map(
    ([property, value]) => `  ${property}: ${value};`,
  );
  const existingRule = ruleRegex.exec(content);

  if (existingRule === null || existingRule.index === undefined) {
    return `${content.trimEnd()}\n\n${buildCssRule(selector, declarations)}\n`;
  }

  const existingBody = existingRule[1] ?? "";
  const changedProperties = new Set(Object.keys(declarations));
  const retainedLines = existingBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => {
      const propertyMatch = /^([-_a-zA-Z0-9]+)\s*:/.exec(line);
      return propertyMatch === null || !changedProperties.has(propertyMatch[1] ?? "");
    })
    .map((line) => `  ${line}`);
  const nextRule = `${selector} {\n${[...retainedLines, ...declarationLines].join("\n")}\n}`;

  return `${content.slice(0, existingRule.index)}${nextRule}${content.slice(existingRule.index + existingRule[0].length)}`;
};

const generateCssPatch = (
  changeIntent: UIChangeIntent,
  projectContext?: ProjectContext,
): PatchSuggestion[] => {
  const ruleRecords = styleChangesToRuleRecords(changeIntent.target.selector, changeIntent.changes);

  if (ruleRecords.length === 0) {
    return standaloneCssPatch(changeIntent, "No style declarations were changed.");
  }

  const selected = selectStylesheet(projectContext, changeIntent);

  if (selected === null) {
    return standaloneCssPatch(
      changeIntent,
      projectContext === undefined
        ? "No project context was provided for source-aware CSS placement."
        : "No indexed stylesheet source file was available for CSS placement.",
    );
  }

  const baseRecords = ruleRecords.filter((record) => record.responsiveTarget === "all");
  const responsiveChanges = changeIntent.changes.filter(
    (change) => getStyleChangeResponsiveTarget(change) !== "all",
  );
  const contentWithBaseRules = baseRecords.reduce(
    (content, record) => upsertCssRule(content, record.selector, record.styles),
    selected.file.content,
  );
  const nextContent =
    responsiveChanges.length === 0
      ? contentWithBaseRules
      : `${contentWithBaseRules.trimEnd()}\n\n${buildCssRulesFromChanges(
          changeIntent.target.selector,
          responsiveChanges,
        )}\n`;

  return [
    {
      adapterId: "css",
      title: `Apply CSS rule in ${selected.file.path}`,
      confidence: selected.confidence,
      explanation:
        "Selected the best indexed stylesheet by matching selectors, ids, and classes from the captured element.",
      filesToChange: [selected.file.path],
      diffPreview: createUnifiedDiff(selected.file.path, selected.file.content, nextContent),
      warnings: [
        "Review selector stability and cascade order before applying this patch.",
        ...(responsiveChanges.length === 0
          ? []
          : ["Responsive media-query rules were appended for manual placement review."]),
      ],
      manualSteps: ["Apply the diff after confirming this stylesheet owns the selected UI."],
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
