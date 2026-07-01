import { describe, expect, it } from "vitest";

import { createUIChangeIntent } from "./changeIntent";
import { createStyleChange } from "./styleDiff";

import type { ElementSnapshot } from "@ui-devtools/shared";

const snapshot: ElementSnapshot = {
  tagName: "button",
  id: "save",
  classList: ["primary"],
  textPreview: "Save",
  attributes: { id: "save", class: "primary" },
  selector: "#save",
  domPath: "html > body > button#save:nth-of-type(1)",
  rect: { x: 0, y: 0, top: 0, right: 100, bottom: 40, left: 0, width: 100, height: 40 },
  computedStyles: { color: "black", width: "100px" },
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

    expect(intent.target).toMatchObject({ selector: "#save", id: "save" });
    expect(intent.before.styles.color).toBe("black");
    expect(intent.after.styles.color).toBe("white");
    expect(intent.changes).toEqual([change]);
  });
});
