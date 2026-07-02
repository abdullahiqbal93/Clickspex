import type { ElementSnapshot, RectSnapshot } from "@ui-buddy/shared";

const HOST_ID = "__ui-buddy-host__";

const px = (v: number): string => `${Math.round(v)}px`;

const parseVal = (v: string): number => parseFloat(v) || 0;

export class OverlayController {
  private readonly host: HTMLDivElement;
  private readonly shadowRootRef: ShadowRoot;
  private readonly hoverBox: HTMLDivElement;
  private readonly selectedBox: HTMLDivElement;
  private readonly measurementLayer: HTMLDivElement;
  private readonly tooltip: HTMLDivElement;

  public constructor(documentRef: Document = document) {
    const existingHost = documentRef.getElementById(HOST_ID);

    if (existingHost instanceof HTMLDivElement && existingHost.shadowRoot !== null) {
      this.host = existingHost;
      this.shadowRootRef = existingHost.shadowRoot;
      this.hoverBox = this.getOrCreateBox("hover-box");
      this.selectedBox = this.getOrCreateBox("selected-box");
      this.measurementLayer = this.getOrCreateBox("measure-layer");
      this.tooltip = this.getOrCreateBox("tooltip");
      return;
    }

    this.host = documentRef.createElement("div");
    this.host.id = HOST_ID;
    this.shadowRootRef = this.host.attachShadow({ mode: "open" });
    this.shadowRootRef.append(this.createStyle(documentRef));
    this.hoverBox = this.createBox(documentRef, "hover-box");
    this.selectedBox = this.createBox(documentRef, "selected-box");
    this.measurementLayer = this.createBox(documentRef, "measure-layer");
    this.tooltip = this.createBox(documentRef, "tooltip");
    this.shadowRootRef.append(this.hoverBox, this.selectedBox, this.measurementLayer, this.tooltip);
    documentRef.documentElement.append(this.host);
  }

  public get hostElement(): HTMLDivElement {
    return this.host;
  }

  public showHover(snapshot: ElementSnapshot): void {
    this.updateBoxModel(this.hoverBox, snapshot);
    this.updateTooltip(snapshot);
  }

  public showSelected(rect: DOMRect | DOMRectReadOnly): void {
    this.updateBox(this.selectedBox, rect);
  }

  public showMeasurement(source: RectSnapshot, target: RectSnapshot): void {
    this.measurementLayer.hidden = false;
    this.measurementLayer.replaceChildren();

    const hY = Math.min(source.bottom, target.bottom) + 12;
    const hStart = source.right <= target.left ? source.right : target.right;
    const hEnd = source.right <= target.left ? target.left : source.left;
    const vX = Math.min(source.right, target.right) + 12;
    const vStart = source.bottom <= target.top ? source.bottom : target.bottom;
    const vEnd = source.bottom <= target.top ? target.top : source.top;

    this.measurementLayer.append(
      this.createLine("horizontal", hStart, hY, hEnd - hStart),
      this.createLabel(`${Math.abs(Math.round(hEnd - hStart))}px`, (hStart + hEnd) / 2, hY),
      this.createLine("vertical", vX, vStart, vEnd - vStart),
      this.createLabel(`${Math.abs(Math.round(vEnd - vStart))}px`, vX, (vStart + vEnd) / 2),
    );
  }

  public clearHover(): void {
    this.hoverBox.hidden = true;
    this.tooltip.hidden = true;
  }

  public clearSelected(): void {
    this.selectedBox.hidden = true;
  }

  public clearMeasurement(): void {
    this.measurementLayer.hidden = true;
  }

  // ── tooltip ──────────────────────────────────────────

