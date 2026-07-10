import {
  buildCssRulesFromChanges,
  getStyleChangeResponsiveTarget,
  getStyleChangeState,
  getStyleResponsiveTargetDefinition,
  mergeStyleChanges,
} from "./styleDiff";

import type {
  AccessibilityNote,
  ElementSnapshot,
  PromptProjectContext,
  StructuralEdit,
  StyleChange,
  UIChangeIntent,
  UIChangeSession,
} from "@ui-buddy/shared";

export type CreateUIChangeIntentInput = {
  pageUrl: string;
  viewport: UIChangeIntent["viewport"];
  target: ElementSnapshot;
  changes: StyleChange[];
  accessibilityNotes?: AccessibilityNote[];
  visualIntent?: string;
  frameworkHints?: string[];
  timestamp?: string;
  id?: string;
};

const createId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `ui-change-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const createUIChangeIntent = ({
  pageUrl,
  viewport,
  target,
  changes,
  accessibilityNotes = [],
  visualIntent,
  frameworkHints,
  timestamp = new Date().toISOString(),
  id = createId(),
}: CreateUIChangeIntentInput): UIChangeIntent => {
  const targetChanges = changes.filter((change) => change.selector === target.selector);
  const afterStyles = mergeStyleChanges(target.computedStyles, targetChanges);
  const intentTarget: UIChangeIntent["target"] = {
    tagName: target.tagName,
    classList: target.classList,
    selector: target.selector,
    domPath: target.domPath,
    attributes: target.attributes,
  };

  if (target.id.length > 0) {
    intentTarget.id = target.id;
  }

  if (target.textPreview.length > 0) {
    intentTarget.textPreview = target.textPreview;
  }

  if (target.fallbackSelectors !== undefined && target.fallbackSelectors.length > 0) {
    intentTarget.fallbackSelectors = target.fallbackSelectors;
  }

  const intent: UIChangeIntent = {
    id,
    timestamp,
    pageUrl,
    viewport,
    target: intentTarget,
    before: {
      styles: target.computedStyles,
      rect: target.rect,
      boxModel: target.boxModel,
    },
    after: {
      styles: afterStyles,
    },
    changes: targetChanges,
    accessibilityNotes,
  };

  if (visualIntent !== undefined) {
    intent.visualIntent = visualIntent;
  }

  if (frameworkHints !== undefined) {
    intent.frameworkHints = frameworkHints;
  }

  return intent;
};

export type SessionElementInput = {
  target: ElementSnapshot;
  changes: StyleChange[];
  rawCss?: string;
  accessibilityNotes?: AccessibilityNote[];
};

export type CreateUIChangeSessionInput = {
  pageUrl: string;
  viewport: UIChangeSession["viewport"];
  elements: SessionElementInput[];
  structuralEdits?: StructuralEdit[];
  frameworkHints?: string[];
  promptContext?: PromptProjectContext;
  timestamp?: string;
  id?: string;
};

/**
 * Build a full editing session from every edited element (style changes + raw
 * CSS) plus structural edits. Only elements that actually changed are kept, so
 * the export reflects the entire session rather than one selected element.
 */
export const createUIChangeSession = ({
  pageUrl,
  viewport,
  elements,
  structuralEdits = [],
  frameworkHints,
  promptContext,
  timestamp = new Date().toISOString(),
  id = createId(),
}: CreateUIChangeSessionInput): UIChangeSession => {
  const intents = elements
    .map((element) => {
      const intent = createUIChangeIntent({
        pageUrl,
        viewport,
        target: element.target,
        changes: element.changes,
        accessibilityNotes: element.accessibilityNotes ?? [],
        timestamp,
      });

      const rawCss = element.rawCss?.trim();

      return rawCss !== undefined && rawCss.length > 0 ? { ...intent, rawCss } : intent;
    })
    .filter(
      (intent) =>
        intent.changes.length > 0 || (intent.rawCss !== undefined && intent.rawCss.length > 0),
    );

  const styleChanges = intents.reduce((total, intent) => total + intent.changes.length, 0);

  return {
    id,
    timestamp,
    pageUrl,
    viewport,
    elements: intents,
    structuralEdits,
    ...(frameworkHints !== undefined && frameworkHints.length > 0 ? { frameworkHints } : {}),
    ...(promptContext !== undefined ? { promptContext } : {}),
    stats: {
      editedElements: intents.length,
      styleChanges,
      structuralEdits: structuralEdits.length,
    },
  };
};

export const summarizeChangeIntentAsMarkdown = (changeIntent: UIChangeIntent): string => {
  const changes = changeIntent.changes
    .map((change) => {
      const state = getStyleChangeState(change);
      const responsiveTarget = getStyleChangeResponsiveTarget(change);
      const responsiveDefinition = getStyleResponsiveTargetDefinition(responsiveTarget);
      const responsiveLabel = responsiveTarget === "all" ? "" : `[${responsiveDefinition.label}] `;
      const stateLabel = state === "base" ? "" : `:${state} `;
      return `- ${responsiveLabel}${stateLabel}${change.property}: ${change.beforeValue} -> ${change.afterValue}`;
    })
    .join("\n");

  const rawCssSection =
    changeIntent.rawCss !== undefined && changeIntent.rawCss.trim().length > 0
      ? ["", "## Raw CSS", "```css", changeIntent.rawCss.trim(), "```"]
      : [];

  return [
    `# UI change ${changeIntent.id}`,
    "",
    `Target: \`${changeIntent.target.selector}\``,
    `Page: ${changeIntent.pageUrl}`,
    "",
    "## Changes",
    changes.length > 0 ? changes : "No visual changes recorded.",
    ...rawCssSection,
  ].join("\n");
};

