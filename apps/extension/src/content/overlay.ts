import type { RectSnapshot } from "@ui-devtools/shared";

const HOST_ID = "__ui-devtools-host__";

export class OverlayController {
  private readonly host: HTMLDivElement;
  private readonly shadowRootRef: ShadowRoot;
  private readonly hoverBox: HTMLDivElement;
  private readonly selectedBox: HTMLDivElement;
  private readonly measurementLayer: HTMLDivElement;

  public constructor(documentRef: Document = document) {
    const existingHost = documentRef.getElementById(HOST_ID);

    if (existingHost instanceof HTMLDivElement && existingHost.shadowRoot !== null) {
      this.host = existingHost;
      this.shadowRootRef = existingHost.shadowRoot;
      this.hoverBox = this.getOrCreateBox("hover-box");
      this.selectedBox = this.getOrCreateBox("selected-box");
      this.measurementLayer = this.getOrCreateBox("measure-layer");
      return;
    }

    this.host = documentRef.createElement("div");
    this.host.id = HOST_ID;
    this.shadowRootRef = this.host.attachShadow({ mode: "open" });
    this.shadowRootRef.append(this.createStyle(documentRef));
    this.hoverBox = this.createBox(documentRef, "hover-box");
    this.selectedBox = this.createBox(documentRef, "selected-box");
    this.measurementLayer = this.createBox(documentRef, "measure-layer");
    this.shadowRootRef.append(this.hoverBox, this.selectedBox, this.measurementLayer);
    documentRef.documentElement.append(this.host);
  }

  public get hostElement(): HTMLDivElement {
    return this.host;
  }

  public showHover(rect: DOMRect | DOMRectReadOnly): void {
    this.updateBox(this.hoverBox, rect);
  }

  public showSelected(rect: DOMRect | DOMRectReadOnly): void {
    this.updateBox(this.selectedBox, rect);
  }

  public showMeasurement(source: RectSnapshot, target: RectSnapshot): void {
    this.measurementLayer.hidden = false;
    this.measurementLayer.replaceChildren();

    const horizontalY = Math.min(source.bottom, target.bottom) + 12;
    const horizontalStart = source.right <= target.left ? source.right : target.right;
    const horizontalEnd = source.right <= target.left ? target.left : source.left;
    const verticalX = Math.min(source.right, target.right) + 12;
    const verticalStart = source.bottom <= target.top ? source.bottom : target.bottom;
    const verticalEnd = source.bottom <= target.top ? target.top : source.top;

    this.measurementLayer.append(
      this.createLine("horizontal", horizontalStart, horizontalY, horizontalEnd - horizontalStart),
      this.createLabel(
        `${Math.abs(Math.round(horizontalEnd - horizontalStart))}px`,
        (horizontalStart + horizontalEnd) / 2,
        horizontalY,
      ),
      this.createLine("vertical", verticalX, verticalStart, verticalEnd - verticalStart),
      this.createLabel(
        `${Math.abs(Math.round(verticalEnd - verticalStart))}px`,
        verticalX,
        (verticalStart + verticalEnd) / 2,
      ),
    );
  }

  public clearHover(): void {
    this.hoverBox.hidden = true;
  }

  public clearSelected(): void {
    this.selectedBox.hidden = true;
  }

  private getOrCreateBox(testId: string): HTMLDivElement {
    const existing = this.shadowRootRef.querySelector<HTMLDivElement>(`[data-overlay="${testId}"]`);

    if (existing !== null) {
      return existing;
    }

    const box = this.host.ownerDocument.createElement("div");
    box.dataset.overlay = testId;
    this.shadowRootRef.append(box);
    return box;
  }

  private createStyle(documentRef: Document): HTMLStyleElement {
    const style = documentRef.createElement("style");
    style.textContent = `
      :host {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: none;
      }

      [data-overlay] {
        position: fixed;
        box-sizing: border-box;
        border-radius: 2px;
        pointer-events: none;
      }

      [data-overlay="hover-box"] {
        border: 1px solid #14b8a6;
        background: rgb(20 184 166 / 0.12);
      }

      [data-overlay="selected-box"] {
        border: 2px solid #2563eb;
        background: rgb(37 99 235 / 0.08);
      }

      [data-overlay="measure-layer"] {
        inset: 0;
      }

      [data-measure-line] {
        position: fixed;
        background: #14b8a6;
        box-shadow: 0 0 0 1px rgb(255 255 255 / 0.9);
      }

      [data-measure-line="horizontal"] {
        height: 2px;
      }

      [data-measure-line="vertical"] {
        width: 2px;
      }

      [data-measure-label] {
        position: fixed;
        transform: translate(-50%, -50%);
        border-radius: 4px;
        background: #0f766e;
        color: white;
        font: 600 11px/1 ui-sans-serif, system-ui, sans-serif;
        padding: 4px 6px;
        white-space: nowrap;
      }
    `;
    return style;
  }

  private createBox(documentRef: Document, testId: string): HTMLDivElement {
    const box = documentRef.createElement("div");
    box.dataset.overlay = testId;
    box.hidden = true;
    return box;
  }

  private createLine(
    orientation: "horizontal" | "vertical",
    left: number,
    top: number,
    length: number,
  ): HTMLDivElement {
    const line = this.host.ownerDocument.createElement("div");
    line.dataset.measureLine = orientation;

    if (orientation === "horizontal") {
      line.style.left = `${Math.min(left, left + length)}px`;
      line.style.top = `${top}px`;
      line.style.width = `${Math.abs(length)}px`;
    } else {
      line.style.left = `${left}px`;
      line.style.top = `${Math.min(top, top + length)}px`;
      line.style.height = `${Math.abs(length)}px`;
    }

    return line;
  }

  private createLabel(text: string, left: number, top: number): HTMLDivElement {
    const label = this.host.ownerDocument.createElement("div");
    label.dataset.measureLabel = "true";
    label.textContent = text;
    label.style.left = `${left}px`;
    label.style.top = `${top}px`;
    return label;
  }

  private updateBox(box: HTMLDivElement, rect: DOMRect | DOMRectReadOnly): void {
    box.hidden = false;
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
  }
}
