import {
  buildCssRulesFromChanges,
  buildMediaQueryFromResponsiveTarget,
  buildStyleTargetSelector,
  getStyleChangeResponsiveTarget,
  getStyleChangeState,
  styleChangesToRuleRecords,
} from "@clickspex/core/styleDiff";
import { parseCssDeclarations } from "@clickspex/shared";
import postcss, { type AtRule, type Container, type Root, type Rule } from "postcss";

import { createUnifiedDiff } from "./diffPreview.js";

import type {
  AdapterDetectionResult,
  AdapterExport,
  FrameworkAdapter,
  PatchSuggestion,
  ProjectContext,
  ProjectSourceFile,
  StyleChange,
  UIChangeIntent,
} from "@clickspex/shared";

export const generateCssFromChangeIntent = (changeIntent: UIChangeIntent): string =>
  buildCssRulesFromChanges(changeIntent.target.selector, changeIntent.changes);

const detectCss = (projectContext: ProjectContext): AdapterDetectionResult => {
  const stylesheetFiles = projectContext.files?.filter((file) => file.kind === "stylesheet") ?? [];
  const plainCssFiles = stylesheetFiles.filter((file) => isPlainWritableCssFile(file.path));
  const hasCssEvidence =
    stylesheetFiles.length > 0 || projectContext.configFiles.some((file) => file.endsWith(".css"));

  return {
    adapterId: "css",
    name: "CSS",
    detected: hasCssEvidence,
    confidence: plainCssFiles.length > 0 ? 0.75 : hasCssEvidence ? 0.45 : 0.3,
    evidence:
      plainCssFiles.length > 0
        ? [`${plainCssFiles.length} plain CSS stylesheet file(s) indexed.`]
        : stylesheetFiles.length > 0
          ? [
              `${stylesheetFiles.length} stylesheet file(s) indexed, but none are writable plain CSS.`,
            ]
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

const splitSelectorList = (selector: string): string[] =>
  selector
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

const isPlainWritableCssFile = (path: string): boolean => {
  const lower = path.toLowerCase();
  return lower.endsWith(".css") && !lower.endsWith(".module.css");
};

const ruleContainsSelector = (rule: Rule, selector: string): boolean =>
  splitSelectorList(rule.selector).includes(selector);

const parseStylesheet = (file: ProjectSourceFile): Root | null => {
  try {
    return postcss.parse(file.content, { from: file.path });
  } catch {
    return null;
  }
};

const hasExactSelectorInAst = (root: Root, selector: string): boolean => {
  let found = false;
  root.walkRules((rule) => {
    if (ruleContainsSelector(rule, selector)) {
      found = true;
    }
  });
  return found;
};

const selectStylesheet = (
  projectContext: ProjectContext | undefined,
  changeIntent: UIChangeIntent,
): { file: ProjectSourceFile; root: Root; confidence: number } | null => {
  const candidates =
    projectContext?.sourceFiles?.filter(
      (file) => file.kind === "stylesheet" && isPlainWritableCssFile(file.path),
    ) ?? [];

  const exactMatches = candidates.flatMap((file) => {
    const root = parseStylesheet(file);

    if (root === null || !hasExactSelectorInAst(root, changeIntent.target.selector)) {
      return [];
    }

    return [{ file, root, confidence: 0.95 }];
  });

  return exactMatches.length === 1 ? exactMatches[0]! : null;
};

type CssDeclarationOperation =
  { kind: "set"; property: string; value: string } | { kind: "remove"; property: string };

type CssRuleOperation = {
  selector: string;
  mediaQuery: string | null;
  operations: CssDeclarationOperation[];
};

const operationsFromChanges = (
  selector: string,
  changes: readonly StyleChange[],
): CssRuleOperation[] => {
  const grouped = new Map<string, CssRuleOperation>();

  for (const change of changes) {
    if (change.selector !== selector) {
      continue;
    }

    const state = getStyleChangeState(change);
    const responsiveTarget = getStyleChangeResponsiveTarget(change);
    const ruleSelector = buildStyleTargetSelector(selector, state);
    const mediaQuery = buildMediaQueryFromResponsiveTarget(responsiveTarget);
    const key = `${mediaQuery ?? "all"}::${ruleSelector}`;
    const group = grouped.get(key) ?? { selector: ruleSelector, mediaQuery, operations: [] };

    group.operations.push(
      change.afterValue.trim().length === 0
        ? { kind: "remove", property: change.property }
        : { kind: "set", property: change.property, value: change.afterValue },
    );
    grouped.set(key, group);
  }

  return Array.from(grouped.values()).filter((record) => record.operations.length > 0);
};

const rawCssOperations = (changeIntent: UIChangeIntent): CssRuleOperation[] => {
  if (changeIntent.rawCss === undefined) {
    return [];
  }

  const operations = parseCssDeclarations(changeIntent.rawCss)
    .filter((declaration) => declaration.enabled && declaration.value.trim().length > 0)
    .map<CssDeclarationOperation>((declaration) => ({
      kind: "set",
      property: declaration.property.trim(),
      value: declaration.value.trim().replace(/\s*!important\s*$/i, ""),
    }));

  return operations.length === 0
    ? []
    : [{ selector: changeIntent.target.selector, mediaQuery: null, operations }];
};

const firstRuleMatchingSelector = (container: Container, selector: string): Rule | null => {
  let match: Rule | null = null;

  container.walkRules((rule) => {
    if (match === null && ruleContainsSelector(rule, selector)) {
      match = rule;
    }
  });

  return match;
};

const findOrCreateMedia = (root: Root, mediaQuery: string): AtRule => {
  let match: AtRule | null = null;

  root.walkAtRules("media", (rule) => {
    if (match === null && rule.params.trim() === mediaQuery) {
      match = rule;
    }
  });

  if (match !== null) {
    return match;
  }

  const media = postcss.atRule({ name: "media", params: mediaQuery });
  root.append(media);
  return media;
};

const ensureRule = (container: Container, selector: string): Rule => {
  const existing = firstRuleMatchingSelector(container, selector);

  if (existing !== null) {
    return existing;
  }

  const rule = postcss.rule({ selector });
  container.append(rule);
  return rule;
};

const applyOperationsToRule = (
  rule: Rule,
  operations: readonly CssDeclarationOperation[],
): void => {
  for (const operation of operations) {
    const existingDeclarations = rule.nodes?.filter(
      (node) => node.type === "decl" && node.prop === operation.property,
    );

    if (operation.kind === "remove") {
      existingDeclarations?.forEach((declaration) => declaration.remove());
      continue;
    }

    const [first, ...duplicates] = existingDeclarations ?? [];

    if (first !== undefined && first.type === "decl") {
      first.value = operation.value;
      duplicates.forEach((declaration) => declaration.remove());
    } else {
      rule.append(postcss.decl({ prop: operation.property, value: operation.value }));
    }
  }

  if ((rule.nodes ?? []).filter((node) => node.type === "decl").length === 0) {
    rule.remove();
  }
};

const applyRuleOperations = (root: Root, operations: readonly CssRuleOperation[]): void => {
  for (const operation of operations) {
    const container =
      operation.mediaQuery === null ? root : findOrCreateMedia(root, operation.mediaQuery);
    const rule = ensureRule(container, operation.selector);
    applyOperationsToRule(rule, operation.operations);
  }
};

const unsupportedSourceWarning = (projectContext: ProjectContext | undefined): string => {
  if (projectContext === undefined) {
    return "No project context was provided for source-aware CSS placement.";
  }

  const sourceFiles = projectContext.sourceFiles ?? [];
  const stylesheets = sourceFiles.filter((file) => file.kind === "stylesheet");
  const unsupported = stylesheets.filter((file) => !isPlainWritableCssFile(file.path));

  if (unsupported.length > 0 && stylesheets.length === unsupported.length) {
    return "Only plain .css files are writable. CSS modules, Sass, Less, and other dialects are preview-only.";
  }

  return "No exact single plain-CSS owner rule was found. Automatic apply requires exactly one matching selector in one .css file.";
};

/** A concrete, writable edit to a single plain CSS stylesheet file. */
export type CssFileEdit = {
  path: string;
  previousContent: string;
  nextContent: string;
  confidence: number;
};

/**
 * Resolve the exact file edit for an intent. Automatic writes are intentionally
 * limited to a single ordinary .css file containing the exact captured selector.
 * Unsupported dialects and ambiguous ownership return null so callers keep the
 * operation preview/manual-only.
 */
export const computeCssFileEdit = (
  changeIntent: UIChangeIntent,
  projectContext?: ProjectContext,
): CssFileEdit | null => {
  const operations = [
    ...operationsFromChanges(changeIntent.target.selector, changeIntent.changes),
    ...rawCssOperations(changeIntent),
  ];

  if (operations.length === 0) {
    return null;
  }

  const selected = selectStylesheet(projectContext, changeIntent);

  if (selected === null) {
    return null;
  }

  applyRuleOperations(selected.root, operations);
  const nextContent = selected.root.toString();

  if (nextContent === selected.file.content) {
    return null;
  }

  return {
    path: selected.file.path,
    previousContent: selected.file.content,
    nextContent,
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

    return standaloneCssPatch(changeIntent, unsupportedSourceWarning(projectContext));
  }

  return [
    {
      adapterId: "css",
      title: `Apply CSS rule in ${edit.path}`,
      confidence: edit.confidence,
      explanation:
        "Selected the single plain CSS stylesheet containing the exact captured selector and updated it with PostCSS AST operations.",
      filesToChange: [edit.path],
      diffPreview: createUnifiedDiff(edit.path, edit.previousContent, edit.nextContent),
      warnings: [
        "Automatic source writes are limited to plain .css files with one exact selector owner.",
        "CSS modules, Sass, Less, Tailwind, and framework source files remain preview-only.",
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