export const summarizeSessionAsMarkdown = (session: UIChangeSession): string => {
  const header = [
    `# UI change session ${session.id}`,
    "",
    `Page: ${session.pageUrl}`,
    `Elements edited: ${session.stats.editedElements}`,
    `Style changes: ${session.stats.styleChanges}`,
    `Structural edits: ${session.stats.structuralEdits}`,
  ];

  const elementSections = session.elements.map((intent, index) => {
    const changes = intent.changes
      .map((change) => {
        const state = getStyleChangeState(change);
        const responsiveTarget = getStyleChangeResponsiveTarget(change);
        const responsiveDefinition = getStyleResponsiveTargetDefinition(responsiveTarget);
        const responsiveLabel =
          responsiveTarget === "all" ? "" : `[${responsiveDefinition.label}] `;
        const stateLabel = state === "base" ? "" : `:${state} `;
        return `- ${responsiveLabel}${stateLabel}${change.property}: ${change.beforeValue} -> ${change.afterValue}`;
      })
      .join("\n");

    const rawCssSection =
      intent.rawCss !== undefined && intent.rawCss.trim().length > 0
        ? ["", "Raw CSS:", "```css", intent.rawCss.trim(), "```"]
        : [];

    return [
      `## ${index + 1}. \`${intent.target.selector}\``,
      changes.length > 0 ? changes : "No declarative changes.",
      ...rawCssSection,
    ].join("\n");
  });

  const structuralSection =
    session.structuralEdits.length > 0
      ? [
          "## Structural edits",
          ...session.structuralEdits.map(
            (edit) => `- (${edit.kind}) \`${edit.target.selector}\` - ${edit.summary}`,
          ),
        ]
      : [];

  return [...header, "", ...elementSections, "", ...structuralSection].join("\n").trim();
};

const MAX_CLASS_HINTS = 8;

const rawCssToRule = (selector: string, rawCss: string): string => {
  const declarations = rawCss
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration.length > 0)
    .map((declaration) => `  ${declaration};`)
    .join("\n");

  return declarations.length === 0 ? "" : `${selector} {\n${declarations}\n}`;
};

const truncateText = (value: string, max: number): string =>
  value.length > max ? `${value.slice(0, max)}...` : value;

const unique = <T>(values: T[]): T[] => Array.from(new Set(values));

const sourceTextKey = (value: string | undefined): string | null => {
  const key = value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
  return key.length === 0 ? null : key;
};

const compilePattern = (pattern: string): RegExp | null => {
  try {
    return new RegExp(pattern);
  } catch {
    return null;
  }
};

type StackGuidanceRule = {
  id: string;
  label: string;
  patterns: RegExp[];
  sourceModel: string;
  guidance: string;
};

type NonSourceStackRule = {
  id: string;
  patterns: RegExp[];
};

type StackGuidanceResult = {
  displayStack: string;
  confidence: "detected" | "partial" | "unknown";
  lines: string[];
  nonSourceHints: string[];
  sourceModels: string[];
};

const STACK_GUIDANCE_RULES: StackGuidanceRule[] = [
  {
    id: "tailwind",
    label: "Tailwind CSS",
    patterns: [/\btailwind\b/i],
    sourceModel: "utility classes in templates/components",
    guidance:
      "- Tailwind CSS is in use: prefer editing the element's utility classes where the markup/template defines them. Translate target CSS into equivalent Tailwind utilities, using arbitrary values only when no scale token fits.",
  },
  {
    id: "angular",
    label: "Angular",
    patterns: [/\bangular\b/i],
    sourceModel: "Angular templates and component stylesheets",
    guidance:
      "- Angular is in use: find the component template by visible text/attributes, then update the component stylesheet (`.component.scss`/`.component.css`) or bound classes in the template. Respect view encapsulation; use global styles only if the project already scopes this page globally.",
  },
  {
    id: "react-family",
    label: "React / Next.js",
    patterns: [/\breact\b/i, /\bnext(?:\.js)?\b/i],
    sourceModel: "React components, route files, and imported styles",
    guidance:
      "- React/Next-style components may be present: map the element to the owning component, route, or imported stylesheet before editing. Use the project's existing styling method rather than adding unrelated global CSS.",
  },
  {
    id: "vue-family",
    label: "Vue / Nuxt",
    patterns: [/\bvue\b/i, /\bnuxt\b/i],
    sourceModel: "Vue single-file components and imported styles",
    guidance:
      "- Vue/Nuxt may be present: look for the matching single-file component, scoped style block, or imported stylesheet before applying the change.",
  },
  {
    id: "svelte",
    label: "Svelte",
    patterns: [/\bsvelte\b/i, /\bsveltekit\b/i],
    sourceModel: "Svelte component markup and scoped styles",
    guidance:
      "- Svelte may be present: update the matching component markup or scoped style block, preserving existing reactive logic and class bindings.",
  },
  {
    id: "bootstrap",
    label: "Bootstrap",
    patterns: [/\bbootstrap\b/i],
    sourceModel: "Bootstrap utilities plus scoped overrides",
    guidance:
      "- Bootstrap is present: prefer existing Bootstrap utilities or a scoped override in the relevant section stylesheet; avoid changing generic Bootstrap utility classes globally and avoid `!important` unless the project already requires it.",
  },
  {
    id: "jquery-static",
    label: "jQuery / static HTML",
    patterns: [/\bjquery\b/i, /\bstatic\b/i, /\bhtml\b/i],
    sourceModel: "HTML/templates plus shared stylesheets",
    guidance:
      "- The page may be static, server-rendered, or jQuery-enhanced: find the template/HTML and the stylesheet that owns this section before editing; do not assume a component-file structure.",
  },
];

