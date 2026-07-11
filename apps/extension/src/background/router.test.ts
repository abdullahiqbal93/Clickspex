import { describe, expect, it } from "vitest";

import { shouldForwardToSidePanel } from "./router";

import type { ExtensionMessage } from "@ui-buddy/shared";

describe("background message router", () => {
  it("forwards content-script selection messages to the side panel", () => {
    const message: ExtensionMessage = {
      type: "ELEMENT_HOVERED",
      payload: {
        selector: "#save",
        rect: { x: 0, y: 0, top: 0, right: 10, bottom: 10, left: 0, width: 10, height: 10 },
      },
    };

    expect(shouldForwardToSidePanel(message)).toBe(true);
    expect(shouldForwardToSidePanel({ type: "ELEMENT_UNSELECTED" })).toBe(true);
    expect(
      shouldForwardToSidePanel({
        type: "ELEMENT_SEARCH_RESULT",
        payload: { query: "button", results: [] },
      }),
    ).toBe(true);
    expect(
      shouldForwardToSidePanel({
        type: "DOM_CONTEXT_RESULT",
        payload: { ancestry: [], children: [], selectedSelector: null },
      }),
    ).toBe(true);
    expect(
      shouldForwardToSidePanel({
        type: "DOM_CHILDREN_RESULT",
        payload: { selector: "#save", children: [] },
      }),
    ).toBe(true);
  });

  it("forwards session sync and restored-edits messages to the side panel", () => {
    expect(
      shouldForwardToSidePanel({
        type: "SESSION_SYNC",
        payload: {
          styleChanges: [],
          rawCss: [],
          structuralEdits: [],
          undoDepth: 0,
          redoDepth: 0,
        },
      }),
    ).toBe(true);
    expect(shouldForwardToSidePanel({ type: "EDITS_RESTORED", payload: { count: 3 } })).toBe(true);
  });

  it("does not forward side-panel command messages back to the side panel", () => {
    expect(shouldForwardToSidePanel({ type: "PICKER_ENABLE" })).toBe(false);
    expect(shouldForwardToSidePanel({ type: "SET_CAPTURE_MODE", payload: { active: true } })).toBe(
      false,
    );
    expect(
      shouldForwardToSidePanel({ type: "APPLY_RAW_CSS", payload: { selector: ":root", css: "" } }),
    ).toBe(false);
    expect(
      shouldForwardToSidePanel({
        type: "APPLY_STYLE_CHANGE",
        payload: {
          selector: "#save",
          property: "color",
          beforeValue: "black",
          afterValue: "white",
          timestamp: "2026-07-01T00:00:00.000Z",
        },
      }),
    ).toBe(false);
  });
});
