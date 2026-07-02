import {
  SUPPORTED_STYLE_PROPERTIES,
  type StyleChange,
  type SupportedStyleProperty,
} from "@ui-buddy/shared";

const INDENT = "  ";

export const createStyleChange = (
  selector: string,
  property: SupportedStyleProperty,
  beforeValue: string,
  afterValue: string,
  timestamp = new Date().toISOString(),
): StyleChange => ({
  selector,
  property,
  beforeValue,
  afterValue,
  timestamp,
});

export const diffStyles = (
  selector: string,
  before: Record<string, string>,
  after: Record<string, string>,
  timestamp = new Date().toISOString(),
): StyleChange[] =>
  SUPPORTED_STYLE_PROPERTIES.flatMap((property) => {
    const beforeValue = before[property] ?? "";
    const afterValue = after[property] ?? "";

    if (beforeValue === afterValue) {
      return [];
    }

    return [createStyleChange(selector, property, beforeValue, afterValue, timestamp)];
  });

export const styleChangesToRecord = (changes: StyleChange[]): Record<string, string> => {
  const styles: Record<string, string> = {};

  for (const change of changes) {
    if (change.afterValue.trim().length > 0) {
      styles[change.property] = change.afterValue;
    }
  }

  return styles;
};

export const mergeStyleChanges = (
  base: Record<string, string>,
  changes: StyleChange[],
): Record<string, string> => {
  const merged = { ...base };

  for (const change of changes) {
    merged[change.property] = change.afterValue;
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

export const buildCssRuleFromChanges = (selector: string, changes: StyleChange[]): string =>
  buildCssRule(
    selector,
    styleChangesToRecord(changes.filter((change) => change.selector === selector)),
  );
