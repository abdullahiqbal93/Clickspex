import { captureElementSnapshot } from "@ui-devtools/core";

import { sendRuntimeMessage } from "../chrome/messaging";

import type { OverlayController } from "./overlay";

const isInspectableElement = (
  target: EventTarget | null,
  overlayHost: HTMLElement,
): target is Element =>
  target instanceof Element && target !== overlayHost && !overlayHost.contains(target);

export class ElementPickerController {
  private active = false;
  private hoveredElement: Element | null = null;

  public constructor(private readonly overlay: OverlayController) {}

  public enable(): void {
    if (this.active) {
      return;
    }

    this.active = true;
    document.addEventListener("pointermove", this.handlePointerMove, true);
    document.addEventListener("click", this.handleClick, true);
    document.addEventListener("keydown", this.handleKeyDown, true);
  }

  public disable(): void {
    if (!this.active) {
      return;
    }

    this.active = false;
    this.hoveredElement = null;
    this.overlay.clearHover();
    document.removeEventListener("pointermove", this.handlePointerMove, true);
    document.removeEventListener("click", this.handleClick, true);
    document.removeEventListener("keydown", this.handleKeyDown, true);
  }

  public isActive(): boolean {
    return this.active;
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.active || !isInspectableElement(event.target, this.overlay.hostElement)) {
      return;
    }

    const element = event.target;

    if (element === this.hoveredElement) {
      return;
    }

    this.hoveredElement = element;
    const rect = element.getBoundingClientRect();
    this.overlay.showHover(rect);

    void sendRuntimeMessage({
      type: "ELEMENT_HOVERED",
      payload: {
        selector: captureElementSnapshot(element).selector,
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        },
      },
    });
  };

  private readonly handleClick = (event: MouseEvent): void => {
    if (!this.active || !isInspectableElement(event.target, this.overlay.hostElement)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const element = event.target;
    const snapshot = captureElementSnapshot(element);
    this.overlay.showSelected(element.getBoundingClientRect());
    void sendRuntimeMessage({ type: "ELEMENT_SELECTED", payload: snapshot });
    this.disable();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      this.disable();
      void sendRuntimeMessage({ type: "PICKER_DISABLE" });
    }
  };
}
