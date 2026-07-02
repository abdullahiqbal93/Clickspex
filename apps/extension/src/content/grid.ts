export class GridController {
  private active = false;
  private readonly host: HTMLDivElement;
  private readonly shadowRootRef: ShadowRoot;
  private readonly gridContainer: HTMLDivElement;

  public constructor() {
    this.host = document.createElement("div");
    this.host.id = "__ui-buddy-grid-host__";
    this.host.style.position = "fixed";
    this.host.style.inset = "0";
    this.host.style.zIndex = "2147483646"; // Just below ruler/picker
    this.host.style.pointerEvents = "none";

    this.shadowRootRef = this.host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      :host {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        pointer-events: none;
      }
      .grid-container {
        display: flex;
        justify-content: center;
        width: 100%;
        height: 100%;
        max-width: 1200px;
        margin: 0 auto;
        padding: 0 16px;
        box-sizing: border-box;
      }
      .column {
        flex: 1;
        height: 100%;
        background-color: rgba(239, 68, 68, 0.1);
        margin: 0 8px;
        border-left: 1px solid rgba(239, 68, 68, 0.2);
        border-right: 1px solid rgba(239, 68, 68, 0.2);
      }
    `;
    this.shadowRootRef.appendChild(style);

    this.gridContainer = document.createElement("div");
    this.gridContainer.className = "grid-container";

    // Create 12 columns
    for (let i = 0; i < 12; i++) {
      const col = document.createElement("div");
      col.className = "column";
      this.gridContainer.appendChild(col);
    }

    this.shadowRootRef.appendChild(this.gridContainer);
  }

  public enable(): void {
    if (this.active) return;
    this.active = true;

    if (!this.host.parentNode) {
      document.documentElement.appendChild(this.host);
    }
  }

  public disable(): void {
    if (!this.active) return;
    this.active = false;

    if (this.host.parentNode) {
      this.host.parentNode.removeChild(this.host);
    }
  }

  public toggle(): boolean {
    if (this.active) {
      this.disable();
    } else {
      this.enable();
    }
    return this.active;
  }
}
