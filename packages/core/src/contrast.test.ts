import { describe, expect, it } from "vitest";

import { contrastRatioFromCssColors, parseCssColor, relativeLuminance } from "./contrast";

describe("contrast utilities", () => {
  it("computes the WCAG contrast ratio for black and white", () => {
    expect(contrastRatioFromCssColors("#000", "#fff")).toBe(21);
  });

  it("computes a ratio of 1 for identical colors", () => {
    expect(contrastRatioFromCssColors("rgb(120, 120, 120)", "rgb(120, 120, 120)")).toBe(1);
  });

  it("parses rgba colors with alpha", () => {
    expect(parseCssColor("rgba(10, 20, 30, 0.5)")).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
  });

  it("uses known relative luminance values for black and white", () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0, a: 1 })).toBe(0);
    expect(relativeLuminance({ r: 255, g: 255, b: 255, a: 1 })).toBe(1);
  });
});
