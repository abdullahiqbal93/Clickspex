import {
  SUPPORTED_STYLE_PROPERTIES,
  type StyleChange,
  type StyleTargetState,
  type SupportedStyleProperty,
} from "@ui-buddy/shared";

const INDENT = "  ";
const BASE_STYLE_TARGET_STATE: StyleTargetState = "base";
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

export type CssRuleRecord = {
  selector: string;
  state: StyleTargetState;
  styles: Record<string, string>;
};

export const getStyleChangeState = (change: Pick<StyleChange, "state">): StyleTargetState =>
  change.state ?? BASE_STYLE_TARGET_STATE;

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
): StyleChange => ({
  selector,
  property,
  beforeValue,
  afterValue,
  timestamp,
  ...(state === BASE_STYLE_TARGET_STATE ? {} : { state }),
});

export const diffStyles = (
  selector: string,
  before: Record<string, string>,
  after: Record<string, string>,
  timestamp = new Date().toISOString(),
  state: StyleTargetState = BASE_STYLE_TARGET_STATE,
): StyleChange[] =>
  SUPPORTED_STYLE_PROPERTIES.flatMap((property) => {
    const beforeValue = before[property] ?? "";
    const afterValue = after[property] ?? "";

    if (beforeValue === afterValue) {
      return [];
    }

    return [createStyleChange(selector, property, beforeValue, afterValue, timestamp, state)];
  });

export const styleChangesToRecord = (
  changes: StyleChange[],
  state: StyleTargetState = BASE_STYLE_TARGET_STATE,
): Record<string, string> => {
  const styles: Record<string, string> = {};

  for (const change of changes) {
    if (getStyleChangeState(change) === state && change.afterValue.trim().length > 0) {
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

  return STYLE_TARGET_STATE_ORDER.map((state) => ({
    selector: buildStyleTargetSelector(selector, state),
    state,
    styles: styleChangesToRecord(matchingChanges, state),
  })).filter((record) => Object.keys(record.styles).length > 0);
};

export const mergeStyleChanges = (
  base: Record<string, string>,
  changes: StyleChange[],
  state: StyleTargetState = BASE_STYLE_TARGET_STATE,
): Record<string, string> => {
  const merged = { ...base };

  for (const change of changes) {
    if (getStyleChangeState(change) === state) {
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

export const buildCssRulesFromChanges = (selector: string, changes: StyleChange[]): string => {
  const rules = styleChangesToRuleRecords(selector, changes).map((record) =>
    buildCssRule(record.selector, record.styles),
  );

  return rules.length > 0 ? rules.join("\n\n") : buildCssRule(selector, {});
};

export const buildCssRuleFromChanges = (selector: string, changes: StyleChange[]): string =>
  buildCssRulesFromChanges(selector, changes);