const NON_SOURCE_STACK_RULES: NonSourceStackRule[] = [
  {
    id: "analytics",
    patterns: [
      /\bgoogle analytics\b/i,
      /\bgoogle tag manager\b/i,
      /\bgtm\b/i,
      /\bga4\b/i,
      /\banalytics\b/i,
    ],
  },
  {
    id: "monitoring",
    patterns: [/\bsentry\b/i, /\bhotjar\b/i, /\bsegment\b/i, /\bposthog\b/i, /\bplausible\b/i],
  },
  {
    id: "marketing-pixel",
    patterns: [/\bmeta pixel\b/i, /\bfacebook pixel\b/i, /\bpixel\b/i, /\bads?\b/i],
  },
];

const isNonSourceStackHint = (hint: string): boolean =>
  NON_SOURCE_STACK_RULES.some((rule) => rule.patterns.some((pattern) => pattern.test(hint)));

const stackHintNames = (
  frameworkHints: string[] | undefined,
  promptContext: PromptProjectContext | undefined,
): string[] =>
  unique(
    [
      ...(frameworkHints ?? []),
      ...(promptContext?.stackHints?.map((hint) => hint.name) ?? []),
    ].filter((hint) => hint.trim().length > 0),
  );

const stackRuleMatchesHint = (rule: StackGuidanceRule, hint: string): boolean =>
  rule.patterns.some((pattern) => pattern.test(hint));

const frameworkGuidance = (
  frameworkHints: string[] | undefined,
  promptContext: PromptProjectContext | undefined,
): StackGuidanceResult => {
  const hints = stackHintNames(frameworkHints, promptContext);
  const sourceHints = hints.filter((hint) => !isNonSourceStackHint(hint));
  const nonSourceHints = hints.filter(isNonSourceStackHint);
  const sourceStackHints =
    promptContext?.stackHints?.filter((hint) => sourceHints.includes(hint.name)) ?? [];
  const matchedRules = STACK_GUIDANCE_RULES.filter((rule) =>
    sourceHints.some((hint) => stackRuleMatchesHint(rule, hint)),
  );
  const recognizedHints = sourceHints.filter((hint) =>
    matchedRules.some((rule) => stackRuleMatchesHint(rule, hint)),
  );
  const unrecognizedHints = sourceHints.filter((hint) => !recognizedHints.includes(hint));
  const customStackGuidance = sourceStackHints
    .filter((hint) => hint.guidance !== undefined && hint.guidance.trim().length > 0)
    .map((hint) => `- Project-specific stack guidance (${hint.name}): ${hint.guidance!.trim()}`);
  const contextLines = [
    ...(promptContext?.sourceHints?.map((hint) => `- Project source hint: ${hint}`) ?? []),
    ...(promptContext?.designTokenHints?.map((hint) => `- Project design-token hint: ${hint}`) ??
      []),
    ...(promptContext?.classConventions?.flatMap(
      (convention) =>
        convention.notes?.map((note) => `- Class convention note (${convention.name}): ${note}`) ??
        [],
    ) ?? []),
  ];
  const lines: string[] = [];

  if (sourceHints.length === 0) {
    lines.push(
      "- Stack detection is unavailable. Verify whether the source is component-based, server-rendered, CMS/theme-driven, static HTML/CSS, Web Components, email markup, or another architecture before deciding where to edit.",
    );
  } else if (matchedRules.length === 0 && customStackGuidance.length === 0) {
    lines.push(
      `- Stack detection is uncertain. Captured source hints (${sourceHints.join(", ")}) do not match built-in guidance, so inspect package/config/template files before choosing an implementation style.`,
    );
  } else if (unrecognizedHints.length > 0) {
    lines.push(
      `- Stack detection is partial. Unrecognized source hints: ${unrecognizedHints.join(", ")}. Treat the guidance below as provisional and verify the real source structure first.`,
    );
  }

  lines.push(...matchedRules.map((rule) => rule.guidance));
  lines.push(...customStackGuidance);
  lines.push(...contextLines);
  lines.push(
    "- Reuse the project's existing design tokens / CSS variables / spacing scale when a value matches one, instead of hardcoding a raw literal that duplicates the design system.",
  );

  return {
    displayStack: sourceHints.length > 0 ? sourceHints.join(", ") : "unknown",
    confidence:
      sourceHints.length === 0 || (matchedRules.length === 0 && customStackGuidance.length === 0)
        ? "unknown"
        : unrecognizedHints.length > 0
          ? "partial"
          : "detected",
    lines,
    nonSourceHints,
    sourceModels: unique([
      ...matchedRules.map((rule) => rule.sourceModel),
      ...sourceStackHints
        .map((hint) => hint.sourceModel)
        .filter((model): model is string => model !== undefined && model.trim().length > 0),
    ]),
  };
};

type CollapsedStyleChange = StyleChange & {
  editCount: number;
};

const changeKey = (change: StyleChange): string =>
  [
    change.selector,
    change.property,
    getStyleChangeState(change),
    getStyleChangeResponsiveTarget(change),
  ].join("\u0001");

/** Collapse slider/color-picker experiments into one net source-code change. */
const collapseStyleChanges = (changes: StyleChange[]): CollapsedStyleChange[] => {
  const collapsed = new Map<string, CollapsedStyleChange>();
  const order: string[] = [];

  for (const change of changes) {
    const key = changeKey(change);
    const existing = collapsed.get(key);

    if (existing === undefined) {
      collapsed.set(key, { ...change, editCount: 1 });
      order.push(key);
      continue;
    }

    collapsed.set(key, {
      ...existing,
      afterValue: change.afterValue,
      timestamp: change.timestamp,
      editCount: existing.editCount + 1,
    });
  }

  return order
    .map((key) => collapsed.get(key)!)
    .filter((change) => change.beforeValue !== change.afterValue);
};

