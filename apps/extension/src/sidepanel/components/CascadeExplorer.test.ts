import { describe, expect, it } from "vitest";

import {
  buildLiveOverrideRule,
  getRuleResponsiveTarget,
  ruleAppliesToResponsiveTarget,
  isCssDeclarationValueValid,
} from "./CascadeExplorer";

import type { MatchedStyleRule, StyleChange } from "@ui-buddy/shared";

const rule = (conditional: string | null): MatchedStyleRule => ({
  id: conditional ?? "base",
  selector: ".card",
  specificity: [0, 1, 0],
  origin: "author",
  source: { label: "app.css", url: null },
  declarations: [],
  active: true,
  conditional,
  inheritedFrom: null,
});

describe("CascadeExplorer responsive rules", () => {
  it("classifies rules into the matching responsive workspace", () => {
    expect(getRuleResponsiveTarget(rule(null))).toBe("all");
    expect(getRuleResponsiveTarget(rule("@media (max-width: 767px)"))).toBe("mobile");
    expect(getRuleResponsiveTarget(rule("@media (min-width: 768px) and (max-width: 1023px)"))).toBe(
      "tablet",
    );
    expect(getRuleResponsiveTarget(rule("@media (min-width: 1024px)"))).toBe("desktop");
    const sharedSmallScreenRule = rule("@media (max-width: 1023px)");
    expect(ruleAppliesToResponsiveTarget(rule(null), "mobile")).toBe(true);
    expect(ruleAppliesToResponsiveTarget(sharedSmallScreenRule, "all")).toBe(false);
    expect(ruleAppliesToResponsiveTarget(sharedSmallScreenRule, "mobile")).toBe(true);
    expect(ruleAppliesToResponsiveTarget(sharedSmallScreenRule, "tablet")).toBe(true);
    expect(ruleAppliesToResponsiveTarget(sharedSmallScreenRule, "desktop")).toBe(false);
  });

  it("builds an immediate live rule only for the selected responsive target", () => {
    const changes: StyleChange[] = [
      {
        selector: "#layout",
        property: "color",
        beforeValue: "black",
        afterValue: "red",
        timestamp: "2026-07-13T00:00:00.000Z",
      },
      {
        selector: "#layout",
        property: "grid-template-columns",
        beforeValue: "none",
        afterValue: "1fr 2fr",
        timestamp: "2026-07-13T00:00:01.000Z",
        responsiveTarget: "desktop",
      },
    ];

    const desktopRule = buildLiveOverrideRule(changes, "#layout", "base", "desktop");

    expect(desktopRule?.conditional).toContain("min-width: 1024px");
    expect(desktopRule?.declarations).toEqual([
      expect.objectContaining({
        property: "grid-template-columns",
        value: "1fr 2fr",
      }),
    ]);
    expect(buildLiveOverrideRule(changes, "#layout", "base", "mobile")).toBeNull();
  });
  it("validates declarations created inside a matched rule", () => {
    expect(isCssDeclarationValueValid("grid-template-columns", "1fr 2fr")).toBe(true);
    expect(isCssDeclarationValueValid("--brand-color", "#7c3aed")).toBe(true);
    expect(isCssDeclarationValueValid("color; display", "red")).toBe(false);
    expect(isCssDeclarationValueValid("color", "")).toBe(false);
  });
});
