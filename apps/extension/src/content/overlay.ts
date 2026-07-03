import { contrastRatioFromCssColors } from "@ui-buddy/core";

import type { ElementSnapshot, PinCardKind, RectSnapshot } from "@ui-buddy/shared";

const HOST_ID = "__ui-buddy-host__";

const parseVal = (v: string): number => parseFloat(v) || 0;

export class OverlayController {
  private readonly host: HTMLDivElement;
  private readonly shadowRootRef: ShadowRoot;
  private readonly hoverBox: HTMLDivElement;
  private readonly selectedBox: HTMLDivElement;
  private readonly measurementLayer: HTMLDivElement;
  private readonly multiSelectLayer: HTMLDivElement;
  private readonly pinnedLayer: HTMLDivElement;
  private readonly tooltip: HTMLDivElement;
  private readonly pinnedCards = new Map<string, HTMLDivElement>();
  private readonly measurementPins: Array<{ source: RectSnapshot; target: RectSnapshot }> = [];

  public constructor(documentRef: Document = document) {
    const existingHost = documentRef.getElementById(HOST_ID);

    if (existingHost instanceof HTMLDivElement && existingHost.shadowRoot !== null) {
      this.host = existingHost;
      this.shadowRootRef = existingHost.shadowRoot;
      this.hoverBox = this.getOrCreateBox("hover-box");
      this.selectedBox = this.getOrCreateBox("selected-box");
      this.measurementLayer = this.getOrCreateBox("measure-layer");
      this.multiSelectLayer = this.getOrCreateBox("multi-select-layer");
      this.pinnedLayer = this.getOrCreateBox("pinned-layer");
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
    this.multiSelectLayer = this.createBox(documentRef, "multi-select-layer");
    this.pinnedLayer = this.createBox(documentRef, "pinned-layer");
    this.tooltip = this.createBox(documentRef, "tooltip");
    this.shadowRootRef.append(
      this.hoverBox,
      this.selectedBox,
      this.measurementLayer,
      this.multiSelectLayer,
      this.pinnedLayer,
      this.tooltip,
    );
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
    this.renderMeasurements({ source, target });
  }

  public pinMeasurement(source: RectSnapshot, target: RectSnapshot): void {
    this.measurementPins.push({ source, target });
    this.renderMeasurements();
  }

  public clearHover(): void {
    this.hoverBox.hidden = true;
    this.tooltip.hidden = true;
  }

  public clearSelected(): void {
    this.selectedBox.hidden = true;
  }

  public showMultiSelected(rects: Array<DOMRect | DOMRectReadOnly>): void {
    this.multiSelectLayer.replaceChildren();
    this.multiSelectLayer.hidden = rects.length === 0;

    for (const rect of rects) {
      const box = this.host.ownerDocument.createElement("div");
      box.dataset.multiBox = "true";
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      this.multiSelectLayer.append(box);
    }
  }

  public clearMultiSelected(): void {
    this.multiSelectLayer.replaceChildren();
    this.multiSelectLayer.hidden = true;
  }

  public clearMeasurement(): void {
    this.measurementPins.length = 0;
    this.measurementLayer.replaceChildren();
    this.measurementLayer.hidden = true;
  }

  // ── tooltip ──────────────────────────────────────────

  public pinElementCard(snapshot: ElementSnapshot, kind: PinCardKind): void {
    this.pinnedLayer.hidden = false;
    const cardId = `${kind}-${snapshot.selector}-${Date.now()}-${this.pinnedCards.size}`;
    const card = this.createPinnedCard(cardId, snapshot, kind);
    const offset = Math.min(this.pinnedCards.size, 8) * 18;

    card.style.left = `${16 + offset}px`;
    card.style.top = `${16 + offset}px`;
    this.pinnedCards.set(cardId, card);
    this.pinnedLayer.append(card);
  }

  public clearPinnedCards(): void {
    this.pinnedCards.clear();
    this.pinnedLayer.replaceChildren();
    this.pinnedLayer.hidden = true;
  }

  private renderMeasurements(preview?: { source: RectSnapshot; target: RectSnapshot }): void {
    if (this.measurementPins.length === 0 && preview === undefined) {
      this.measurementLayer.replaceChildren();
      this.measurementLayer.hidden = true;
      return;
    }

    this.measurementLayer.hidden = false;
    this.measurementLayer.replaceChildren();

    for (const pin of this.measurementPins) {
      this.measurementLayer.append(this.createMeasurementFragment(pin.source, pin.target, true));
    }

    if (preview !== undefined) {
      this.measurementLayer.append(
        this.createMeasurementFragment(preview.source, preview.target, false),
      );
    }
  }

  private createMeasurementFragment(
    source: RectSnapshot,
    target: RectSnapshot,
    pinned: boolean,
  ): DocumentFragment {
    const fragment = this.host.ownerDocument.createDocumentFragment();
    const elements: HTMLDivElement[] = [];

    // Horizontal edge-to-edge gap (0 when the rects overlap on this axis,
    // matching the core measurement logic).
    const horizontalGap =
      source.right < target.left
        ? { start: source.right, end: target.left }
        : target.right < source.left
          ? { start: target.right, end: source.left }
          : null;
    const hY = Math.min(source.bottom, target.bottom) + 12;

    if (horizontalGap !== null) {
      elements.push(
        this.createLine(
          "horizontal",
          horizontalGap.start,
          hY,
          horizontalGap.end - horizontalGap.start,
        ),
        this.createLabel(
          `${Math.round(horizontalGap.end - horizontalGap.start)}px`,
          (horizontalGap.start + horizontalGap.end) / 2,
          hY,
        ),
      );
    }

    // Vertical edge-to-edge gap.
    const verticalGap =
      source.bottom < target.top
        ? { start: source.bottom, end: target.top }
        : target.bottom < source.top
          ? { start: target.bottom, end: source.top }
          : null;
    const vX = Math.min(source.right, target.right) + 12;

    if (verticalGap !== null) {
      elements.push(
        this.createLine("vertical", vX, verticalGap.start, verticalGap.end - verticalGap.start),
        this.createLabel(
          `${Math.round(verticalGap.end - verticalGap.start)}px`,
          vX,
          (verticalGap.start + verticalGap.end) / 2,
        ),
      );
    }

    // Overlapping rects: show center-to-center deltas instead of a bogus gap.
    if (horizontalGap === null && verticalGap === null) {
      const sourceCenterX = source.left + source.width / 2;
      const sourceCenterY = source.top + source.height / 2;
      const targetCenterX = target.left + target.width / 2;
      const targetCenterY = target.top + target.height / 2;
      const deltaX = Math.round(targetCenterX - sourceCenterX);
      const deltaY = Math.round(targetCenterY - sourceCenterY);
      elements.push(
        this.createLabel(
          `Δ ${deltaX}px, ${deltaY}px`,
          (sourceCenterX + targetCenterX) / 2,
          (sourceCenterY + targetCenterY) / 2,
        ),
      );
    }

    for (const element of elements) {
      if (pinned) {
        element.dataset.measurePinned = "true";
      }
      fragment.append(element);
    }

    return fragment;
  }

  private createPinnedCard(
    cardId: string,
    snapshot: ElementSnapshot,
    kind: PinCardKind,
  ): HTMLDivElement {
    const doc = this.host.ownerDocument;
    const card = doc.createElement("div");
    const header = doc.createElement("div");
    const heading = doc.createElement("div");
    const title = doc.createElement("div");
    const selector = doc.createElement("div");
    const closeButton = doc.createElement("button");
    const body = doc.createElement("div");

    card.dataset.pinCard = kind;
    header.dataset.pinHeader = "true";
    title.dataset.pinTitle = "true";
    selector.dataset.pinSelector = "true";
    closeButton.dataset.pinClose = "true";
    body.dataset.pinBody = "true";

    title.textContent = kind === "styles" ? "Styles" : "Audit";
    selector.textContent = snapshot.selector;
    closeButton.type = "button";
    closeButton.title = "Remove pin";
    closeButton.textContent = "x";
    closeButton.addEventListener("click", () => {
      this.pinnedCards.delete(cardId);
      card.remove();
      this.pinnedLayer.hidden = this.pinnedCards.size === 0;
    });

    heading.append(title, selector);
    header.append(heading, closeButton);
    body.append(
      ...(kind === "styles" ? this.createStyleRows(snapshot) : this.createAuditRows(snapshot)),
    );
    card.append(header, body);
    this.makePinnedCardDraggable(card, header);
    return card;
  }

  private createStyleRows(snapshot: ElementSnapshot): HTMLElement[] {
    const fields = [
      "display",
      "position",
      "width",
      "height",
      "margin-top",
      "margin-right",
      "margin-bottom",
      "margin-left",
      "padding-top",
      "padding-right",
      "padding-bottom",
      "padding-left",
      "color",
      "background-color",
      "font-size",
      "font-weight",
      "line-height",
      "box-shadow",
    ];

    return fields
      .map((field) => this.createPinRow(field, snapshot.computedStyles[field] ?? ""))
      .filter((row): row is HTMLElement => row !== null);
  }

  private createAuditRows(snapshot: ElementSnapshot): HTMLElement[] {
    const rows: HTMLElement[] = [];
    const ratio = contrastRatioFromCssColors(
      snapshot.computedStyles.color ?? "",
      snapshot.computedStyles["background-color"] ?? "",
    );

    rows.push(this.createPinRow("contrast", ratio === null ? "Unknown" : `${ratio}:1`)!);
    rows.push(this.createPinRow("text", snapshot.textPreview || "None")!);

    for (const [name, value] of Object.entries(snapshot.attributes).slice(0, 8)) {
      rows.push(this.createPinRow(name, value)!);
    }

    if (Object.keys(snapshot.attributes).length === 0) {
      rows.push(this.createPinRow("attrs", "None")!);
    }

    return rows;
  }

  private createPinRow(label: string, value: string): HTMLElement | null {
    if (value.trim().length === 0) {
      return null;
    }

    const row = this.host.ownerDocument.createElement("div");
    const labelElement = this.host.ownerDocument.createElement("span");
    const valueElement = this.host.ownerDocument.createElement("span");

    row.dataset.pinRow = "true";
    labelElement.dataset.pinRowLabel = "true";
    valueElement.dataset.pinRowValue = "true";
    labelElement.textContent = label;
    valueElement.textContent = value;
    row.append(labelElement, valueElement);
    return row;
  }

  private makePinnedCardDraggable(card: HTMLDivElement, header: HTMLDivElement): void {
    let dragging = false;
    let pointerId = 0;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    header.addEventListener("pointerdown", (event) => {
      if (event.target instanceof HTMLButtonElement) {
        return;
      }

      dragging = true;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startLeft = Number.parseFloat(card.style.left || "0");
      startTop = Number.parseFloat(card.style.top || "0");
      header.setPointerCapture(pointerId);
      event.preventDefault();
      event.stopPropagation();
    });

    header.addEventListener("pointermove", (event) => {
      if (!dragging || event.pointerId !== pointerId) {
        return;
      }

      card.style.left = `${Math.max(0, startLeft + event.clientX - startX)}px`;
      card.style.top = `${Math.max(0, startTop + event.clientY - startY)}px`;
      event.preventDefault();
      event.stopPropagation();
    });

    const stopDragging = (event: PointerEvent) => {
      if (!dragging || event.pointerId !== pointerId) {
        return;
      }

      dragging = false;
      if (header.hasPointerCapture(pointerId)) {
        header.releasePointerCapture(pointerId);
      }
      event.preventDefault();
      event.stopPropagation();
    };

    header.addEventListener("pointerup", stopDragging);
    header.addEventListener("pointercancel", stopDragging);
  }
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
    const mt = parseVal(margin.top),
      mr = parseVal(margin.right),
      mb = parseVal(margin.bottom),
      ml = parseVal(margin.left);
    const pt = parseVal(padding.top),
      pr = parseVal(padding.right),
      pb = parseVal(padding.bottom),
      pl = parseVal(padding.left);
    const bt = parseVal(border.top),
      brt = parseVal(border.right),
      bb = parseVal(border.bottom),
      blt = parseVal(border.left);
    const w = rect.width,
      h = rect.height;

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

    this.addGuideLines(container, doc, rect);
  }

