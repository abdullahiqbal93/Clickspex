import type { BoxModelSnapshot, BoxSideSnapshot } from "@clickspex/shared";

const zeroSides = (): BoxSideSnapshot => ({
  top: "0px",
  right: "0px",
  bottom: "0px",
  left: "0px",
});

const readValue = (
  styles: CSSStyleDeclaration | Record<string, string>,
  property: string,
): string => {
  const getPropertyValue = (styles as { getPropertyValue?: unknown }).getPropertyValue;

  if (typeof getPropertyValue === "function") {
    return (getPropertyValue as (propertyName: string) => string).call(styles, property).trim();
  }

  const styleRecord = styles as Record<string, string>;
  return styleRecord[property]?.trim() ?? "";
};

export const parsePixelValue = (value: string): number => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const normalizeCssLength = (value: string): string => {
  const trimmed = value.trim();

  if (trimmed.length === 0 || trimmed === "auto") {
    return trimmed.length === 0 ? "0px" : trimmed;
  }

  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return `${trimmed}px`;
  }

  return trimmed;
};

const readSides = (
  styles: CSSStyleDeclaration | Record<string, string>,
  prefix: "margin" | "border" | "padding",
  suffix = "",
): BoxSideSnapshot => ({
  ...zeroSides(),
  top: normalizeCssLength(readValue(styles, `${prefix}-top${suffix}`)),
  right: normalizeCssLength(readValue(styles, `${prefix}-right${suffix}`)),
  bottom: normalizeCssLength(readValue(styles, `${prefix}-bottom${suffix}`)),
  left: normalizeCssLength(readValue(styles, `${prefix}-left${suffix}`)),
});

export const parseBoxModel = (
  styles: CSSStyleDeclaration | Record<string, string>,
): BoxModelSnapshot => ({
  margin: readSides(styles, "margin"),
  border: readSides(styles, "border", "-width"),
  padding: readSides(styles, "padding"),
  content: {
    width: normalizeCssLength(readValue(styles, "width")),
    height: normalizeCssLength(readValue(styles, "height")),
  },
});

export const boxSideToNumbers = (side: BoxSideSnapshot): Record<keyof BoxSideSnapshot, number> => ({
  top: parsePixelValue(side.top),
  right: parsePixelValue(side.right),
  bottom: parsePixelValue(side.bottom),
  left: parsePixelValue(side.left),
});
