import { sendRuntimeMessage } from "../chrome/messaging";

export class ManualRulerController {
  private active = false;
  private isDrawing = false;
  private startX = 0;
  private startY = 0;
  
  private readonly host: HTMLDivElement;
  private readonly shadowRootRef: ShadowRoot;
  private readonly rulerBox: HTMLDivElement;
  private readonly label: HTMLDivElement;

  public constructor() {
    this.host = document.createElement("div");
    this.host.id = "__ui-buddy-ruler-host__";
    this.host.style.position = "fixed";
    this.host.style.inset = "0";
    this.host.style.zIndex = "2147483647"; // Max z-index
    this.host.style.pointerEvents = "none";
    this.host.style.cursor = "crosshair";
    
    this.shadowRootRef = this.host.attachShadow({ mode: "open" });
    
    const style = document.createElement("style");
    style.textContent = `
      :host {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
      }
      .ruler-box {
        position: fixed;
        border: 1px solid #14b8a6;
        background: rgb(20 184 166 / 0.15);
        display: none;
        pointer-events: none;
      }
      .ruler-label {
        position: absolute;
        bottom: -24px;
        left: 50%;
        transform: translateX(-50%);
        background: #0f766e;
        color: white;
        font: 600 11px/1 ui-sans-serif, system-ui, sans-serif;
        padding: 4px 6px;
        border-radius: 4px;
        white-space: nowrap;
        pointer-events: none;
      }
    `;
    this.shadowRootRef.appendChild(style);

    this.rulerBox = document.createElement("div");
    this.rulerBox.className = "ruler-box";
    this.label = document.createElement("div");
    this.label.className = "ruler-label";
    this.rulerBox.appendChild(this.label);
    
    this.shadowRootRef.appendChild(this.rulerBox);
  }

  public enable(): void {
    if (this.active) return;
    this.active = true;
    
    if (!this.host.parentNode) {
      document.documentElement.appendChild(this.host);
    }
    this.host.style.pointerEvents = "auto";
    
    document.addEventListener("mousedown", this.handleMouseDown, true);
    document.addEventListener("mousemove", this.handleMouseMove, true);
    document.addEventListener("mouseup", this.handleMouseUp, true);
    document.addEventListener("keydown", this.handleKeyDown, true);
  }

  public disable(): void {
    if (!this.active) return;
    this.active = false;
    this.isDrawing = false;
    
    this.host.style.pointerEvents = "none";
    this.rulerBox.style.display = "none";
    
    if (this.host.parentNode) {
      this.host.parentNode.removeChild(this.host);
    }
    
    document.removeEventListener("mousedown", this.handleMouseDown, true);
    document.removeEventListener("mousemove", this.handleMouseMove, true);
    document.removeEventListener("mouseup", this.handleMouseUp, true);
    document.removeEventListener("keydown", this.handleKeyDown, true);
  }

  private readonly handleMouseDown = (e: MouseEvent): void => {
    if (!this.active) return;
    e.preventDefault();
    e.stopPropagation();
    
    this.isDrawing = true;
    this.startX = e.clientX;
    this.startY = e.clientY;
    
    this.rulerBox.style.display = "block";
    this.updateBox(this.startX, this.startY);
  };

  private readonly handleMouseMove = (e: MouseEvent): void => {
    if (!this.active || !this.isDrawing) return;
    e.preventDefault();
    e.stopPropagation();
    
    this.updateBox(e.clientX, e.clientY);
  };

  private readonly handleMouseUp = (e: MouseEvent): void => {
    if (!this.active || !this.isDrawing) return;
    e.preventDefault();
    e.stopPropagation();
    
    this.isDrawing = false;
    this.updateBox(e.clientX, e.clientY);
    
    // We keep the box on screen until they draw a new one or press Escape.
  };

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      this.disable();
      void sendRuntimeMessage({ type: "RULER_DISABLE" });
    }
  };

  private updateBox(endX: number, endY: number): void {
    const left = Math.min(this.startX, endX);
    const top = Math.min(this.startY, endY);
    const width = Math.abs(endX - this.startX);
    const height = Math.abs(endY - this.startY);
    
    this.rulerBox.style.left = `${left}px`;
    this.rulerBox.style.top = `${top}px`;
    this.rulerBox.style.width = `${width}px`;
    this.rulerBox.style.height = `${height}px`;
    
    this.label.textContent = `${width} × ${height}`;
  }
}
