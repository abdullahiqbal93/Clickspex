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
      historyRedoDepth: 0,
      historyUndoDepth: 0,
      measurementTarget: null,
      selectedElement: null,
    });
  });

  it("layers responsive style overrides above all-screen values", () => {
    const element = createSnapshot("#hero", { width: "320px" });

    usePanelStore.getState().setSelectedElement(element);
    const change = usePanelStore.getState().prepareStyleChange("width", "100%", "base", "mobile");

    expect(change).toMatchObject({ responsiveTarget: "mobile" });

    usePanelStore.getState().applyLocalStyleChange(change!);

    expect(getCurrentStyleRecord(usePanelStore.getState()).width).toBe("320px");
    expect(getCurrentStyleRecord(usePanelStore.getState(), "base", "mobile").width).toBe("100%");
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
  it("hydrates all focused DOM branches from a context response", () => {
    const rootNode = {
      selector: "html",
      domPath: "html",
      tagName: "html",
      id: "",
      classList: [],
      attributes: {},
      textPreview: "",
      childCount: 1,
      visible: true,
    };
    const selectedNode = {
      ...rootNode,
      selector: "#save",
      domPath: "html > body > button#save",
      tagName: "button",
      id: "save",
      textPreview: "Save",
      childCount: 0,
    };

    usePanelStore.getState().setDomContext({
      ancestry: [rootNode, selectedNode],
      children: [],
      childrenBySelector: {
        html: [selectedNode],
        "#save": [],
      },
      selectedSelector: "#save",
    });

    expect(usePanelStore.getState().domChildrenBySelector).toEqual({
      html: [selectedNode],
      "#save": [],
    });
  });
  it("creates and layers arbitrary CSS property changes", () => {
    usePanelStore.getState().setSelectedElement(createSnapshot("#layout", {}));

    const change = usePanelStore
      .getState()
      .prepareStyleChange("grid-template-columns", "1fr 2fr", "base", "desktop");

    expect(change).toMatchObject({
      property: "grid-template-columns",
      responsiveTarget: "desktop",
    });

    usePanelStore.getState().applyLocalStyleChange(change!);

    expect(
      getCurrentStyleRecord(usePanelStore.getState(), "base", "desktop")["grid-template-columns"],
    ).toBe("1fr 2fr");
  });
});
