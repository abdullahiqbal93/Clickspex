const HOST_ID = "__ui-devtools-host__";

export class OverlayController {
  private readonly host: HTMLDivElement;
  private readonly shadowRootRef: ShadowRoot;
  private readonly hoverBox: HTMLDivElement;
  private readonly selectedBox: HTMLDivElement;

  public constructor(documentRef: Document = document) {
    const existingHost = documentRef.getElementById(HOST_ID);

    if (existingHost instanceof HTMLDivElement && existingHost.shadowRoot !== null) {
      this.host = existingHost;
      this.shadowRootRef = existingHost.shadowRoot;
      this.hoverBox = this.getOrCreateBox("hover-box");
      this.selectedBox = this.getOrCreateBox("selected-box");
      return;
    }

    this.host = documentRef.createElement("div");
    this.host.id = HOST_ID;
    this.shadowRootRef = this.host.attachShadow({ mode: "open" });
    this.shadowRootRef.append(this.createStyle(documentRef));
    this.hoverBox = this.createBox(documentRef, "hover-box");
    this.selectedBox = this.createBox(documentRef, "selected-box");
    this.shadowRootRef.append(this.hoverBox, this.selectedBox);
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
    `;
    return style;
  }

  private createBox(documentRef: Document, testId: string): HTMLDivElement {
    const box = documentRef.createElement("div");
    box.dataset.overlay = testId;
    box.hidden = true;
    return box;
  }

  private updateBox(box: HTMLDivElement, rect: DOMRect | DOMRectReadOnly): void {
    box.hidden = false;
    box.style.left = `${rect.left}px`;
    box.style.top = `${rect.top}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
  }
}
