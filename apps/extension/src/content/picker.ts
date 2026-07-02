import { captureElementSnapshot } from "@ui-buddy/core";

import { sendRuntimeMessage } from "../chrome/messaging";
import { writePageContext } from "../chrome/session";

import type { OverlayController } from "./overlay";
import type { DomMoveDirection, ElementSearchResult, ElementSnapshot } from "@ui-buddy/shared";

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

type DisableOptions = {
  clearSelection?: boolean;
  notifySelection?: boolean;
};

type MoveOffset = {
  x: number;
  y: number;
};

type InlineMoveState = {
  left: string;
  position: string;
  top: string;
  transform: string;
  transition: string;
  zIndex: string;
};

type InlineMoveStyle = InlineMoveState & {
  baseTransform: string;
};

type OriginalDomPosition = {
  nextSibling: ChildNode | null;
  parentNode: Node;
};

type MovePositionSnapshot = {
  nextSibling: ChildNode | null;
  offset: MoveOffset | null;
  parentNode: Node | null;
  style: InlineMoveState | null;
};

type MoveHistoryEntry = {
  after: MovePositionSnapshot;
  before: MovePositionSnapshot;
  element: Element;
};

const MOVE_HISTORY_LIMIT = 100;
const SEARCH_RESULT_LIMIT = 25;