const styleChangeGroupKey = (change: StyleChange): string =>
  [change.selector, getStyleChangeState(change), getStyleChangeResponsiveTarget(change)].join(
    "\u0001",
  );

type ShorthandRule = {
  shorthand: string;
  longhands: string[];
};

const CSS_SHORTHAND_RULES: ShorthandRule[] = [
  {
    shorthand: "animation",
    longhands: [
      "animation-name",
      "animation-duration",
      "animation-timing-function",
      "animation-delay",
      "animation-iteration-count",
      "animation-direction",
      "animation-fill-mode",
      "animation-play-state",
    ],
  },
  {
    shorthand: "transition",
    longhands: [
      "transition-property",
      "transition-duration",
      "transition-timing-function",
      "transition-delay",
    ],
  },
  { shorthand: "overflow", longhands: ["overflow-x", "overflow-y"] },
  { shorthand: "flex", longhands: ["flex-grow", "flex-shrink", "flex-basis"] },
  {
    shorthand: "font",
    longhands: ["font-family", "font-size", "font-weight", "font-style", "line-height"],
  },
  { shorthand: "text-decoration", longhands: ["text-decoration-line"] },
  { shorthand: "background", longhands: ["background-color", "background-repeat"] },
  {
    shorthand: "margin",
    longhands: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
  },
  {
    shorthand: "padding",
    longhands: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
  },
  { shorthand: "inset", longhands: ["top", "right", "bottom", "left"] },
  { shorthand: "border", longhands: ["border-width", "border-style", "border-color"] },
];

const normalizePromptStyleChanges = (changes: CollapsedStyleChange[]): CollapsedStyleChange[] => {
  const groupsWithLonghands = new Set<string>();

  for (const change of changes) {
    for (const rule of CSS_SHORTHAND_RULES) {
      if (rule.longhands.includes(change.property)) {
        groupsWithLonghands.add(`${styleChangeGroupKey(change)}\u0001${rule.shorthand}`);
      }
    }
  }

  return changes.filter(
    (change) => !groupsWithLonghands.has(`${styleChangeGroupKey(change)}\u0001${change.property}`),
  );
};

type CssModulePattern = {
  source: string;
  pattern: RegExp;
};

const CSS_MODULE_CLASS_PATTERNS: CssModulePattern[] = [
  {
    source: "css-loader [name]_[local]__[hash]",
    pattern: /^[A-Za-z][\w-]*_([A-Za-z][A-Za-z0-9-]*)__[A-Za-z0-9_-]{4,}$/,
  },
  {
    source: "css-loader [name]__[local]___[hash]",
    pattern: /^[A-Za-z][\w-]*__([A-Za-z][A-Za-z0-9-]*)___[A-Za-z0-9_-]{4,}$/,
  },
  { source: "css-loader [local]__[hash]", pattern: /^([A-Za-z][A-Za-z0-9-]*)__[A-Za-z0-9_-]{5,}$/ },
];

type ClassKind = "css-module" | "generated" | "utility" | "weak" | "stable" | "unknown";

type ClassClassification = {
  kind: ClassKind;
  source: string;
  moduleKey?: string;
};

type DefaultClassPattern = {
  kind: Exclude<ClassKind, "css-module" | "stable" | "unknown">;
  source: string;
  pattern: RegExp;
};

const DEFAULT_CLASS_PATTERNS: DefaultClassPattern[] = [
  { kind: "generated", source: "CSS-in-JS hash", pattern: /^css-[a-z0-9_-]+$/i },
  { kind: "generated", source: "styled-components hash", pattern: /^sc-[a-z0-9]+$/i },
  { kind: "generated", source: "JSS hash", pattern: /^jss\d+$/i },
  { kind: "generated", source: "MUI makeStyles hash", pattern: /^makeStyles-[A-Za-z0-9_-]+-\d+$/ },
  { kind: "generated", source: "hash suffix", pattern: /__[A-Za-z0-9_-]{5,}$/ },
  { kind: "utility", source: "Bootstrap utility", pattern: /^(m|p)[trblxyse]?-[0-5]$/i },
  {
    kind: "utility",
    source: "Bootstrap layout utility",
    pattern: /^(d|w|h|text|bg|border|rounded|flex|grid|gap|justify|align|container|row|col)-/i,
  },
  {
    kind: "utility",
    source: "Tailwind-style utility",
    pattern:
      /^(?:sm:|md:|lg:|xl:|2xl:|hover:|focus:|active:|disabled:)?(?:m|p|w|h|min-w|max-w|min-h|max-h|text|bg|border|rounded|flex|grid|gap|justify|items|content|self|order|font|leading|tracking|opacity|shadow|translate|scale|rotate|duration|ease|animate)-/i,
  },
  {
    kind: "weak",
    source: "Ant Design runtime/component class",
    pattern:
      /^(ant|anticon|ant-btn|ant-dropdown|ant-tooltip|ant-modal|ant-select|ant-input)(?:-|$)/i,
  },
  {
    kind: "weak",
    source: "runtime UI-library class",
    pattern: /^(btn|dropdown|tooltip|modal|nav|navbar)(?:-|$)/i,
  },
];

const contextPatternsFor = (
  promptContext: PromptProjectContext | undefined,
  field:
    | "stablePatterns"
    | "weakPatterns"
    | "generatedPatterns"
    | "utilityPatterns"
    | "cssModulePatterns",
): Array<{ convention: string; pattern: RegExp }> =>
  promptContext?.classConventions?.flatMap((convention) =>
    (convention[field] ?? [])
      .map((pattern) => ({ convention: convention.name, pattern: compilePattern(pattern) }))
      .filter((entry): entry is { convention: string; pattern: RegExp } => entry.pattern !== null),
  ) ?? [];

