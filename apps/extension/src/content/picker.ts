import { captureElementSnapshot } from "@ui-buddy/core";

import { sendRuntimeMessage } from "../chrome/messaging";
import { writePageContext } from "../chrome/session";

import type { OverlayController } from "./overlay";
import type { ElementSnapshot } from "@ui-buddy/shared";

const getPageContext = () => ({
  pageUrl: window.location.href,
  viewport: {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
  },
});

const isInspectableElement = (
  target: EventTarget | null,
  overlayHost: HTMLElement,
): target is Element =>
  target instanceof Element && target !== overlayHost && !overlayHost.contains(target);

type PickerMode = "select" | "measure";

type PickerCallbacks = {
  onElementSelected?: () => void;
};

export class ElementPickerController {
  private active = false;
  private hoveredElement: Element | null = null;
  private mode: PickerMode = "select";
  private selectedSnapshot: ElementSnapshot | null = null;
  private selectedElementNode: Element | null = null;
  private isEditingText = false;

  public constructor(
    private readonly overlay: OverlayController,
    private readonly callbacks: PickerCallbacks = {},
  ) {}

  public enable(mode: PickerMode = "select", sourceSnapshot?: ElementSnapshot): void {
    this.mode = mode;

    if (sourceSnapshot !== undefined) {
      this.selectedSnapshot = sourceSnapshot;
    }

    if (this.active) {
      return;
    }

    this.active = true;
    document.addEventListener("pointermove", this.handlePointerMove, true);
    document.addEventListener("click", this.handleClick, true);
    document.addEventListener("dblclick", this.handleDoubleClick, true);
    document.addEventListener("keydown", this.handleKeyDown, true);
  }

  public disable(): void {
    if (!this.active) {
      return;
    }

    this.active = false;
    this.hoveredElement = null;
    this.overlay.clearHover();
    this.overlay.clearMeasurement();
    document.removeEventListener("pointermove", this.handlePointerMove, true);
    document.removeEventListener("click", this.handleClick, true);
    document.removeEventListener("dblclick", this.handleDoubleClick, true);
    document.removeEventListener("keydown", this.handleKeyDown, true);
  }

  public isActive(): boolean {
    return this.active;
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.isEditingText || !this.active || !isInspectableElement(event.target, this.overlay.hostElement)) {
      return;
    }

    const element = event.target;

    if (element === this.hoveredElement) {
      return;
    }

    this.hoveredElement = element;
    const snapshot = captureElementSnapshot(element);
    this.overlay.showHover(snapshot);

    if (this.selectedSnapshot !== null && this.selectedElementNode !== element) {
      this.overlay.showMeasurement(this.selectedSnapshot.rect, snapshot.rect);
    }

    void sendRuntimeMessage({
      type: "ELEMENT_HOVERED",
      payload: {
        selector: snapshot.selector,
        rect: snapshot.rect,
      },
    });
  };

  private readonly selectElement = (element: Element) => {
    const snapshot = captureElementSnapshot(element);
    void writePageContext(getPageContext());

    if (this.mode === "measure") {
      void sendRuntimeMessage({ type: "MEASURE_TARGET_SELECTED", payload: snapshot });
      this.disable();
      if (this.selectedSnapshot !== null) {
        this.overlay.showMeasurement(this.selectedSnapshot.rect, snapshot.rect);
      }
      return;
    }

    this.selectedSnapshot = snapshot;
    this.selectedElementNode = element;
    this.overlay.showSelected(element.getBoundingClientRect());
    void sendRuntimeMessage({ type: "ELEMENT_SELECTED", payload: snapshot });
  };

  public selectAncestor(depth: number): void {
    if (!this.selectedElementNode) return;
    let target: Element | null = this.selectedElementNode;
    for (let i = 0; i < depth; i++) {
      target = target?.parentElement || null;
    }
    if (target && target.tagName !== "HTML" && target.tagName !== "BODY") {
      this.selectElement(target);
    }
  }

  private readonly handleClick = (event: MouseEvent): void => {
    if (this.isEditingText || !this.active || !isInspectableElement(event.target, this.overlay.hostElement)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.selectElement(event.target as Element);
  };

  private readonly handleDoubleClick = (event: MouseEvent): void => {
    if (!this.active || !isInspectableElement(event.target, this.overlay.hostElement)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    
    this.isEditingText = true;

    const element = event.target as HTMLElement;
    
    element.contentEditable = "true";
    element.focus();

    // Select all text
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);

    const onBlur = () => {
      this.isEditingText = false;
      element.contentEditable = "false";
      element.removeEventListener("blur", onBlur);
    };

    element.addEventListener("blur", onBlur);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    // Ignore keystrokes if the user is typing in an input or editable element
    if (this.isEditingText || (event.target instanceof HTMLElement && (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA" || event.target.isContentEditable))) {
      return;
    }

    if (event.key === "Escape") {
      if (this.selectedElementNode) {
        // Clear selection first
        this.selectedElementNode = null;
        this.selectedSnapshot = null;
        this.overlay.clearSelected();
        void sendRuntimeMessage({ type: "ELEMENT_UNSELECTED" }); 
      } else {
        // Disable completely if no selection
        this.disable();
        void sendRuntimeMessage({ type: "PICKER_DISABLE" });
      }
      return;
    }

    if (this.selectedElementNode && event.altKey) {
      if (event.key === "ArrowUp" && this.selectedElementNode.parentElement) {
        event.preventDefault();
        event.stopPropagation();
        this.selectElement(this.selectedElementNode.parentElement);
        return;
      }
      if (event.key === "ArrowDown" && this.selectedElementNode.firstElementChild) {
        event.preventDefault();
        event.stopPropagation();
        this.selectElement(this.selectedElementNode.firstElementChild);
        return;
      }
      if (event.key === "ArrowLeft" && this.selectedElementNode.previousElementSibling) {
        event.preventDefault();
        event.stopPropagation();
        this.selectElement(this.selectedElementNode.previousElementSibling);
        return;
      }
      if (event.key === "ArrowRight" && this.selectedElementNode.nextElementSibling) {
        event.preventDefault();
        event.stopPropagation();
        this.selectElement(this.selectedElementNode.nextElementSibling);
        return;
      }
    }

    if ((event.key === "Delete" || event.key === "Backspace") && this.selectedElementNode) {
      event.preventDefault();
      event.stopPropagation();
      
      const el = this.selectedElementNode as HTMLElement;
      // We hide it rather than removing it so we don't break the page permanently during testing
      el.style.display = "none";
      el.style.visibility = "hidden";
      
      this.selectedElementNode = null;
      this.selectedSnapshot = null;
      this.overlay.clearSelected();
      // Send a dummy null to clear the side panel
      void sendRuntimeMessage({ type: "PICKER_DISABLE" }); // Quick hack to reset state
    }
  };
}
