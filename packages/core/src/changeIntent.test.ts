import { describe, expect, it } from "vitest";

import { createUIChangeIntent } from "./changeIntent";
import { createStyleChange, diffStyles } from "./styleDiff";

import type { ElementSnapshot } from "@clickspex/shared";

const snapshot: ElementSnapshot = {
  tagName: "button",
  id: "save",
  classList: ["primary"],
  textPreview: "Save",
  attributes: { id: "save", class: "primary" },
  selector: "#save",
  domPath: "html > body > button#save:nth-of-type(1)",
  rect: { x: 0, y: 0, top: 0, right: 100, bottom: 40, left: 0, width: 100, height: 40 },
  computedStyles: { color: "black", width: "100px", "font-size": "14px" },
  boxModel: {
    margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
    border: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
    padding: { top: "4px", right: "8px", bottom: "4px", left: "8px" },
    content: { width: "100px", height: "40px" },
  },
  parentLayout: null,
};

describe("createUIChangeIntent", () => {
  it("builds the required before/after schema from a selected element and style changes", () => {
    const change = createStyleChange(
      "#save",
      "color",
      "black",
      "white",
      "2026-07-01T00:00:00.000Z",
    );
    const intent = createUIChangeIntent({
      id: "intent-1",
      timestamp: "2026-07-01T00:00:00.000Z",
      pageUrl: "https://example.com",
      viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
      target: snapshot,
      changes: [change],
    });

    expect(intent).toMatchObject({
      id: "intent-1",
      timestamp: "2026-07-01T00:00:00.000Z",
      pageUrl: "https://example.com",
      viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
      target: { selector: "#save", id: "save" },
      changes: [change],
    });
    expect(intent.before.styles.color).toBe("black");
    expect(intent.after.styles.color).toBe("white");
    expect(JSON.parse(JSON.stringify(intent))).toMatchObject({ id: "intent-1" });
  });

  it("generates a unique id and valid ISO timestamp when values are omitted", () => {
    const intent = createUIChangeIntent({
      pageUrl: "https://example.com",
      viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
      target: snapshot,
      changes: [],
    });

    expect(intent.id).toMatch(
      /^ui-change-\d+-[a-z0-9]+$|^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(Number.isNaN(Date.parse(intent.timestamp))).toBe(false);
  });

  it("includes only changes for the selected target", () => {
    const targetChange = createStyleChange(
      "#save",
      "color",
      "black",
      "white",
      "2026-07-01T00:00:00.000Z",
    );
    const otherChange = createStyleChange(
      "#cancel",
      "color",
      "blue",
      "red",
      "2026-07-01T00:00:00.000Z",
    );

    const intent = createUIChangeIntent({
      pageUrl: "https://example.com",
      viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
      target: snapshot,
      changes: [targetChange, otherChange],
    });

    expect(intent.changes).toEqual([targetChange]);
    expect(intent.after.styles.color).toBe("white");
  });
  it("keeps pseudo-state changes in changes but out of base after styles", () => {
    const change = createStyleChange(
      "#save",
      "transform",
      "",
      "scale(1.04)",
      "2026-07-01T00:00:00.000Z",
      "hover",
    );

    const intent = createUIChangeIntent({
      pageUrl: "https://example.com",
      viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
      target: snapshot,
      changes: [change],
    });

    expect(intent.changes).toEqual([change]);
    expect(intent.after.styles.transform).toBeUndefined();
  });
  it("uses style diffs that include only actually changed properties", () => {
    const changes = diffStyles(
      "#save",
      { color: "black", width: "100px", "font-size": "14px" },
      { color: "white", width: "100px", "font-size": "16px" },
      "2026-07-01T00:00:00.000Z",
    );
    const intent = createUIChangeIntent({
      pageUrl: "https://example.com",
      viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
      target: snapshot,
      changes,
    });

    expect(intent.changes.map((change) => change.property)).toEqual(["color", "font-size"]);
    expect(
      intent.changes.filter((change) => change.beforeValue !== change.afterValue),
    ).toHaveLength(intent.changes.length);
  });
});