const cssModuleClassKey = (
  className: string,
  promptContext?: PromptProjectContext,
): string | null => {
  for (const { pattern } of contextPatternsFor(promptContext, "cssModulePatterns")) {
    const match = pattern.exec(className);
    if (match !== null) {
      return match[1] ?? className;
    }
  }

  for (const { pattern } of CSS_MODULE_CLASS_PATTERNS) {
    const match = pattern.exec(className);
    if (match !== null) {
      return match[1] ?? className;
    }
  }

  return null;
};

const matchesContextPattern = (
  className: string,
  promptContext: PromptProjectContext | undefined,
  field: "stablePatterns" | "weakPatterns" | "generatedPatterns" | "utilityPatterns",
): string | null => {
  const match = contextPatternsFor(promptContext, field).find((entry) =>
    entry.pattern.test(className),
  );
  return match?.convention ?? null;
};

const isProbablyStableSemanticClass = (className: string): boolean =>
  /^[A-Za-z][A-Za-z]*(?:-[A-Za-z]+)*$/.test(className);

const classifyClassName = (
  className: string,
  promptContext?: PromptProjectContext,
): ClassClassification => {
  const moduleKey = cssModuleClassKey(className, promptContext);
  if (moduleKey !== null) {
    return { kind: "css-module", source: "CSS Module/local hash pattern", moduleKey };
  }

  const generatedConvention = matchesContextPattern(className, promptContext, "generatedPatterns");
  if (generatedConvention !== null) {
    return { kind: "generated", source: `${generatedConvention} generated pattern` };
  }

  const utilityConvention = matchesContextPattern(className, promptContext, "utilityPatterns");
  if (utilityConvention !== null) {
    return { kind: "utility", source: `${utilityConvention} utility pattern` };
  }

  const weakConvention = matchesContextPattern(className, promptContext, "weakPatterns");
  if (weakConvention !== null) {
    return { kind: "weak", source: `${weakConvention} weak pattern` };
  }

  const stableConvention = matchesContextPattern(className, promptContext, "stablePatterns");
  if (stableConvention !== null) {
    return { kind: "stable", source: `${stableConvention} stable pattern` };
  }

  const defaultMatch = DEFAULT_CLASS_PATTERNS.find((rule) => rule.pattern.test(className));
  if (defaultMatch !== undefined) {
    return { kind: defaultMatch.kind, source: defaultMatch.source };
  }

  if (isProbablyStableSemanticClass(className)) {
    return { kind: "stable", source: "semantic class name" };
  }

  return { kind: "unknown", source: "unrecognized class convention" };
};

const isLikelyGeneratedClass = (className: string, promptContext?: PromptProjectContext): boolean =>
  classifyClassName(className, promptContext).kind === "generated";

const isFrameworkOrUtilityClass = (
  className: string,
  promptContext?: PromptProjectContext,
): boolean => {
  const kind = classifyClassName(className, promptContext).kind;
  return kind === "utility" || kind === "weak";
};

const selectorClassNames = (selector: string): string[] =>
  Array.from(selector.matchAll(/\.([A-Za-z0-9_-]+)/g), (match) => match[1]!).filter(
    (className) => className.length > 0,
  );

const isWeakSelector = (selector: string, promptContext?: PromptProjectContext): boolean =>
  selector.includes(":nth-") ||
  selectorClassNames(selector).some((className) => {
    const kind = classifyClassName(className, promptContext).kind;
    return kind === "generated" || kind === "utility" || kind === "weak" || kind === "unknown";
  });

const selectorRiskNotes = (
  target: UIChangeIntent["target"],
  promptContext?: PromptProjectContext,
): string[] => {
  const notes: string[] = [];

  if (isWeakSelector(target.selector, promptContext)) {
    notes.push(
      "Selector caution: the rendered selector includes positional, runtime, utility, generated, or unrecognized class parts. Use it to verify the element in the browser, but scope the source change through the real source owner, stable id/data attribute, semantic class, or nearby text.",
    );
  }

  if (target.selector === target.tagName.toLowerCase() || /^\w+\.[\w-]+$/.test(target.selector)) {
    notes.push(
      "Scope caution: this selector may match many elements. Do not add a broad global rule unless the source file intentionally scopes this exact element or section.",
    );
  }

  return notes;
};

