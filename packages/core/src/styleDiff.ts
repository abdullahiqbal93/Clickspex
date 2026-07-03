import {
  STYLE_RESPONSIVE_TARGET_DEFINITIONS,
  SUPPORTED_STYLE_PROPERTIES,
  type StyleChange,
  type StyleResponsiveTarget,
  type StyleResponsiveTargetDefinition,
  type StyleTargetState,
  type SupportedStyleProperty,
} from "@ui-buddy/shared";

const INDENT = "  ";
const BASE_STYLE_TARGET_STATE: StyleTargetState = "base";
const BASE_STYLE_RESPONSIVE_TARGET: StyleResponsiveTarget = "all";
const STYLE_TARGET_STATE_ORDER: StyleTargetState[] = [
  "base",
  "hover",
  "focus",
  "focus-visible",
  "focus-within",
  "active",
  "disabled",
  "checked",
];
const STYLE_RESPONSIVE_TARGET_ORDER = STYLE_RESPONSIVE_TARGET_DEFINITIONS.map(
  (definition) => definition.target,
);
const BASE_RESPONSIVE_TARGET_DEFINITION: StyleResponsiveTargetDefinition = {
  target: "all",
  label: "All screens",
  shortLabel: "All",
  mediaQuery: null,
};

export type CssRuleRecord = {
  selector: string;
  state: StyleTargetState;
  responsiveTarget: StyleResponsiveTarget;
  mediaQuery: string | null;
  styles: Record<string, string>;
};

export const getStyleChangeState = (change: Pick<StyleChange, "state">): StyleTargetState =>
  change.state ?? BASE_STYLE_TARGET_STATE;

export const getStyleChangeResponsiveTarget = (
  change: Pick<StyleChange, "responsiveTarget">,
): StyleResponsiveTarget => change.responsiveTarget ?? BASE_STYLE_RESPONSIVE_TARGET;

export const getStyleResponsiveTargetDefinition = (target: StyleResponsiveTarget) =>
  STYLE_RESPONSIVE_TARGET_DEFINITIONS.find((definition) => definition.target === target) ??
  BASE_RESPONSIVE_TARGET_DEFINITION;

export const buildMediaQueryFromResponsiveTarget = (
  target: StyleResponsiveTarget = BASE_STYLE_RESPONSIVE_TARGET,
): string | null => getStyleResponsiveTargetDefinition(target).mediaQuery;

export const buildStyleTargetSelector = (
  selector: string,
  state: StyleTargetState = BASE_STYLE_TARGET_STATE,
): string => (state === BASE_STYLE_TARGET_STATE ? selector : `${selector}:${state}`);

export const createStyleChange = (
  selector: string,
  property: SupportedStyleProperty,
  beforeValue: string,
  afterValue: string,
  timestamp = new Date().toISOString(),
  state: StyleTargetState = BASE_STYLE_TARGET_STATE,
  responsiveTarget: StyleResponsiveTarget = BASE_STYLE_RESPONSIVE_TARGET,
): StyleChange => ({
  selector,
  property,
  beforeValue,
  afterValue,
  timestamp,
  ...(state === BASE_STYLE_TARGET_STATE ? {} : { state }),
  ...(responsiveTarget === BASE_STYLE_RESPONSIVE_TARGET ? {} : { responsiveTarget }),
});

/**
 * Time window within which two edits of the same property are treated as one
 * continuous action (e.g. dragging a color picker or slider). Keeps a single
 * change with the final value instead of one entry per intermediate value.
 */
export const STYLE_CHANGE_COALESCE_WINDOW_MS = 600;

/**
 * True when `next` should collapse into `previous` — same target property, and
 * committed within the coalesce window. Lets a slider drag record one change
 * (and undo as one step) rather than dozens.
 */
export const canCoalesceStyleChange = (previous: StyleChange, next: StyleChange): boolean => {
  if (
    previous.selector !== next.selector ||
    previous.property !== next.property ||
    getStyleChangeState(previous) !== getStyleChangeState(next) ||
    getStyleChangeResponsiveTarget(previous) !== getStyleChangeResponsiveTarget(next)
  ) {
    return false;
  }

  const previousTime = Date.parse(previous.timestamp);
  const nextTime = Date.parse(next.timestamp);

  if (Number.isNaN(previousTime) || Number.isNaN(nextTime)) {
    return true;
  }

  return nextTime >= previousTime && nextTime - previousTime <= STYLE_CHANGE_COALESCE_WINDOW_MS;
};