export class ElementPickerController {
  private active = false;
  private hoveredElement: Element | null = null;
  private mode: PickerMode = "select";
  private selectedSnapshot: ElementSnapshot | null = null;
  private selectedElementNode: Element | null = null;
  private isEditingText = false;
  private moveMode = false;
  private movingElement: HTMLElement | null = null;
  private moveCaptureElement: Element | null = null;
  private moveStartX = 0;
  private moveStartY = 0;
  private moveStartOffsetX = 0;
  private moveStartOffsetY = 0;
  private movedDuringDrag = false;
  private suppressNextClick = false;
  private moveDragStartState: MovePositionSnapshot | null = null;
  private readonly moveOffsets = new WeakMap<HTMLElement, MoveOffset>();
  private readonly moveRedoHistory = new WeakMap<Element, MoveHistoryEntry[]>();
  private readonly moveUndoHistory = new WeakMap<Element, MoveHistoryEntry[]>();
  private readonly originalDomPositions = new WeakMap<Element, OriginalDomPosition>();
  private readonly originalMoveStyles = new WeakMap<HTMLElement, InlineMoveStyle>();

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
    window.addEventListener("scroll", this.handleViewportChange, true);
    window.addEventListener("resize", this.handleViewportChange);
  }

  public disable(options: DisableOptions = {}): void {
    const { clearSelection = true, notifySelection = true } = options;

    if (!this.active) {
      if (clearSelection) {
        this.clearSelection(notifySelection);
      }
      return;
    }

    this.active = false;
    this.setMoveMode(false);
    this.hoveredElement = null;
    this.overlay.clearHover();
    this.overlay.clearMeasurement();

    if (clearSelection) {
      this.clearSelection(notifySelection);
    }

    document.removeEventListener("pointermove", this.handlePointerMove, true);
    document.removeEventListener("click", this.handleClick, true);
    document.removeEventListener("dblclick", this.handleDoubleClick, true);
    document.removeEventListener("keydown", this.handleKeyDown, true);
    window.removeEventListener("scroll", this.handleViewportChange, true);
    window.removeEventListener("resize", this.handleViewportChange);
  }

  public clearSelection(notifyPanel = true): void {
    const hadSelection = this.selectedElementNode !== null || this.selectedSnapshot !== null;

    this.selectedElementNode = null;
    this.selectedSnapshot = null;
    this.overlay.clearSelected();

    if (notifyPanel && hadSelection) {
      void sendRuntimeMessage({ type: "ELEMENT_UNSELECTED" });
    }
  }

  public isActive(): boolean {
    return this.active;
  }
  public setMoveMode(active: boolean): void {
    if (this.moveMode === active) {
      return;
    }

    this.moveMode = active;

    if (active) {
      document.addEventListener("pointerdown", this.handleMovePointerDown, true);
      document.addEventListener("pointermove", this.handleMovePointerMove, true);
      document.addEventListener("pointerup", this.handleMovePointerUp, true);
      document.addEventListener("pointercancel", this.handleMovePointerUp, true);
    } else {
      this.movingElement = null;
      this.moveCaptureElement = null;
      this.moveDragStartState = null;
      document.removeEventListener("pointerdown", this.handleMovePointerDown, true);
      document.removeEventListener("pointermove", this.handleMovePointerMove, true);
      document.removeEventListener("pointerup", this.handleMovePointerUp, true);
      document.removeEventListener("pointercancel", this.handleMovePointerUp, true);
    }
  }

  public restoreSelectedElement(): void {
    const element = this.selectedElementNode;

    if (element === null) {
      return;
    }

    const restoredStyles = element instanceof HTMLElement ? this.restoreMoveStyles(element) : false;
    const restoredDomPosition = this.restoreDomPosition(element);

    if (restoredStyles || restoredDomPosition) {
      this.clearMoveHistory(element);
      this.refreshMovePositionSnapshot();
    }
  }

  public undoMovePosition(): void {
    this.applyMoveHistory("undo");
  }

  public redoMovePosition(): void {
    this.applyMoveHistory("redo");
  }
  public moveSelectedElement(direction: DomMoveDirection): void {
    const element = this.selectedElementNode;

    if (element === null || !this.canRepositionElement(element)) {
      return;
    }

    const before = this.captureMovePositionSnapshot(element);

    if (this.applyDomMove(element, direction)) {
      this.recordMoveHistory(element, before, this.captureMovePositionSnapshot(element));
      this.refreshMovePositionSnapshot();
    }
  }

  private applyDomMove(element: Element, direction: DomMoveDirection): boolean {
    if (direction === "previous") {
      const previousSibling = element.previousElementSibling;

      if (previousSibling === null) {
        return false;
      }

      this.rememberDomPosition(element);
      return this.moveNodeSafely(() => {
        previousSibling.before(element);
      });
    }

    if (direction === "next") {
      const nextSibling = element.nextElementSibling;

      if (nextSibling === null) {
        return false;
      }

      this.rememberDomPosition(element);
      return this.moveNodeSafely(() => {
        nextSibling.after(element);
      });
    }

    const parentElement = element.parentElement;

    if (parentElement === null || !this.canMoveOutOfParent(parentElement)) {
      return false;
    }

    this.rememberDomPosition(element);

    if (direction === "out-before") {
      return this.moveNodeSafely(() => {
        parentElement.before(element);
      });
    }

    return this.moveNodeSafely(() => {
      parentElement.after(element);
    });
  }

  private rememberDomPosition(element: Element): void {
    if (this.originalDomPositions.has(element)) {
      return;
    }

    const parentNode = element.parentNode;

    if (parentNode === null) {
      return;
    }

    this.originalDomPositions.set(element, {
      nextSibling: element.nextSibling,
      parentNode,
    });
  }

  private restoreDomPosition(element: Element): boolean {
    const originalPosition = this.originalDomPositions.get(element);

    if (originalPosition === undefined) {
      return false;
    }

    if (!originalPosition.parentNode.isConnected) {
      this.originalDomPositions.delete(element);
      return false;
    }

    const referenceNode =
      originalPosition.nextSibling?.parentNode === originalPosition.parentNode
        ? originalPosition.nextSibling
        : null;

    if (
      element.parentNode === originalPosition.parentNode &&
      element.nextSibling === referenceNode
    ) {
      this.originalDomPositions.delete(element);
      return false;
    }

    const restored = this.moveNodeSafely(() => {
      originalPosition.parentNode.insertBefore(element, referenceNode);
    });

    if (restored) {
      this.originalDomPositions.delete(element);
    }

    return restored;
  }

  private restoreMoveStyles(element: HTMLElement): boolean {
    const original = this.originalMoveStyles.get(element);

    if (original === undefined) {
      return false;
    }

    element.style.position = original.position;
    element.style.left = original.left;
    element.style.top = original.top;
    element.style.transform = original.transform;
    element.style.transition = original.transition;
    element.style.zIndex = original.zIndex;
    this.moveOffsets.delete(element);
    this.originalMoveStyles.delete(element);
    return true;
  }
  private applyMoveHistory(direction: "undo" | "redo"): void {
    const element = this.selectedElementNode;

    if (element === null) {
      return;
    }

    const sourceStack =
      direction === "undo" ? this.moveUndoHistory.get(element) : this.moveRedoHistory.get(element);
    const historyEntry = sourceStack?.pop();

    if (historyEntry === undefined) {
      return;
    }

    const targetSnapshot = direction === "undo" ? historyEntry.before : historyEntry.after;

    if (!this.applyMovePositionSnapshot(historyEntry.element, targetSnapshot)) {
      sourceStack?.push(historyEntry);
      return;
    }

    const destinationStack =
      direction === "undo"
        ? this.getMoveHistoryStack(this.moveRedoHistory, historyEntry.element)
        : this.getMoveHistoryStack(this.moveUndoHistory, historyEntry.element);
    destinationStack.push(historyEntry);
    this.trimMoveHistory(destinationStack);
    this.refreshMovePositionSnapshot();
  }

  private applyMovePositionSnapshot(element: Element, snapshot: MovePositionSnapshot): boolean {
    if (snapshot.parentNode !== null) {
      if (!snapshot.parentNode.isConnected) {
        return false;
      }

      const referenceNode =
        snapshot.nextSibling?.parentNode === snapshot.parentNode ? snapshot.nextSibling : null;

      if (element.parentNode !== snapshot.parentNode || element.nextSibling !== referenceNode) {
        const moved = this.moveNodeSafely(() => {
          snapshot.parentNode?.insertBefore(element, referenceNode);
        });

        if (!moved) {
          return false;
        }
      }
    }

    if (element instanceof HTMLElement && snapshot.style !== null) {
      this.applyInlineMoveState(element, snapshot.style);

      if (snapshot.offset === null) {
        this.moveOffsets.delete(element);
      } else {
        this.moveOffsets.set(element, { ...snapshot.offset });
      }
    }

    return true;
  }

  private areInlineMoveStatesEqual(
    first: InlineMoveState | null,
    second: InlineMoveState | null,
  ): boolean {
    if (first === null || second === null) {
      return first === second;
    }

    return (
      first.left === second.left &&
      first.position === second.position &&
      first.top === second.top &&
      first.transform === second.transform &&
      first.transition === second.transition &&
      first.zIndex === second.zIndex
    );
  }

  private areMoveOffsetsEqual(first: MoveOffset | null, second: MoveOffset | null): boolean {
    if (first === null || second === null) {
      return first === second;
    }

    return first.x === second.x && first.y === second.y;
  }

  private areMovePositionSnapshotsEqual(
    first: MovePositionSnapshot,
    second: MovePositionSnapshot,
  ): boolean {
    return (
      first.parentNode === second.parentNode &&
      first.nextSibling === second.nextSibling &&
      this.areMoveOffsetsEqual(first.offset, second.offset) &&
      this.areInlineMoveStatesEqual(first.style, second.style)
    );
  }

  private applyInlineMoveState(element: HTMLElement, state: InlineMoveState): void {
    element.style.position = state.position;
    element.style.left = state.left;
    element.style.top = state.top;
    element.style.transform = state.transform;
    element.style.transition = state.transition;
    element.style.zIndex = state.zIndex;
  }

  private captureInlineMoveState(element: HTMLElement): InlineMoveState {
    return {
      left: element.style.left,
      position: element.style.position,
      top: element.style.top,
      transform: element.style.transform,
      transition: element.style.transition,
      zIndex: element.style.zIndex,
    };
  }

  private captureMovePositionSnapshot(element: Element): MovePositionSnapshot {
    const currentOffset =
      element instanceof HTMLElement ? this.moveOffsets.get(element) : undefined;

    return {
      nextSibling: element.nextSibling,
      offset: currentOffset === undefined ? null : { ...currentOffset },
      parentNode: element.parentNode,
      style: element instanceof HTMLElement ? this.captureInlineMoveState(element) : null,
    };
  }

  private clearMoveHistory(element: Element): void {
    this.moveRedoHistory.delete(element);
    this.moveUndoHistory.delete(element);
  }

  private getMoveHistoryStack(
    history: WeakMap<Element, MoveHistoryEntry[]>,
    element: Element,
  ): MoveHistoryEntry[] {
    const existingStack = history.get(element);

    if (existingStack !== undefined) {
      return existingStack;
    }

    const stack: MoveHistoryEntry[] = [];
    history.set(element, stack);
    return stack;
  }

  private recordMoveHistory(
    element: Element,
    before: MovePositionSnapshot,
    after: MovePositionSnapshot,
  ): void {
    if (this.areMovePositionSnapshotsEqual(before, after)) {
      return;
    }

    const undoStack = this.getMoveHistoryStack(this.moveUndoHistory, element);
    undoStack.push({ after, before, element });
    this.trimMoveHistory(undoStack);
    this.moveRedoHistory.delete(element);
  }

  private refreshMovePositionSnapshot(): void {
    this.hoveredElement = null;
    this.overlay.clearHover();
    this.refreshSelectedSnapshot();
  }

  private trimMoveHistory(stack: MoveHistoryEntry[]): void {
    if (stack.length > MOVE_HISTORY_LIMIT) {
      stack.splice(0, stack.length - MOVE_HISTORY_LIMIT);
    }
  }
  private canRepositionElement(element: Element): boolean {
    const ownerDocument = element.ownerDocument;
    return (
      element !== ownerDocument.documentElement &&
      element !== ownerDocument.head &&
      element !== ownerDocument.body
    );
  }

  private canMoveOutOfParent(parentElement: Element): boolean {
    const ownerDocument = parentElement.ownerDocument;
    return (
      parentElement.parentElement !== null &&
      parentElement !== ownerDocument.documentElement &&
      parentElement !== ownerDocument.head &&
      parentElement !== ownerDocument.body
    );
  }

  private moveNodeSafely(move: () => void): boolean {
    try {
      move();
      return true;
    } catch {
      return false;
    }
  }

  public nudgeSelectedElement(deltaX: number, deltaY: number): void {
    if (!(this.selectedElementNode instanceof HTMLElement)) {
      return;
    }

    const before = this.captureMovePositionSnapshot(this.selectedElementNode);
    const currentOffset = this.moveOffsets.get(this.selectedElementNode) ?? { x: 0, y: 0 };
    this.applyMoveOffset(this.selectedElementNode, {
      x: currentOffset.x + deltaX,
      y: currentOffset.y + deltaY,
    });
    this.recordMoveHistory(
      this.selectedElementNode,
      before,
      this.captureMovePositionSnapshot(this.selectedElementNode),
    );
    this.refreshSelectedSnapshot();
  }

  public replaceSelectedImage(src: string): void {
    const nextSource = src.trim();
    const element = this.selectedElementNode;

    if (nextSource.length === 0 || element === null) {
      return;
    }

    const nestedImage =
      element instanceof HTMLImageElement
        ? element
        : element instanceof HTMLElement
          ? element.querySelector("img")
          : null;

    if (nestedImage !== null) {
      nestedImage.src = nextSource;
      nestedImage.removeAttribute("srcset");
      this.refreshSelectedSnapshot();
      return;
    }

    if (typeof SVGImageElement !== "undefined" && element instanceof SVGImageElement) {
      element.setAttribute("href", nextSource);
      element.setAttributeNS("http://www.w3.org/1999/xlink", "href", nextSource);
      this.refreshSelectedSnapshot();
      return;
    }

    if (element instanceof HTMLElement) {
      element.style.backgroundImage = `url(${JSON.stringify(nextSource)})`;
      element.style.backgroundPosition = element.style.backgroundPosition || "center";
      element.style.backgroundSize = element.style.backgroundSize || "cover";
      this.refreshSelectedSnapshot();
    }
  }
  public searchElements(query: string): ElementSearchResult[] {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length === 0) {
      return [];
    }

    const results: Element[] = [];
    const seen = new Set<Element>();
    const addResult = (element: Element) => {
      if (seen.has(element) || !isInspectableElement(element, this.overlay.hostElement)) {
        return;
      }

      seen.add(element);
      results.push(element);
    };

    try {
      document.querySelectorAll(trimmedQuery).forEach(addResult);
    } catch {
      // Treat invalid CSS as a text/attribute search.
    }

    const normalizedQuery = trimmedQuery.toLowerCase();
    document.body.querySelectorAll("*").forEach((element) => {
      if (results.length >= SEARCH_RESULT_LIMIT) {
        return;
      }

      const haystack = [
        element.tagName,
        element.id,
        // element.className is an SVGAnimatedString on SVG elements.
        element.getAttribute("class") ?? "",
        element.getAttribute("role") ?? "",
        element.getAttribute("aria-label") ?? "",
        element.textContent?.slice(0, 200) ?? "",
      ]
        .join(" ")
        .toLowerCase();

      if (haystack.includes(normalizedQuery)) {
        addResult(element);
      }
    });

    return results.slice(0, SEARCH_RESULT_LIMIT).map((element) => {
      const snapshot = captureElementSnapshot(element);
      return {
        tagName: snapshot.tagName,
        id: snapshot.id,
        classList: snapshot.classList,
        textPreview: snapshot.textPreview,
        selector: snapshot.selector,
        rect: snapshot.rect,
      };
    });
  }

  public selectBySelector(selector: string): void {
    const element = document.querySelector(selector);

    if (element !== null && isInspectableElement(element, this.overlay.hostElement)) {
      this.selectElement(element);
    }
  }

  public startTextEdit(): void {
    if (this.selectedElementNode instanceof HTMLElement) {
      this.beginTextEdit(this.selectedElementNode);
    }
  }

  private refreshSelectedSnapshot(): void {
    if (this.selectedElementNode === null) {
      return;
    }

    const snapshot = captureElementSnapshot(this.selectedElementNode);
    this.selectedSnapshot = snapshot;
    this.overlay.showSelected(this.selectedElementNode.getBoundingClientRect());
    void sendRuntimeMessage({ type: "ELEMENT_SELECTED", payload: snapshot });
  }

  private beginTextEdit(element: HTMLElement): void {
    this.isEditingText = true;
    element.contentEditable = "true";
    element.focus();

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);

    const onBlur = () => {
      this.isEditingText = false;
      element.contentEditable = "false";
      element.removeEventListener("blur", onBlur);
      this.refreshSelectedSnapshot();
    };

    element.addEventListener("blur", onBlur);
  }

  private rememberMoveStyle(element: HTMLElement): InlineMoveStyle {
    const existing = this.originalMoveStyles.get(element);

    if (existing !== undefined) {
      return existing;
    }

    const computedStyle = window.getComputedStyle(element);
    const computedTransform = computedStyle.transform.trim();
    const original = {
      baseTransform:
        computedTransform.length > 0 && computedTransform !== "none"
          ? computedTransform
          : element.style.transform,
      left: element.style.left,
      position: element.style.position,
      top: element.style.top,
      transform: element.style.transform,
      transition: element.style.transition,
      zIndex: element.style.zIndex,
    };

    this.originalMoveStyles.set(element, original);
    return original;
  }

  private applyMoveOffset(
    element: HTMLElement,
    offset: { x: number; y: number },
    options: { disableTransition?: boolean } = {},
  ): void {
    const original = this.rememberMoveStyle(element);
    const transforms: string[] = [];

    if (original.baseTransform.trim().length > 0 && original.baseTransform !== "none") {
      transforms.push(original.baseTransform);
    }

    if (offset.x !== 0 || offset.y !== 0) {
      transforms.push(`translate3d(${Math.round(offset.x)}px, ${Math.round(offset.y)}px, 0)`);
    }

    element.style.transform = transforms.length > 0 ? transforms.join(" ") : original.transform;
    element.style.zIndex = element.style.zIndex || "1";

    if (options.disableTransition === true) {
      element.style.transition = "none";
    }

    this.moveOffsets.set(element, offset);
  }
  private readonly handleMovePointerDown = (event: PointerEvent): void => {
    if (
      !this.moveMode ||
      !(this.selectedElementNode instanceof HTMLElement) ||
      !(event.target instanceof Element) ||
      !this.selectedElementNode.contains(event.target)
    ) {
      return;
    }

    const currentOffset = this.moveOffsets.get(this.selectedElementNode) ?? { x: 0, y: 0 };
    this.moveDragStartState = this.captureMovePositionSnapshot(this.selectedElementNode);
    this.rememberMoveStyle(this.selectedElementNode);
    this.movingElement = this.selectedElementNode;
    this.moveCaptureElement = event.target;
    this.moveStartX = event.clientX;
    this.moveStartY = event.clientY;
    this.moveStartOffsetX = currentOffset.x;
    this.moveStartOffsetY = currentOffset.y;
    this.movedDuringDrag = false;

    try {
      event.target.setPointerCapture(event.pointerId);
    } catch {
      this.moveCaptureElement = null;
    }

    event.preventDefault();
    event.stopPropagation();
  };

  private readonly handleMovePointerMove = (event: PointerEvent): void => {
    if (!this.moveMode || this.movingElement === null) {
      return;
    }

    const deltaX = event.clientX - this.moveStartX;
    const deltaY = event.clientY - this.moveStartY;

    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      this.movedDuringDrag = true;
    }

    this.applyMoveOffset(
      this.movingElement,
      {
        x: this.moveStartOffsetX + deltaX,
        y: this.moveStartOffsetY + deltaY,
      },
      { disableTransition: true },
    );
    this.overlay.showSelected(this.movingElement.getBoundingClientRect());
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly handleMovePointerUp = (event: PointerEvent): void => {
    if (this.movingElement === null) {
      return;
    }

    const original = this.originalMoveStyles.get(this.movingElement);

    if (original !== undefined) {
      this.movingElement.style.transition = original.transition;
    }

    if (
      this.moveCaptureElement !== null &&
      this.moveCaptureElement.hasPointerCapture(event.pointerId)
    ) {
      this.moveCaptureElement.releasePointerCapture(event.pointerId);
    }

    if (this.movedDuringDrag) {
      if (this.moveDragStartState !== null) {
        this.recordMoveHistory(
          this.movingElement,
          this.moveDragStartState,
          this.captureMovePositionSnapshot(this.movingElement),
        );
      }

      this.suppressNextClick = true;
      window.setTimeout(() => {
        this.suppressNextClick = false;
      }, 0);
    }

    this.movingElement = null;
    this.moveCaptureElement = null;
    this.moveDragStartState = null;
    this.refreshSelectedSnapshot();
    event.preventDefault();
    event.stopPropagation();
  };
  private viewportRefreshFrame: number | null = null;

  private readonly handleViewportChange = (): void => {
    if (this.viewportRefreshFrame !== null) {
      return;
    }

    this.viewportRefreshFrame = window.requestAnimationFrame(() => {
      this.viewportRefreshFrame = null;

      // The hover box is repositioned on the next pointermove; hide it so it
      // does not float detached from its element while the page scrolls.
      this.hoveredElement = null;
      this.overlay.clearHover();

      if (this.selectedElementNode !== null && this.selectedElementNode.isConnected) {
        this.overlay.showSelected(this.selectedElementNode.getBoundingClientRect());
      }
    });
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (
      this.isEditingText ||
      this.movingElement !== null ||
      !this.active ||
      !isInspectableElement(event.target, this.overlay.hostElement)
    ) {
      return;
    }

    const element = event.target;

    if (element === this.hoveredElement) {
      return;
    }

    this.hoveredElement = element;
    const snapshot = captureElementSnapshot(element);
    this.overlay.showHover(snapshot);

    if (
      this.mode === "measure" &&
      this.selectedSnapshot !== null &&
      this.selectedElementNode !== element
    ) {
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

  private readonly selectElement = (
    element: Element,
    options: { pinMeasurement?: boolean } = {},
  ) => {
    const snapshot = captureElementSnapshot(element);
    void writePageContext(getPageContext());

    if (this.mode === "measure") {
      if (this.selectedSnapshot !== null) {
        if (options.pinMeasurement === true) {
          this.overlay.pinMeasurement(this.selectedSnapshot.rect, snapshot.rect);
          return;
        }

        this.overlay.showMeasurement(this.selectedSnapshot.rect, snapshot.rect);
      }

      void sendRuntimeMessage({ type: "MEASURE_TARGET_SELECTED", payload: snapshot });
      this.disable({ clearSelection: false });
      return;
    }

    this.callbacks.onElementSelected?.();
    this.selectedSnapshot = snapshot;
    this.selectedElementNode = element;
    this.hoveredElement = null;
    this.overlay.clearHover();
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
    if (this.suppressNextClick) {
      this.suppressNextClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (
      this.isEditingText ||
      this.movingElement !== null ||
      !this.active ||
      !isInspectableElement(event.target, this.overlay.hostElement)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.selectElement(event.target as Element, { pinMeasurement: event.shiftKey });
  };

  private readonly handleDoubleClick = (event: MouseEvent): void => {
    if (
      this.isEditingText ||
      !this.active ||
      !isInspectableElement(event.target, this.overlay.hostElement) ||
      !(event.target instanceof HTMLElement)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.beginTextEdit(event.target);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    // Ignore keystrokes if the user is typing in an input or editable element
    if (
      this.isEditingText ||
      (event.target instanceof HTMLElement &&
        (event.target.tagName === "INPUT" ||
          event.target.tagName === "TEXTAREA" ||
          event.target.isContentEditable))
    ) {
      return;
    }

    if (event.key === "Escape") {
      if (this.mode === "measure") {
        this.overlay.clearMeasurement();
        this.disable({ clearSelection: false });
        void sendRuntimeMessage({ type: "PICKER_DISABLE" });
        return;
      }

      if (this.selectedElementNode) {
        this.clearSelection();
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

      this.clearSelection();
    }
  };
}