const formatClassList = (classes: string[], suffix = ""): string =>
  `${classes
    .slice(0, MAX_CLASS_HINTS)
    .map((className) => `\`.${className}\``)
    .join(", ")}${classes.length > MAX_CLASS_HINTS ? ", ..." : ""}${suffix}`;

/** Ordered "how to locate this element in source" hints, most reliable first. */
const elementIdentity = (
  target: UIChangeIntent["target"],
  promptContext?: PromptProjectContext,
): string[] => {
  const identity: string[] = [];

  if (target.id !== undefined && target.id.length > 0) {
    identity.push(`id attribute: \`${target.id}\` (CSS selector: \`#${target.id}\`)`);
  }

  for (const attribute of ["data-testid", "data-test", "data-cy", "data-qa"]) {
    const value = target.attributes[attribute];
    if (value !== undefined && value.length > 0) {
      identity.push(`stable attribute: \`${attribute}="${truncateText(value, 80)}"\``);
    }
  }

  const text = target.textPreview?.trim() ?? "";
  if (text.length > 0) {
    identity.push(`visible text: "${truncateText(text, 120)}"`);
  }

  const classifiedClasses = target.classList.map((className) => ({
    className,
    classification: classifyClassName(className, promptContext),
  }));
  const moduleClassKeys = classifiedClasses.filter(
    (entry) =>
      entry.classification.kind === "css-module" && entry.classification.moduleKey !== undefined,
  );

  if (moduleClassKeys.length > 0) {
    identity.push(
      `CSS Module/local-name clues: search source for ${moduleClassKeys
        .slice(0, MAX_CLASS_HINTS)
        .map((entry) => `\`${entry.classification.moduleKey}\``)
        .join(
          ", ",
        )} (compiled class ${formatClassList(moduleClassKeys.map((entry) => entry.className))})`,
    );
  }

  const stableClasses = classifiedClasses
    .filter((entry) => entry.classification.kind === "stable")
    .map((entry) => entry.className);

  if (stableClasses.length > 0) {
    identity.push(`stable class clues: ${formatClassList(stableClasses)}`);
  }

  const unknownClasses = classifiedClasses
    .filter((entry) => entry.classification.kind === "unknown")
    .map((entry) => entry.className);

  if (unknownClasses.length > 0) {
    identity.push(
      `unverified class clues (confirm stability in source): ${formatClassList(unknownClasses)}`,
    );
  }

  for (const attribute of ["aria-label", "name", "role", "href", "src", "alt", "placeholder"]) {
    const value = target.attributes[attribute];
    if (value !== undefined && value.length > 0) {
      identity.push(`semantic attribute: \`${attribute}="${truncateText(value, 80)}"\``);
    }
  }

  const weakClasses = classifiedClasses
    .filter(
      (entry) =>
        isLikelyGeneratedClass(entry.className, promptContext) ||
        isFrameworkOrUtilityClass(entry.className, promptContext),
    )
    .map((entry) => entry.className);

  if (weakClasses.length > 0) {
    identity.push(
      `runtime/framework/generated classes (weak source clues): ${formatClassList(weakClasses)}`,
    );
  }

  identity.push(`rendered selector for verification: \`${target.selector}\``);

  if (target.fallbackSelectors !== undefined && target.fallbackSelectors.length > 0) {
    identity.push(
      `alternate rendered selectors: ${target.fallbackSelectors.map((selector) => `\`${selector}\``).join(", ")}`,
    );
  }

  identity.push(`DOM path fallback: \`${target.domPath}\``);
  return identity;
};

const preferredSourceTarget = (
  target: UIChangeIntent["target"],
  promptContext?: PromptProjectContext,
): string | null => {
  const clues: string[] = [];

  if (target.id !== undefined && target.id.length > 0) {
    clues.push(`id \`#${target.id}\``);
  }

  for (const attribute of ["data-testid", "data-test", "data-cy", "data-qa"]) {
    const value = target.attributes[attribute];
    if (value !== undefined && value.length > 0) {
      clues.push(`\`${attribute}="${truncateText(value, 80)}"\``);
    }
  }

  const text = target.textPreview?.trim() ?? "";
  if (text.length > 0) {
    clues.push(`visible text "${truncateText(text, 80)}"`);
  }

  const classifiedClasses = target.classList.map((className) => ({
    className,
    classification: classifyClassName(className, promptContext),
  }));
  const moduleClassKeys = classifiedClasses
    .filter(
      (entry) =>
        entry.classification.kind === "css-module" && entry.classification.moduleKey !== undefined,
    )
    .map((entry) => entry.classification.moduleKey!);

  if (moduleClassKeys.length > 0) {
    clues.push(
      `CSS Module key ${moduleClassKeys
        .slice(0, MAX_CLASS_HINTS)
        .map((key) => `\`${key}\``)
        .join(", ")}`,
    );
  }

  const stableClasses = classifiedClasses
    .filter((entry) => entry.classification.kind === "stable")
    .map((entry) => entry.className);

  if (stableClasses.length > 0) {
    clues.push(`stable class ${formatClassList(stableClasses)}`);
  }

  for (const attribute of ["aria-label", "name", "role", "href", "src", "alt", "placeholder"]) {
    const value = target.attributes[attribute];
    if (value !== undefined && value.length > 0) {
      clues.push(`\`${attribute}="${truncateText(value, 80)}"\``);
    }
  }

  return clues.length === 0 ? null : `Recommended source target: ${clues.slice(0, 4).join(" + ")}.`;
};

const formatAccessibilityNotes = (notes: AccessibilityNote[]): string[] =>
  notes.map(
    (note) =>
      `- ${note.severity.toUpperCase()}: ${note.title} - ${truncateText(note.message, 180)}`,
  );

const motionImplementationNote = (changes: CollapsedStyleChange[]): string | null => {
  const motionChanges = changes.filter(
    (change) =>
      change.property === "animation" ||
      change.property.startsWith("animation-") ||
      change.property === "transition" ||
      change.property.startsWith("transition-"),
  );

  if (motionChanges.length === 0) {
    return null;
  }

  const usesUiBuddyKeyframes = motionChanges.some((change) =>
    /\bui-buddy-[\w-]+\b/.test(change.afterValue),
  );

  return usesUiBuddyKeyframes
    ? "Motion note: reuse existing keyframes when present. If adding a `ui-buddy-*` keyframe, define it near the owning stylesheet and include a `prefers-reduced-motion` override when animation affects content movement."
    : "Motion note: reuse the project's existing motion tokens, transition utilities, or keyframes when they match the intended effect.";
};
/** Explicit original -> final value for each changed property. */
const changeDescriptions = (changes: CollapsedStyleChange[]): string[] =>
  changes.map((change) => {
    const state = getStyleChangeState(change);
    const responsiveTarget = getStyleChangeResponsiveTarget(change);
    const responsiveDefinition = getStyleResponsiveTargetDefinition(responsiveTarget);
    const responsiveLabel = responsiveTarget === "all" ? "" : `@${responsiveDefinition.label} `;
    const stateLabel = state === "base" ? "" : `:${state} `;
    const before = change.beforeValue.trim().length > 0 ? change.beforeValue : "(unset)";
    const collapsedNote =
      change.editCount > 1 ? ` (final value; ${change.editCount} adjustments collapsed)` : "";
    return `- ${responsiveLabel}${stateLabel}\`${change.property}\`: \`${before}\` -> \`${change.afterValue}\`${collapsedNote}`;
  });