  private addGuideLines(parent: HTMLDivElement, doc: Document, rect: RectSnapshot): void {
    const top = this.createGuideLine(doc, "horizontal", rect.top);
    const bottom = this.createGuideLine(doc, "horizontal", rect.bottom);
    const left = this.createGuideLine(doc, "vertical", rect.left);
    const right = this.createGuideLine(doc, "vertical", rect.right);

    parent.append(top, bottom, left, right);
  }

  private createGuideLine(
    doc: Document,
    orientation: "horizontal" | "vertical",
    offset: number,
  ): HTMLDivElement {
    const line = doc.createElement("div");
    line.dataset.guideLine = orientation;

    if (orientation === "horizontal") {
      line.style.top = `${offset}px`;
    } else {
      line.style.left = `${offset}px`;
    }

    return line;
  }

  private addLabel(
    parent: HTMLDivElement,
    doc: Document,
    x: number,
    y: number,
    value: string,
    type: "m" | "p",
  ): void {
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
      [data-overlay="multi-select-layer"] { inset:0; }
      [data-multi-box] { position:fixed; border:2px dashed #9333ea; background:rgb(147 51 234/.08); border-radius:2px; }
      [data-overlay="pinned-layer"] { inset:0; pointer-events:none; }
      [data-pin-card] {
        position:fixed; width:min(320px, calc(100vw - 32px)); max-height:55vh; overflow:hidden;
        pointer-events:auto; border:1px solid rgb(148 163 184/.45); border-radius:8px;
        background:rgb(255 255 255/.98); color:#0f172a;
        box-shadow:0 18px 45px rgba(15,23,42,.22);
        font:500 11px/1.35 ui-sans-serif,system-ui,sans-serif;
      }
      [data-pin-header] {
        display:flex; align-items:center; justify-content:space-between; gap:10px;
        padding:8px 10px; cursor:move; background:#0f172a; color:white; user-select:none;
      }
      [data-pin-title] { font-weight:700; font-size:11px; }
      [data-pin-selector] { margin-top:2px; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#93c5fd; font:600 10px/1.2 ui-monospace,monospace; }
      [data-pin-close] { border:0; border-radius:4px; width:20px; height:20px; background:rgb(255 255 255/.12); color:white; cursor:pointer; font:700 12px/1 ui-sans-serif,system-ui,sans-serif; }
      [data-pin-close]:hover { background:rgb(255 255 255/.22); }
      [data-pin-body] { max-height:calc(55vh - 42px); overflow:auto; padding:8px 10px; }
      [data-pin-row] { display:grid; grid-template-columns:92px minmax(0,1fr); gap:8px; padding:4px 0; border-bottom:1px solid rgb(226 232 240/.8); }
      [data-pin-row]:last-child { border-bottom:0; }
      [data-pin-row-label] { color:#64748b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      [data-pin-row-value] { color:#0f172a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:ui-monospace,monospace; }
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
      [data-guide-line] { position:fixed; pointer-events:none; background:rgb(37 99 235/.45); box-shadow:0 0 0 1px rgb(255 255 255/.65); }
      [data-guide-line="horizontal"] { left:0; width:100vw; height:1px; }
      [data-guide-line="vertical"] { top:0; height:100vh; width:1px; }
      [data-measure-line] { position:fixed; background:#14b8a6; box-shadow:0 0 0 1px rgb(255 255 255/.9); }
      [data-measure-line="horizontal"] { height:2px; }
      [data-measure-line="vertical"] { width:2px; }
      [data-measure-label] {
        position:fixed; transform:translate(-50%,-50%); border-radius:4px;
        background:#0f766e; color:white; font:600 11px/1 ui-sans-serif,system-ui,sans-serif;
        padding:4px 6px; white-space:nowrap;
      }
      [data-measure-pinned="true"][data-measure-line] { background:#f59e0b; }
      [data-measure-pinned="true"][data-measure-label] { background:#b45309; }
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
    box.replaceChildren();
  }
}
