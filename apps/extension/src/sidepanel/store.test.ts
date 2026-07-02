import { beforeEach, describe, expect, it } from "vitest";

import { getCurrentStyleRecord, usePanelStore } from "./store";

import type { ElementSnapshot } from "@ui-buddy/shared";

const createSnapshot = (
  selector: string,
  computedStyles: Record<string, string>,
): ElementSnapshot => ({
  tagName: "div",
  id: selector.startsWith("#") ? selector.slice(1) : "",
  classList: selector.startsWith(".") ? [selector.slice(1)] : [],
  textPreview: "",
  attributes: {},
  selector,
  domPath: `html > body > ${selector}`,
  rect: { x: 0, y: 0, top: 0, right: 100, bottom: 40, left: 0, width: 100, height: 40 },
  computedStyles,
  boxModel: {
    margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
    border: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
    padding: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
    content: { width: "100px", height: "40px" },
  },
  parentLayout: null,
});

describe("sidepanel store", () => {
  beforeEach(() => {
    usePanelStore.setState({
      accessibilityNotes: [],
      changes: [],
      measurementTarget: null,
      redoStack: [],
      selectedElement: null,
    });
  });

  it("keeps page style changes when selecting another element", () => {
    const firstElement = createSnapshot("#save", { color: "black" });
    const secondElement = createSnapshot("#cancel", { color: "blue" });

    usePanelStore.getState().setSelectedElement(firstElement);
    const change = usePanelStore.getState().prepareStyleChange("color", "white");

    expect(change).not.toBeNull();

    usePanelStore.getState().applyLocalStyleChange(change!);
    usePanelStore.getState().setSelectedElement(secondElement);

    expect(usePanelStore.getState().changes).toEqual([change]);
    expect(getCurrentStyleRecord(usePanelStore.getState()).color).toBe("blue");

    usePanelStore.getState().setSelectedElement(firstElement);

    expect(getCurrentStyleRecord(usePanelStore.getState()).color).toBe("white");
  });
});