type CollapsedStructuralEdit = {
  edit: StructuralEdit;
  count: number;
};

const collapseStructuralEdits = (edits: StructuralEdit[]): CollapsedStructuralEdit[] => {
  const collapsed = new Map<string, CollapsedStructuralEdit>();
  const order: string[] = [];

  for (const edit of edits) {
    const key = `${edit.kind}\u0001${edit.target.selector}`;
    const existing = collapsed.get(key);

    if (existing === undefined) {
      collapsed.set(key, { edit, count: 1 });
      order.push(key);
      continue;
    }

    collapsed.set(key, { edit, count: existing.count + 1 });
  }

  return order.map((key) => collapsed.get(key)!);
};

const structuralRepeatNote = (count: number): string =>
  count > 1 ? ` (${count} related edits collapsed to the final instruction)` : "";

const formatMoveDetails = (details: Record<string, string>): string => {
  const parts: string[] = [];

  if (details.direction !== undefined) {
    parts.push(`direction: ${details.direction}`);
  }

  if (details.alignment !== undefined) {
    parts.push(`alignment: ${details.alignment}`);
  }

  if (details.x !== undefined || details.y !== undefined) {
    parts.push(`visual offset: x=${details.x ?? "0"}px, y=${details.y ?? "0"}px`);
  }

  if (details.deltaX !== undefined || details.deltaY !== undefined) {
    parts.push(`delta: x=${details.deltaX ?? "0"}px, y=${details.deltaY ?? "0"}px`);
  }

  return parts.length === 0 ? "" : ` (${parts.join(", ")})`;
};

const formatRecordedSelector = (selector: string | undefined, fallback: string): string =>
  selector !== undefined && selector.trim().length > 0 ? `\`${selector}\`` : fallback;

const oneBasedPosition = (value: string | undefined): string | null => {
  if (value === undefined) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? String(parsed + 1) : value;
};

const confidenceSuffix = (details: Record<string, string>): string =>
  details.confidence !== undefined ? ` (confidence: ${details.confidence})` : "";

const implementationSentence = (details: Record<string, string>, fallback: string): string => {
  const sentence = (details.implementationHint ?? fallback).trim();
  return sentence.endsWith(".") ? sentence : `${sentence}.`;
};

const describeSemanticMove = (
  selector: string,
  edit: StructuralEdit,
  repeatNote: string,
): string | null => {
  const { details } = edit;

  if (details.intent === "reorder") {
    const parent = formatRecordedSelector(details.parentSelector, "the recorded parent");
    const before = oneBasedPosition(details.beforeIndex);
    const after = oneBasedPosition(details.afterIndex);
    const positions =
      before !== null && after !== null ? ` from position ${before} to ${after}` : "";
    return `- Reorder ${selector} within ${parent}${positions}${confidenceSuffix(details)}. ${implementationSentence(details, "Implement through source markup order or the project's existing flex/grid order mechanism; avoid pixel offsets")}${repeatNote}`;
  }

  if (details.intent === "relocate") {
    const beforeParent = formatRecordedSelector(
      details.beforeParentSelector,
      "its original parent",
    );
    const afterParent = formatRecordedSelector(details.afterParentSelector, "its new parent");
    return `- Relocate ${selector} from ${beforeParent} to ${afterParent}${confidenceSuffix(details)}. ${implementationSentence(details, "Move the source markup between the recorded source owners; avoid translate offsets when the intent is hierarchy/layout")}${repeatNote}`;
  }

  if (details.intent === "nudge") {
    return `- Visual nudge ${selector}: ${edit.summary}${formatMoveDetails(details)}${confidenceSuffix(details)}. ${implementationSentence(details, "Implement as transform/translate, margin, or spacing only if the persistent visual offset is intentional; do not treat it as source order/layout")}${repeatNote}`;
  }

  return null;
};

const describeStructuralEdit = ({ count, edit }: CollapsedStructuralEdit): string => {
  const selector = `\`${edit.target.selector}\``;
  const repeatNote = structuralRepeatNote(count);

  switch (edit.kind) {
    case "text":
      return `- Change the text of ${selector} from "${truncateText(edit.details.before ?? "", 80)}" to "${truncateText(edit.details.after ?? "", 80)}"${repeatNote}`;
    case "image":
      return `- Replace the image of ${selector} with \`${truncateText(edit.details.src ?? "", 120)}\`${repeatNote}`;
    case "delete":
      return `- Remove or hide ${selector}${repeatNote}`;
    case "move": {
      const semanticMove = describeSemanticMove(selector, edit, repeatNote);
      return (
        semanticMove ??
        `- Layout movement observed for ${selector}: ${edit.summary}${formatMoveDetails(edit.details)}${repeatNote}`
      );
    }
  }
};
/**
 * Build a powerful, ready-to-paste instruction prompt for an AI coding agent
 * (Cursor / Claude Code / etc.). Gives the agent: how to apply for the detected
 * stack, how to locate each element in source, the exact before -> after change,
 * the target CSS, and guardrails so it edits idiomatically without conflicts.
 */
