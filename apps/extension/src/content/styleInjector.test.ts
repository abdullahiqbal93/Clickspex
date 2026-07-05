import { describe, expect, it, beforeEach } from "vitest";

import { StyleInjector } from "./styleInjector";

import type { StyleChange } from "@ui-buddy/shared";

const styleElement = (): HTMLStyleElement | null =>
  document.getElementById("__ui-buddy-styles__") as HTMLStyleElement | null;

const createChange = (
  property: StyleChange["property"],
  beforeValue: string,
  afterValue: string,
  state?: StyleChange["state"],
  responsiveTarget?: StyleChange["responsiveTarget"],
  timestamp = "2026-07-01T00:00:00.000Z",
): StyleChange => ({
  selector: "#save",
  property,
  beforeValue,
  afterValue,
  timestamp,
  ...(state === undefined ? {} : { state }),
  ...(responsiveTarget === undefined ? {} : { responsiveTarget }),
});

describe("StyleInjector", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
  });

  it("writes all live edits to a single page style element", () => {
    const injector = new StyleInjector();

    injector.applyChange(createChange("color", "black", "white"));
    injector.applyChange(createChange("font-size", "14px", "16px"));

    expect(document.querySelectorAll("#__ui-buddy-styles__")).toHaveLength(1);
    expect(styleElement()?.textContent).toBe(
      ["#save {", "  color: white !important;", "  font-size: 16px !important;", "}"].join("\n"),
    );
  });

  it("undoes back through the applied change history and removes stale rules", () => {
    const injector = new StyleInjector();

    // Timestamps two seconds apart so they are treated as two deliberate edits,
    // not one continuous drag.
    injector.applyChange(
      createChange("color", "black", "white", undefined, undefined, "2026-07-01T00:00:00.000Z"),
    );
    injector.applyChange(
      createChange("color", "white", "red", undefined, undefined, "2026-07-01T00:00:02.000Z"),
    );

    expect(styleElement()?.textContent).toContain("color: red !important;");

    injector.undo();

    expect(styleElement()?.textContent).toContain("color: white !important;");

    injector.undo();

    expect(styleElement()).toBeNull();
  });

  it("coalesces rapid same-property edits into one undo step", () => {
    const injector = new StyleInjector();

    const first = injector.applyChange(
      createChange("color", "black", "white", undefined, undefined, "2026-07-01T00:00:00.000Z"),
    );
    // 200ms later - within the coalesce window, like a slider drag.
    const second = injector.applyChange(
      createChange("color", "white", "red", undefined, undefined, "2026-07-01T00:00:00.200Z"),
    );

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(styleElement()?.textContent).toContain("color: red !important;");

    // A single undo reverts the whole drag rather than one intermediate value.
    injector.undo();
    expect(styleElement()).toBeNull();
  });

  it("redoes reverted changes and clears redo history after a new edit", () => {
    const injector = new StyleInjector();

    injector.applyChange(createChange("color", "black", "white"));
    injector.undo();
    injector.redo();

    expect(styleElement()?.textContent).toContain("color: white !important;");

    injector.undo();
    injector.applyChange(createChange("font-size", "14px", "16px"));
    injector.redo();

    expect(styleElement()?.textContent).toBe(
      ["#save {", "  font-size: 16px !important;", "}"].join("\n"),
    );
  });

  it("writes pseudo-state edits as pseudo-class CSS rules", () => {
    const injector = new StyleInjector();

    injector.applyChange(createChange("transform", "", "scale(1.04)", "hover"));

    expect(styleElement()?.textContent).toContain("#save:hover {");
    expect(styleElement()?.textContent).toContain("  transform: scale(1.04) !important;");
  });
  it("wraps responsive live edits in media queries", () => {
    const injector = new StyleInjector();

    injector.applyChange(createChange("width", "320px", "100%", "base", "mobile"));

    expect(styleElement()?.textContent).toBe(
      ["@media (max-width: 767px) {", "  #save {", "    width: 100% !important;", "  }", "}"].join(
        "\n",
      ),
    );
  });
  it("adds keyframes for built-in animation presets", () => {
    const injector = new StyleInjector();

    injector.applyChange(createChange("animation", "", "ui-buddy-fade-in 300ms ease-out both"));

    expect(styleElement()?.textContent).toContain(
      "animation: ui-buddy-fade-in 300ms ease-out both !important;",
    );
    expect(styleElement()?.textContent).toContain("@keyframes ui-buddy-fade-in");
  });
  it("reset clears style output and history", () => {
    const injector = new StyleInjector();

    injector.applyChange(createChange("color", "black", "white"));
    injector.reset();
    injector.redo();

    expect(styleElement()).toBeNull();
  });

  it("restores persisted style and raw CSS edits and re-injects them", () => {
    const injector = new StyleInjector();

    injector.restore(
      [createChange("color", "black", "white")],
      [{ selector: "#save", css: "font-size: 20px;" }],
    );

    const css = styleElement()?.textContent ?? "";
    expect(css).toContain("color: white !important;");
    expect(css).toContain("font-size: 20px !important;");
    expect(injector.getAppliedChanges()).toHaveLength(1);
    expect(injector.getRawCssEntries()).toEqual([{ selector: "#save", css: "font-size: 20px;" }]);

    // Raw CSS is restored as an undoable step.
    injector.undoRawCss();
    expect(styleElement()?.textContent ?? "").not.toContain("font-size: 20px");
  });
});