  private updateTooltip(snapshot: ElementSnapshot): void {
    const { rect, tagName, id, classList } = snapshot;
    const doc = this.host.ownerDocument;
    this.tooltip.replaceChildren();
    this.tooltip.hidden = false;

    let selector = tagName;
    if (id) selector += `#${id}`;
    if (classList.length > 0) selector += "." + classList.slice(0, 2).join(".");

    const tag = doc.createElement("span");
    tag.setAttribute("data-tt", "tag");
    tag.textContent = selector;

    const dims = doc.createElement("span");
    dims.setAttribute("data-tt", "dims");
    dims.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;

    this.tooltip.append(tag, dims);

    const vh = doc.documentElement.clientHeight;
    let top = rect.bottom + 8;
    if (top + 36 > vh) top = rect.top - 36;
    let left = rect.left;
    if (left < 4) left = 4;

    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  // ── box model with spacing labels ────────────────────

  private updateBoxModel(container: HTMLDivElement, snapshot: ElementSnapshot): void {
    container.hidden = false;
    const { rect, boxModel } = snapshot;
    const { margin, padding, border } = boxModel;
    const doc = this.host.ownerDocument;

    container.replaceChildren();
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.top}px`;
    container.style.width = `${rect.width}px`;
    container.style.height = `${rect.height}px`;
    container.style.overflow = "visible";

    // margin zone (orange) — uses negative offsets to extend outward
    const mBox = doc.createElement("div");
    mBox.style.cssText = `position:absolute;top:-${margin.top};right:-${margin.right};bottom:-${margin.bottom};left:-${margin.left};border-style:solid;border-color:rgb(249 204 157/.65);border-width:${margin.top} ${margin.right} ${margin.bottom} ${margin.left};pointer-events:none;`;

    // border zone (yellow)
    const bBox = doc.createElement("div");
    bBox.style.cssText = `position:absolute;inset:0;border-style:solid;border-color:rgb(253 224 71/.65);border-width:${border.top} ${border.right} ${border.bottom} ${border.left};pointer-events:none;`;

    // padding zone (green)
    const pBox = doc.createElement("div");
    pBox.style.cssText = `position:absolute;top:${border.top};right:${border.right};bottom:${border.bottom};left:${border.left};border-style:solid;border-color:rgb(134 239 172/.55);border-width:${padding.top} ${padding.right} ${padding.bottom} ${padding.left};pointer-events:none;`;

    // content zone (blue)
    const cBox = doc.createElement("div");
    cBox.style.cssText = `position:absolute;top:calc(${border.top} + ${padding.top});right:calc(${border.right} + ${padding.right});bottom:calc(${border.bottom} + ${padding.bottom});left:calc(${border.left} + ${padding.left});background:rgb(147 197 253/.45);pointer-events:none;`;

    container.append(cBox, pBox, bBox, mBox);

    // spacing labels
    const mt = parseVal(margin.top), mr = parseVal(margin.right), mb = parseVal(margin.bottom), ml = parseVal(margin.left);
    const pt = parseVal(padding.top), pr = parseVal(padding.right), pb = parseVal(padding.bottom), pl = parseVal(padding.left);
    const bt = parseVal(border.top), brt = parseVal(border.right), bb = parseVal(border.bottom), blt = parseVal(border.left);
    const w = rect.width, h = rect.height;

    // margin labels
    if (mt > 2) this.addLabel(container, doc, w / 2, -mt / 2, margin.top, "m");
    if (mr > 2) this.addLabel(container, doc, w + mr / 2, h / 2, margin.right, "m");
    if (mb > 2) this.addLabel(container, doc, w / 2, h + mb / 2, margin.bottom, "m");
    if (ml > 2) this.addLabel(container, doc, -ml / 2, h / 2, margin.left, "m");

    // padding labels
    if (pt > 2) this.addLabel(container, doc, w / 2, bt + pt / 2, padding.top, "p");
    if (pr > 2) this.addLabel(container, doc, w - brt - pr / 2, h / 2, padding.right, "p");
    if (pb > 2) this.addLabel(container, doc, w / 2, h - bb - pb / 2, padding.bottom, "p");
    if (pl > 2) this.addLabel(container, doc, blt + pl / 2, h / 2, padding.left, "p");
  }

  private addLabel(parent: HTMLDivElement, doc: Document, x: number, y: number, value: string, type: "m" | "p"): void {
    const el = doc.createElement("div");
    el.setAttribute("data-sl", type);
    el.textContent = value;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    parent.append(el);
  }

  // ── helpers ──────────────────────────────────────────

  private getOrCreateBox(testId: string): HTMLDivElement {
    const existing = this.shadowRootRef.querySelector<HTMLDivElement>(`[data-overlay="${testId}"]`);
    if (existing !== null) return existing;
    const box = this.host.ownerDocument.createElement("div");
    box.dataset.overlay = testId;
    this.shadowRootRef.append(box);
    return box;
  }

  private createStyle(documentRef: Document): HTMLStyleElement {
    const style = documentRef.createElement("style");
    style.textContent = `
      :host { position:fixed; inset:0; z-index:2147483647; pointer-events:none; }
      [data-overlay] { position:fixed; box-sizing:border-box; border-radius:2px; pointer-events:none; }
      [data-overlay="hover-box"] { overflow:visible; }
      [data-overlay="selected-box"] { border:2px solid #2563eb; background:rgb(37 99 235/.08); }
      [data-overlay="measure-layer"] { inset:0; }
      [data-overlay="tooltip"] {
        display:flex; gap:8px; align-items:center;
        background:#1e293b; color:#fff; border-radius:5px;
        padding:5px 10px; white-space:nowrap;
        box-shadow:0 2px 10px rgba(0,0,0,.25);
        font:500 11px/1.3 ui-sans-serif,system-ui,sans-serif;
      }
      [data-tt="tag"] { color:#93c5fd; font-weight:600; }
      [data-tt="dims"] { color:#94a3b8; font-size:10px; }
      [data-sl] {
        position:absolute; transform:translate(-50%,-50%);
        font:600 9px/1 ui-sans-serif,system-ui,sans-serif;
        padding:1px 3px; border-radius:2px; white-space:nowrap;
        pointer-events:none; z-index:1;
      }
      [data-sl="m"] { color:#92400e; background:rgb(254 243 199/.85); }
      [data-sl="p"] { color:#14532d; background:rgb(220 252 231/.85); }
      [data-measure-line] { position:fixed; background:#14b8a6; box-shadow:0 0 0 1px rgb(255 255 255/.9); }
      [data-measure-line="horizontal"] { height:2px; }
      [data-measure-line="vertical"] { width:2px; }
      [data-measure-label] {
        position:fixed; transform:translate(-50%,-50%); border-radius:4px;
        background:#0f766e; color:white; font:600 11px/1 ui-sans-serif,system-ui,sans-serif;
        padding:4px 6px; white-space:nowrap;
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

  private createLine(orientation: "horizontal" | "vertical", left: number, top: number, length: number): HTMLDivElement {
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
    box.replaceChildren();
  }
}