export const summarizeSessionAsAgentPrompt = (session: UIChangeSession): string => {
  const stackGuidance = frameworkGuidance(session.frameworkHints, session.promptContext);

  const lines: string[] = [
    "# UI change request",
    "",
    "Apply the visual changes below to this project's SOURCE code. Work within the existing structure and styling approach, keep unrelated styles and behavior intact, and do not introduce conflicts or duplicate rules. Change only what is listed.",
    "",
    "## Project context",
    `- Page: ${session.pageUrl}`,
    `- Viewport at capture: ${session.viewport.width}x${session.viewport.height}`,
    `- Detected stack: ${stackGuidance.displayStack}`,
    ...(stackGuidance.nonSourceHints.length > 0
      ? [`- Observed runtime services: ${stackGuidance.nonSourceHints.join(", ")}`]
      : []),
    `- Stack guidance confidence: ${stackGuidance.confidence}`,
    ...(stackGuidance.sourceModels.length > 0
      ? [`- Likely source model(s): ${stackGuidance.sourceModels.join("; ")}`]
      : []),
    "",
    "### How to apply",
    ...stackGuidance.lines,
    "",
    "## Element changes",
  ];

  const editedTextCounts = new Map<string, number>();
  for (const intent of session.elements) {
    const key = sourceTextKey(intent.target.textPreview);
    if (key !== null) {
      editedTextCounts.set(key, (editedTextCounts.get(key) ?? 0) + 1);
    }
  }

  session.elements.forEach((intent, index) => {
    const target = intent.target;
    const heading = `\`<${target.tagName}>\`${
      target.textPreview !== undefined && target.textPreview.trim().length > 0
        ? ` "${truncateText(target.textPreview.trim(), 40)}"`
        : ""
    }`;

    lines.push("", `### ${index + 1}. ${heading}`);
    const sourceTarget = preferredSourceTarget(target, session.promptContext);
    if (sourceTarget !== null) {
      lines.push(sourceTarget);
    }
    const textKey = sourceTextKey(target.textPreview);
    if (textKey !== null && (editedTextCounts.get(textKey) ?? 0) > 1) {
      lines.push(
        "Related source note: another edited element has the same visible text; map parent/child rules together when they belong to the same source unit.",
      );
    }
    lines.push("Find it in source (architecture-neutral clues, most reliable first):");
    for (const hint of elementIdentity(target, session.promptContext)) {
      lines.push(hint);
    }

    const finalChanges = normalizePromptStyleChanges(collapseStyleChanges(intent.changes));
    const descriptions = changeDescriptions(finalChanges);
    if (descriptions.length > 0) {
      lines.push("Final values to apply (intermediate try-values collapsed):");
      lines.push(...descriptions);
    } else if (intent.changes.length > 0) {
      lines.push("No net style change remains after collapsing intermediate edits.");
    }

    const motionNote = motionImplementationNote(finalChanges);
    if (motionNote !== null) {
      lines.push(motionNote);
    }

    if (intent.accessibilityNotes.length > 0) {
      lines.push("Accessibility notes captured while editing:");
      lines.push(...formatAccessibilityNotes(intent.accessibilityNotes));
    }

    const riskNotes = selectorRiskNotes(target, session.promptContext);
    if (riskNotes.length > 0) {
      lines.push("Source-mapping cautions:");
      lines.push(...riskNotes.map((note) => `- ${note}`));
    }

    if (intent.rawCss !== undefined && intent.rawCss.trim().length > 0) {
      lines.push(`Raw CSS added: \`${intent.rawCss.trim()}\``);
    }

    const ruleCss =
      finalChanges.length > 0 ? buildCssRulesFromChanges(target.selector, finalChanges) : "";
    const rawRule = intent.rawCss !== undefined ? rawCssToRule(target.selector, intent.rawCss) : "";
    const css = [ruleCss, rawRule].filter((part) => part.trim().length > 0).join("\n\n");
    const illustratedCss =
      css.length > 0 && isWeakSelector(target.selector, session.promptContext)
        ? `/* Verification selector only: scope this to the real source owner before applying. */\n${css}`
        : css;

    if (illustratedCss.length > 0) {
      lines.push(
        "Final style target (illustrative CSS -- translate/scope to the actual source mechanism before applying):",
        "```css",
        illustratedCss,
        "```",
      );
    }
  });

  if (session.structuralEdits.length > 0) {
    const collapsedStructuralEdits = collapseStructuralEdits(session.structuralEdits);
    lines.push("", "## Structural / content changes");
    if (collapsedStructuralEdits.some(({ edit }) => edit.kind === "move")) {
      lines.push(
        "- Treat drag/move records as layout observations, not literal source patches. Apply them only when they clearly map to component order, layout, spacing, or transform intent.",
      );
    }
    for (const edit of collapsedStructuralEdits) {
      lines.push(describeStructuralEdit(edit));
    }
  }

  lines.push(
    "",
    "## Rules",
    "- Apply only the final values listed above; intermediate try-values are intentionally collapsed and should not be implemented.",
    "- Map each element to the real source owner using the identifiers above: component, template, view, stylesheet, CMS/theme file, Web Component, static markup, or email template as appropriate. Prefer ids, stable classes, `data-*` attributes, semantic attributes, or visible text over rendered selectors.",
    "- If an edited element has no stable unique source hook, add a small semantic class or data attribute in the source markup and scope the style through that hook instead of broad global or positional selectors.",
    "- Treat generated/framework/utility/unverified classes and positional `:nth-of-type` selectors as browser verification clues, not source selectors.",
    "- Apply changes idiomatically for the verified stack. Do not assume a component framework, utility framework, or global stylesheet unless the project structure confirms it.",
    "- Reuse existing tokens/variables/utilities when a value matches one; avoid hardcoding literals that duplicate the design system.",
    "- Change only the listed properties and keep everything else intact. If a change cannot be applied cleanly, explain why instead of guessing.",
  );

  return lines.join("\n").trim();
};
