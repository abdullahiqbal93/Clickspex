import type { AccessibilityNote, ElementSnapshot } from "@ui-devtools/shared";

export type RgbaColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

const NAMED_COLORS: Record<string, RgbaColor> = {
  black: { r: 0, g: 0, b: 0, a: 1 },
  white: { r: 255, g: 255, b: 255, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
};

const clampChannel = (value: number): number => Math.min(255, Math.max(0, value));

const parseHexColor = (value: string): RgbaColor | null => {
  const hex = value.replace("#", "").trim();

  if (![3, 4, 6, 8].includes(hex.length)) {
    return null;
  }

  const expand = (segment: string): string =>
    segment.length === 1 ? `${segment}${segment}` : segment;
  const parts =
    hex.length <= 4
      ? [hex[0], hex[1], hex[2], hex[3] ?? "f"].map((part) => expand(part ?? "0"))
      : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6), hex.slice(6, 8) || "ff"];

  const [r, g, b, a] = parts.map((part) => Number.parseInt(part, 16));

  if ([r, g, b, a].some((channel) => Number.isNaN(channel))) {
    return null;
  }

  return {
    r: clampChannel(r ?? 0),
    g: clampChannel(g ?? 0),
    b: clampChannel(b ?? 0),
    a: Number(((a ?? 255) / 255).toFixed(3)),
  };
};

const parseRgbColor = (value: string): RgbaColor | null => {
  const match = value
    .trim()
    .match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);

  if (match === null) {
    return null;
  }

  const [, r, g, b, alpha] = match;

  return {
    r: clampChannel(Number.parseFloat(r ?? "0")),
    g: clampChannel(Number.parseFloat(g ?? "0")),
    b: clampChannel(Number.parseFloat(b ?? "0")),
    a: alpha === undefined ? 1 : Math.min(1, Math.max(0, Number.parseFloat(alpha))),
  };
};

export const parseCssColor = (value: string): RgbaColor | null => {
  const normalized = value.trim().toLowerCase();

  if (normalized in NAMED_COLORS) {
    return NAMED_COLORS[normalized] ?? null;
  }

  if (normalized.startsWith("#")) {
    return parseHexColor(normalized);
  }

  return parseRgbColor(normalized);
};

const channelToLinear = (channel: number): number => {
  const normalized = channel / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
};

export const relativeLuminance = (color: RgbaColor): number =>
  0.2126 * channelToLinear(color.r) +
  0.7152 * channelToLinear(color.g) +
  0.0722 * channelToLinear(color.b);

export const contrastRatio = (foreground: RgbaColor, background: RgbaColor): number => {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
};

export const contrastRatioFromCssColors = (
  foreground: string,
  background: string,
): number | null => {
  const foregroundColor = parseCssColor(foreground);
  const backgroundColor = parseCssColor(background);

  if (foregroundColor === null || backgroundColor === null) {
    return null;
  }

  return contrastRatio(foregroundColor, backgroundColor);
};

export const getAccessibilityNotes = (snapshot: ElementSnapshot): AccessibilityNote[] => {
  const notes: AccessibilityNote[] = [];
  const tagName = snapshot.tagName.toLowerCase();

  if (tagName === "img" && !("alt" in snapshot.attributes)) {
    notes.push({
      id: "missing-img-alt",
      severity: "warning",
      title: "Missing image alt text",
      message: "Images need an alt attribute so assistive technology can expose intent.",
    });
  }

  if (["button", "input"].includes(tagName)) {
    const hasAriaLabel = Boolean(snapshot.attributes["aria-label"]?.trim());
    const hasAriaLabelledBy = Boolean(snapshot.attributes["aria-labelledby"]?.trim());
    const hasText = snapshot.textPreview.trim().length > 0;

    if (!hasAriaLabel && !hasAriaLabelledBy && !hasText) {
      notes.push({
        id: `missing-${tagName}-label`,
        severity: "warning",
        title: "Missing accessible label",
        message: `${tagName} elements need visible text or an ARIA label in this v1 check.`,
      });
    }
  }

  const ratio = contrastRatioFromCssColors(
    snapshot.computedStyles.color ?? "",
    snapshot.computedStyles["background-color"] ?? "",
  );

  if (ratio !== null && ratio < 4.5 && snapshot.textPreview.length > 0) {
    notes.push({
      id: "low-contrast",
      severity: "warning",
      title: "Low contrast",
      message: `Text contrast is ${ratio}:1. This lightweight check uses the element foreground and background colors only.`,
    });
  }

  return notes;
};
