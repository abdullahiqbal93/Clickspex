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

/** Parse a free-form CSS declaration string into a property/value record. */
const parseCssDeclarations = (rawCss: string): Record<string, string> => {
  const declarations: Record<string, string> = {};

  for (const part of rawCss.replace(/\/\*[\s\S]*?\*\//g, "").split(";")) {
    const trimmed = part.trim();
    const colon = trimmed.indexOf(":");

    if (colon <= 0) {
      continue;
    }

    const property = trimmed.slice(0, colon).trim();
    const value = trimmed
      .slice(colon + 1)
      .trim()
      .replace(/\s*!important\s*$/i, "");

    if (property.length > 0 && value.length > 0) {
      declarations[property] = value;
    }
  }

  return declarations;
};

/** A concrete, writable edit to a single stylesheet file. */
export type CssFileEdit = {
  path: string;
  previousContent: string;
  nextContent: string;
  confidence: number;
};

/**
 * Resolve the exact file edit for an intent: pick the best indexed stylesheet,
 * upsert the changed declarations (and any raw CSS), and return the new content
 * so callers can preview a diff or write the file. Returns null when nothing
 * changed or no source stylesheet is available.
 */
export const computeCssFileEdit = (
  changeIntent: UIChangeIntent,
  projectContext?: ProjectContext,
): CssFileEdit | null => {
  const ruleRecords = styleChangesToRuleRecords(changeIntent.target.selector, changeIntent.changes);
  const rawDeclarations =
    changeIntent.rawCss !== undefined ? parseCssDeclarations(changeIntent.rawCss) : {};
  const hasRawCss = Object.keys(rawDeclarations).length > 0;

  if (ruleRecords.length === 0 && !hasRawCss) {
    return null;
  }

  const selected = selectStylesheet(projectContext, changeIntent);

  if (selected === null) {
    return null;
  }

  const baseRecords = ruleRecords.filter((record) => record.responsiveTarget === "all");
  const responsiveChanges = changeIntent.changes.filter(
    (change) => getStyleChangeResponsiveTarget(change) !== "all",
  );

  let content = baseRecords.reduce(
    (current, record) => upsertCssRule(current, record.selector, record.styles),
    selected.file.content,
  );

  if (hasRawCss) {
    content = upsertCssRule(content, changeIntent.target.selector, rawDeclarations);
  }

  if (responsiveChanges.length > 0) {
    content = `${content.trimEnd()}\n\n${buildCssRulesFromChanges(
      changeIntent.target.selector,
      responsiveChanges,
    )}\n`;
  }

  return {
    path: selected.file.path,
    previousContent: selected.file.content,
    nextContent: content,
    confidence: selected.confidence,
  };
};

const generateCssPatch = (
  changeIntent: UIChangeIntent,
  projectContext?: ProjectContext,
): PatchSuggestion[] => {
  const edit = computeCssFileEdit(changeIntent, projectContext);

  if (edit === null) {
    const hasChanges =
      styleChangesToRuleRecords(changeIntent.target.selector, changeIntent.changes).length > 0 ||
      (changeIntent.rawCss !== undefined && changeIntent.rawCss.trim().length > 0);

    if (!hasChanges) {
      return standaloneCssPatch(changeIntent, "No style declarations were changed.");
    }

    return standaloneCssPatch(
      changeIntent,
      projectContext === undefined
        ? "No project context was provided for source-aware CSS placement."
        : "No indexed stylesheet source file was available for CSS placement.",
    );
  }

  const responsiveChanges = changeIntent.changes.filter(
    (change) => getStyleChangeResponsiveTarget(change) !== "all",
  );

  return [
    {
      adapterId: "css",
      title: `Apply CSS rule in ${edit.path}`,
      confidence: edit.confidence,
      explanation:
        "Selected the best indexed stylesheet by matching selectors, ids, and classes from the captured element.",
      filesToChange: [edit.path],
      diffPreview: createUnifiedDiff(edit.path, edit.previousContent, edit.nextContent),
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
