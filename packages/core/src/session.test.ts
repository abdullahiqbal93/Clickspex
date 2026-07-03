import { describe, expect, it } from "vitest";

import { createUIChangeSession, summarizeSessionAsMarkdown } from "./changeIntent";

import type { ElementSnapshot, StructuralEdit, StyleChange } from "@ui-buddy/shared";

const side = { top: "0px", right: "0px", bottom: "0px", left: "0px" };

const snapshot = (selector: string): ElementSnapshot => ({
  tagName: "div",
  id: "",
  classList: [],
  textPreview: "",
  attributes: {},
  selector,
  domPath: selector,
  rect: { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 },
  computedStyles: {},
  boxModel: {
    margin: side,
    border: side,
    padding: side,
    content: { width: "0px", height: "0px" },
  },
  parentLayout: null,
});

const change = (
  selector: string,
  property: StyleChange["property"],
  beforeValue: string,
  afterValue: string,
): StyleChange => ({
  selector,
  property,
  beforeValue,
  afterValue,
  timestamp: "2026-07-01T00:00:00.000Z",
});

describe("createUIChangeSession", () => {
  it("captures every edited element, not just the last selected one", () => {
    const session = createUIChangeSession({
      pageUrl: "https://example.com",
      viewport: { width: 1440, height: 900, devicePixelRatio: 1 },
      elements: [
        { target: snapshot("#a"), changes: [change("#a", "color", "#000000", "#ffffff")] },
        {
          target: snapshot("#b"),
          changes: [change("#b", "font-size", "14px", "16px")],
          rawCss: "display: none;",
        },
        // No changes and no raw CSS — should be dropped from the session.
        { target: snapshot("#c"), changes: [] },
      ],
    });

    expect(session.stats.editedElements).toBe(2);
    expect(session.elements.map((element) => element.target.selector)).toEqual(["#a", "#b"]);
    expect(session.stats.styleChanges).toBe(2);
    expect(session.elements[1]!.rawCss).toBe("display: none;");
  });

  it("keeps structural edits and includes them in the markdown summary", () => {
    const edit: StructuralEdit = {
      id: "edit-1",
      kind: "delete",
      timestamp: "2026-07-01T00:00:00.000Z",
      target: { tagName: "div", classList: [], selector: "#d", domPath: "#d" },
      summary: "Hid element",
      details: {},
    };

    const session = createUIChangeSession({
      pageUrl: "https://example.com",
      viewport: { width: 0, height: 0, devicePixelRatio: 1 },
      elements: [{ target: snapshot("#a"), changes: [change("#a", "color", "#000000", "#ffffff")] }],
      structuralEdits: [edit],
    });

    expect(session.structuralEdits).toHaveLength(1);
    expect(session.stats.structuralEdits).toBe(1);

    const markdown = summarizeSessionAsMarkdown(session);
    expect(markdown).toContain("#a");
    expect(markdown).toContain("Structural edits");
    expect(markdown).toContain("Hid element");
  });
});
