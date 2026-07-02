import { describe, expect, it } from "vitest";

import {
  buildCssRuleFromChanges,
  createStyleChange,
  diffStyles,
  mergeStyleChanges,
} from "./styleDiff";

describe("style diff utilities", () => {
  it("returns only changed supported properties", () => {
    const changes = diffStyles(
      ".card",
      { color: "rgb(0, 0, 0)", "font-size": "16px", width: "120px" },
      { color: "rgb(255, 0, 0)", "font-size": "16px", width: "140px" },
      "2026-07-01T00:00:00.000Z",
    );

    expect(changes.map((change) => change.property)).toEqual(["width", "color"]);
    expect(changes[0]).toMatchObject({
      selector: ".card",
      beforeValue: "120px",
      afterValue: "140px",
    });
  });

  it("diffs supported transition and animation properties", () => {
    const changes = diffStyles(
      ".card",
      { "animation-play-state": "running", "transition-duration": "150ms" },
      { "animation-play-state": "paused", "transition-duration": "300ms" },
      "2026-07-01T00:00:00.000Z",
    );

    expect(changes.map((change) => change.property)).toEqual([
      "transition-duration",
      "animation-play-state",
    ]);
  });
  it("merges later style changes into an existing style record", () => {
    const merged = mergeStyleChanges({ color: "black", padding: "4px" }, [
      createStyleChange(".card", "color", "black", "white"),
    ]);

    expect(merged).toEqual({ color: "white", padding: "4px" });
  });

  it("builds pseudo-class CSS rules from state changes", () => {
    const css = buildCssRuleFromChanges(".card", [
      createStyleChange(".card", "transition", "", "all 200ms ease", "2026-07-01T00:00:00.000Z"),
      createStyleChange(
        ".card",
        "transform",
        "",
        "scale(1.04)",
        "2026-07-01T00:00:00.000Z",
        "hover",
      ),
    ]);

    expect(css).toBe(
      [
        ".card {",
        "  transition: all 200ms ease;",
        "}",
        "",
        ".card:hover {",
        "  transform: scale(1.04);",
        "}",
      ].join("\n"),
    );
  });

  it("keeps pseudo-state edits out of base after-style merges", () => {
    const merged = mergeStyleChanges({ transform: "none" }, [
      createStyleChange(
        ".card",
        "transform",
        "",
        "scale(1.04)",
        "2026-07-01T00:00:00.000Z",
        "hover",
      ),
    ]);

    expect(merged).toEqual({ transform: "none" });
  });
  it("builds a CSS rule from changed declarations", () => {
    const css = buildCssRuleFromChanges(".card", [
      createStyleChange(".card", "color", "black", "white"),
      createStyleChange(".card", "font-size", "14px", "16px"),
      createStyleChange(".other", "width", "10px", "20px"),
    ]);

    expect(css).toBe([".card {", "  color: white;", "  font-size: 16px;", "}"].join("\n"));
  });
});
