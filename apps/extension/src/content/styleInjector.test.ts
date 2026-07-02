import { describe, expect, it, beforeEach } from "vitest";

import { StyleInjector } from "./styleInjector";

import type { StyleChange } from "@ui-buddy/shared";

const styleElement = (): HTMLStyleElement | null =>
  document.getElementById("__ui-buddy-styles__") as HTMLStyleElement | null;

const createChange = (
  property: StyleChange["property"],
  beforeValue: string,
  afterValue: string,
): StyleChange => ({
  selector: "#save",
  property,
  beforeValue,
  afterValue,
  timestamp: "2026-07-01T00:00:00.000Z",
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
      ["#save {", "  color: white;", "  font-size: 16px;", "}"].join("\n"),
    );
  });

  it("undoes back through the applied change history and removes stale rules", () => {
    const injector = new StyleInjector();

    injector.applyChange(createChange("color", "black", "white"));
    injector.applyChange(createChange("color", "white", "red"));

    expect(styleElement()?.textContent).toContain("color: red;");

    injector.undo();

    expect(styleElement()?.textContent).toContain("color: white;");

    injector.undo();

    expect(styleElement()).toBeNull();
  });

  it("redoes reverted changes and clears redo history after a new edit", () => {
    const injector = new StyleInjector();

    injector.applyChange(createChange("color", "black", "white"));
    injector.undo();
    injector.redo();

    expect(styleElement()?.textContent).toContain("color: white;");

    injector.undo();
    injector.applyChange(createChange("font-size", "14px", "16px"));
    injector.redo();

    expect(styleElement()?.textContent).toBe(["#save {", "  font-size: 16px;", "}"].join("\n"));
  });

  it("reset clears style output and history", () => {
    const injector = new StyleInjector();

    injector.applyChange(createChange("color", "black", "white"));
    injector.reset();
    injector.redo();

    expect(styleElement()).toBeNull();
  });
});