export const diffStyles = (
  selector: string,
  before: Record<string, string>,
  after: Record<string, string>,
  timestamp = new Date().toISOString(),
  state: StyleTargetState = BASE_STYLE_TARGET_STATE,
  responsiveTarget: StyleResponsiveTarget = BASE_STYLE_RESPONSIVE_TARGET,
): StyleChange[] =>
  SUPPORTED_STYLE_PROPERTIES.flatMap((property) => {
    const beforeValue = before[property] ?? "";
    const afterValue = after[property] ?? "";

    if (beforeValue === afterValue) {
      return [];
    }

    return [
      createStyleChange(
        selector,
        property,
        beforeValue,
        afterValue,
        timestamp,
        state,
        responsiveTarget,
      ),
    ];
  });

export const styleChangesToRecord = (
  changes: StyleChange[],
  state: StyleTargetState = BASE_STYLE_TARGET_STATE,
  responsiveTarget: StyleResponsiveTarget = BASE_STYLE_RESPONSIVE_TARGET,
): Record<string, string> => {
  const styles: Record<string, string> = {};

  for (const change of changes) {
    if (
      getStyleChangeState(change) === state &&
      getStyleChangeResponsiveTarget(change) === responsiveTarget &&
      change.afterValue.trim().length > 0
    ) {
      styles[change.property] = change.afterValue;
    }
  }

  return styles;
};

export const styleChangesToRuleRecords = (
  selector: string,
  changes: StyleChange[],
): CssRuleRecord[] => {
  const matchingChanges = changes.filter((change) => change.selector === selector);

  return STYLE_RESPONSIVE_TARGET_ORDER.flatMap((responsiveTarget) =>
    STYLE_TARGET_STATE_ORDER.map((state) => ({
      selector: buildStyleTargetSelector(selector, state),
      state,
      responsiveTarget,
      mediaQuery: buildMediaQueryFromResponsiveTarget(responsiveTarget),
      styles: styleChangesToRecord(matchingChanges, state, responsiveTarget),
    })),
  ).filter((record) => Object.keys(record.styles).length > 0);
};

export const mergeStyleChanges = (
  base: Record<string, string>,
  changes: StyleChange[],
  state: StyleTargetState = BASE_STYLE_TARGET_STATE,
  responsiveTarget: StyleResponsiveTarget = BASE_STYLE_RESPONSIVE_TARGET,
): Record<string, string> => {
  const merged = { ...base };

  for (const change of changes) {
    if (
      getStyleChangeState(change) === state &&
      getStyleChangeResponsiveTarget(change) === responsiveTarget
    ) {
      merged[change.property] = change.afterValue;
    }
  }

  return merged;
};

export const buildCssRule = (selector: string, styles: Record<string, string>): string => {
  const declarations = Object.entries(styles)
    .filter(([, value]) => value.trim().length > 0)
    .map(([property, value]) => `${INDENT}${property}: ${value};`);

  if (declarations.length === 0) {
    return `${selector} {}`;
  }

  return [`${selector} {`, ...declarations, "}"].join("\n");
};

const indentCss = (css: string): string =>
  css
    .split("\n")
    .map((line) => `${INDENT}${line}`)
    .join("\n");

export const wrapCssForResponsiveTarget = (
  css: string,
  responsiveTarget: StyleResponsiveTarget = BASE_STYLE_RESPONSIVE_TARGET,
): string => {
  const mediaQuery = buildMediaQueryFromResponsiveTarget(responsiveTarget);

  if (mediaQuery === null) {
    return css;
  }

  return [`@media ${mediaQuery} {`, indentCss(css), "}"].join("\n");
};

export const buildScopedCssRule = (
  selector: string,
  styles: Record<string, string>,
  state: StyleTargetState = BASE_STYLE_TARGET_STATE,
  responsiveTarget: StyleResponsiveTarget = BASE_STYLE_RESPONSIVE_TARGET,
): string =>
  wrapCssForResponsiveTarget(
    buildCssRule(buildStyleTargetSelector(selector, state), styles),
    responsiveTarget,
  );

export const buildCssRulesFromChanges = (selector: string, changes: StyleChange[]): string => {
  const records = styleChangesToRuleRecords(selector, changes);

  if (records.length === 0) {
    return buildCssRule(selector, {});
  }

  const rules: string[] = [];

  for (const responsiveTarget of STYLE_RESPONSIVE_TARGET_ORDER) {
    const targetRecords = records.filter((record) => record.responsiveTarget === responsiveTarget);

    if (targetRecords.length === 0) {
      continue;
    }

    const targetCss = targetRecords
      .map((record) => buildCssRule(record.selector, record.styles))
      .join("\n\n");

    rules.push(wrapCssForResponsiveTarget(targetCss, responsiveTarget));
  }

  return rules.join("\n\n");
};

export const buildCssRuleFromChanges = (selector: string, changes: StyleChange[]): string =>
  buildCssRulesFromChanges(selector, changes);
