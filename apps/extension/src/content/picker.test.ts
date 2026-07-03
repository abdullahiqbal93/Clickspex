import { captureElementSnapshot } from "@ui-buddy/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sendRuntimeMessage } from "../chrome/messaging";

import { OverlayController } from "./overlay";
import { ElementPickerController } from "./picker";

vi.mock("../chrome/messaging", () => ({
  sendRuntimeMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../chrome/session", () => ({
  writePageContext: vi.fn().mockResolvedValue(undefined),
}));

const mockedSendRuntimeMessage = vi.mocked(sendRuntimeMessage);

describe("ElementPickerController", () => {
  beforeEach(() => {
    document.documentElement.innerHTML =
      "<head></head><body><button id='save' class='btn'>Save</button><div id='card' role='region' aria-label='Profile card'>Card text</div><img id='hero' src='old.png' alt='Hero'></body>";
    mockedSendRuntimeMessage.mockClear();
  });

  it("keeps inspect mode active after selecting an element", () => {
    const onElementSelected = vi.fn();
    const picker = new ElementPickerController(new OverlayController(), { onElementSelected });
    const button = document.getElementById("save");

    if (button === null) {
      throw new Error("Expected fixture button.");
    }

    picker.enable("select");
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(onElementSelected).toHaveBeenCalledOnce();
    expect(picker.isActive()).toBe(true);
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ELEMENT_SELECTED" }),
    );
  });
  it("searches elements by selector and readable metadata", () => {
    const picker = new ElementPickerController(new OverlayController());

    expect(picker.searchElements("#save")[0]?.selector).toBe("#save");
    expect(picker.searchElements("Profile").some((result) => result.selector === "#card")).toBe(
      true,
    );
  });

  it("pins multiple measurements without stopping measure mode", () => {
    const overlay = new OverlayController();
    const pinMeasurement = vi.spyOn(overlay, "pinMeasurement");
    const picker = new ElementPickerController(overlay);
    const button = document.getElementById("save");
    const card = document.getElementById("card");

    if (button === null || card === null) {
      throw new Error("Expected fixture elements.");
    }

    picker.enable("measure", captureElementSnapshot(button));
    card.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true }),
    );

    expect(pinMeasurement).toHaveBeenCalledOnce();
    expect(picker.isActive()).toBe(true);
    expect(mockedSendRuntimeMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "MEASURE_TARGET_SELECTED" }),
    );
  });

  it("nudges and restores selected elements with transform offsets", () => {
    const picker = new ElementPickerController(new OverlayController());
    const button = document.getElementById("save") as HTMLElement | null;

    if (button === null) {
      throw new Error("Expected fixture button.");
    }

    picker.enable("select");
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    picker.nudgeSelectedElement(8, -4);

    expect(button.style.translate).toBe("8px -4px");

    picker.restoreSelectedElement();

    expect(button.style.translate).toBe("");
  });

  it("replaces selected image sources", () => {
    const picker = new ElementPickerController(new OverlayController());
    const image = document.getElementById("hero") as HTMLImageElement | null;

    if (image === null) {
      throw new Error("Expected fixture image.");
    }

    picker.enable("select");
    image.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    picker.replaceSelectedImage("https://example.com/new.png");

    expect(image.src).toBe("https://example.com/new.png");
  });

  it("replaces selected element backgrounds when no image child exists", () => {
    const picker = new ElementPickerController(new OverlayController());
    const card = document.getElementById("card") as HTMLElement | null;

    if (card === null) {
      throw new Error("Expected fixture card.");
    }

    picker.enable("select");
    card.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    picker.replaceSelectedImage("data:image/png;base64,abc");

    expect(card.style.backgroundImage).toContain("data:image/png;base64,abc");
  });
  it("moves selected elements to previous and next sibling positions", () => {
    document.documentElement.innerHTML =
      "<head></head><body><main id='list'><span id='first'>First</span><span id='second'>Second</span><span id='third'>Third</span></main></body>";
    const picker = new ElementPickerController(new OverlayController());
    const list = document.getElementById("list");
    const second = document.getElementById("second");

    if (list === null || second === null) {
      throw new Error("Expected sibling move fixture.");
    }

    picker.enable("select");
    second.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    picker.moveSelectedElement("previous");

    expect(Array.from(list.children, (child) => child.id)).toEqual(["second", "first", "third"]);

    picker.moveSelectedElement("next");

    expect(Array.from(list.children, (child) => child.id)).toEqual(["first", "second", "third"]);
  });

  it("moves selected elements out above and under their parent", () => {
    document.documentElement.innerHTML =
      "<head></head><body><section id='before'></section><div id='parent'><span id='child'>Child</span><span id='sibling'>Sibling</span></div><section id='after'></section></body>";
    const picker = new ElementPickerController(new OverlayController());
    const child = document.getElementById("child");
    const parent = document.getElementById("parent");

    if (child === null || parent === null) {
      throw new Error("Expected out move fixture.");
    }

    picker.enable("select");
    child.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    picker.moveSelectedElement("out-before");

    expect(Array.from(document.body.children, (element) => element.id)).toEqual([
      "before",
      "child",
      "parent",
      "after",
    ]);

    parent.prepend(child);

    picker.moveSelectedElement("out-after");

    expect(Array.from(document.body.children, (element) => element.id)).toEqual([
      "before",
      "parent",
      "child",
      "after",
    ]);
  });

  it("restores selected elements to their original sibling position", () => {
    document.documentElement.innerHTML =
      "<head></head><body><main id='list'><span id='first'>First</span><span id='second'>Second</span><span id='third'>Third</span></main></body>";
    const picker = new ElementPickerController(new OverlayController());
    const list = document.getElementById("list");
    const second = document.getElementById("second");

    if (list === null || second === null) {
      throw new Error("Expected sibling restore fixture.");
    }

    picker.enable("select");
    second.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    picker.moveSelectedElement("previous");
    picker.moveSelectedElement("previous");
    picker.restoreSelectedElement();

    expect(Array.from(list.children, (child) => child.id)).toEqual(["first", "second", "third"]);
  });

  it("restores selected elements moved out of their parent", () => {
    document.documentElement.innerHTML =
      "<head></head><body><section id='before'></section><div id='parent'><span id='child'>Child</span><span id='sibling'>Sibling</span></div><section id='after'></section></body>";
    const picker = new ElementPickerController(new OverlayController());
    const child = document.getElementById("child");
    const parent = document.getElementById("parent");

    if (child === null || parent === null) {
      throw new Error("Expected out restore fixture.");
    }

    picker.enable("select");
    child.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    picker.moveSelectedElement("out-after");
    picker.restoreSelectedElement();

    expect(Array.from(document.body.children, (element) => element.id)).toEqual([
      "before",
      "parent",
      "after",
    ]);
    expect(Array.from(parent.children, (element) => element.id)).toEqual(["child", "sibling"]);
  });

  it("restores selected elements after mixed DOM moves and nudges", () => {
    document.documentElement.innerHTML =
      "<head></head><body><main id='list'><button id='first'>First</button><button id='second'>Second</button><button id='third'>Third</button></main></body>";
    const picker = new ElementPickerController(new OverlayController());
    const list = document.getElementById("list");
    const second = document.getElementById("second") as HTMLElement | null;

    if (list === null || second === null) {
      throw new Error("Expected mixed restore fixture.");
    }

    picker.enable("select");
    second.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    picker.nudgeSelectedElement(8, 8);
    picker.moveSelectedElement("next");
    picker.restoreSelectedElement();

    expect(second.style.translate).toBe("");
    expect(Array.from(list.children, (child) => child.id)).toEqual(["first", "second", "third"]);
  });
  it("undoes and redoes sibling DOM moves", () => {
    document.documentElement.innerHTML =
      "<head></head><body><main id='list'><span id='first'>First</span><span id='second'>Second</span><span id='third'>Third</span></main></body>";
    const picker = new ElementPickerController(new OverlayController());
    const list = document.getElementById("list");
    const second = document.getElementById("second");

    if (list === null || second === null) {
      throw new Error("Expected sibling undo fixture.");
    }

    picker.enable("select");
    second.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    picker.moveSelectedElement("previous");
    expect(Array.from(list.children, (child) => child.id)).toEqual(["second", "first", "third"]);

    picker.undoMovePosition();
    expect(Array.from(list.children, (child) => child.id)).toEqual(["first", "second", "third"]);

    picker.redoMovePosition();
    expect(Array.from(list.children, (child) => child.id)).toEqual(["second", "first", "third"]);
  });

  it("undoes and redoes nudge offsets", () => {
    const picker = new ElementPickerController(new OverlayController());
    const button = document.getElementById("save") as HTMLElement | null;

    if (button === null) {
      throw new Error("Expected fixture button.");
    }

    picker.enable("select");
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    picker.nudgeSelectedElement(8, -4);
    expect(button.style.translate).toBe("8px -4px");

    picker.undoMovePosition();
    expect(button.style.translate).toBe("");

    picker.redoMovePosition();
    expect(button.style.translate).toBe("8px -4px");
  });

  it("undoes and redoes mixed DOM moves and nudges one step at a time", () => {
    document.documentElement.innerHTML =
      "<head></head><body><main id='list'><button id='first'>First</button><button id='second'>Second</button><button id='third'>Third</button></main></body>";
    const picker = new ElementPickerController(new OverlayController());
    const list = document.getElementById("list");
    const second = document.getElementById("second") as HTMLElement | null;

    if (list === null || second === null) {
      throw new Error("Expected mixed undo fixture.");
    }

    picker.enable("select");
    second.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    picker.moveSelectedElement("next");
    picker.nudgeSelectedElement(8, 8);

    expect(Array.from(list.children, (child) => child.id)).toEqual(["first", "third", "second"]);
    expect(second.style.translate).toBe("8px 8px");

    picker.undoMovePosition();
    expect(Array.from(list.children, (child) => child.id)).toEqual(["first", "third", "second"]);
    expect(second.style.translate).toBe("");

    picker.undoMovePosition();
    expect(Array.from(list.children, (child) => child.id)).toEqual(["first", "second", "third"]);

    picker.redoMovePosition();
    expect(Array.from(list.children, (child) => child.id)).toEqual(["first", "third", "second"]);
    expect(second.style.translate).toBe("");

    picker.redoMovePosition();
    expect(Array.from(list.children, (child) => child.id)).toEqual(["first", "third", "second"]);
    expect(second.style.translate).toBe("8px 8px");
  });
  it("does not move body-level elements out past the document body", () => {
    document.documentElement.innerHTML =
      "<head></head><body><section id='first'></section><section id='second'></section></body>";
    const picker = new ElementPickerController(new OverlayController());
    const first = document.getElementById("first");

    if (first === null) {
      throw new Error("Expected body-level fixture.");
    }

    picker.enable("select");
    first.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    picker.moveSelectedElement("out-before");
    picker.moveSelectedElement("out-after");

    expect(Array.from(document.body.children, (element) => element.id)).toEqual([
      "first",
      "second",
    ]);
  });
  it("clears the selected element on Escape without stopping inspect mode", () => {
    const picker = new ElementPickerController(new OverlayController());
    const button = document.getElementById("save");

    if (button === null) {
      throw new Error("Expected fixture button.");
    }

    picker.enable("select");
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    mockedSendRuntimeMessage.mockClear();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(picker.isActive()).toBe(true);
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({ type: "ELEMENT_UNSELECTED" });
  });

  it("clears the selected element when inspect mode is disabled", () => {
    const picker = new ElementPickerController(new OverlayController());
    const button = document.getElementById("save");

    if (button === null) {
      throw new Error("Expected fixture button.");
    }

    picker.enable("select");
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    mockedSendRuntimeMessage.mockClear();

    picker.disable();

    expect(picker.isActive()).toBe(false);
    expect(mockedSendRuntimeMessage).toHaveBeenCalledWith({ type: "ELEMENT_UNSELECTED" });
  });
});
