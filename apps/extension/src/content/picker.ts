import { captureElementSnapshot, generateUniqueSelector } from "@ui-buddy/core";

import { sendRuntimeMessage } from "../chrome/messaging";
import { writePageContext } from "../chrome/session";

import type { OverlayController } from "./overlay";
import type {
  AlignEdge,
  DomMoveDirection,
  ElementSearchResult,
  ElementSnapshot,
  StructuralEdit,
  StructuralEditKind,
  StructuralEditTarget,
} from "@ui-buddy/shared";

const createEditId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `edit-${Date.now()}-${Math.random().toString(36).slice(2)}`;

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
  /** A new undoable structural edit (move/delete/text/image) was recorded. */
  onStructuralEdit?: (edit: StructuralEdit) => void;
};

type ImageEditEntry = {
  apply: () => void;
  revert: () => void;
  element: Element;
};

type TextEditEntry = {
  element: HTMLElement;
  before: string;
  after: string;
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
  // Drag offset lives on the independent `translate` property so it composes
  // with (rather than being overwritten by) any transform/animation the user
  // applies from the Styles panel.
  translate: string;
  transition: string;
  zIndex: string;
};

type InlineMoveStyle = InlineMoveState;

type OriginalDomPosition = {
  nextSibling: ChildNode | null;
  parentNode: Node;
};

type MovePositionSnapshot = {
  elementIndex: number | null;
  nextElementSelector: string | null;
  nextSibling: ChildNode | null;
  offset: MoveOffset | null;
  parentNode: Node | null;
  parentSelector: string | null;
  previousElementSelector: string | null;
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
  // Global (page-wide) stacks so undo/redo works across elements.
  private readonly moveRedoHistory: MoveHistoryEntry[] = [];
  private readonly moveUndoHistory: MoveHistoryEntry[] = [];
  private readonly originalDomPositions = new WeakMap<Element, OriginalDomPosition>();
  private readonly originalMoveStyles = new WeakMap<HTMLElement, InlineMoveStyle>();
  private extraSelections: Element[] = [];
  private readonly deletedElements: Array<{
    element: HTMLElement;
    display: string;
    visibility: string;
  }> = [];
  private readonly deletedRedoElements: Array<{
    element: HTMLElement;
    display: string;
    visibility: string;
  }> = [];
  private readonly textUndoStack: TextEditEntry[] = [];
  private readonly textRedoStack: TextEditEntry[] = [];
  private readonly imageUndoStack: ImageEditEntry[] = [];
  private readonly imageRedoStack: ImageEditEntry[] = [];

  public constructor(
    private readonly overlay: OverlayController,
    private readonly callbacks: PickerCallbacks = {},
  ) {}

  public enable(mode: PickerMode = "select", sourceSnapshot?: ElementSnapshot): void {
    this.mode = mode;

    if (sourceSnapshot !== undefined) {
      this.selectedSnapshot = sourceSnapshot;
    }

    this.active = true;

    // Attach listeners every time (re-adding an identical listener is a no-op
    // in the browser). This makes enabling idempotent and lets the picker
    // recover if its listeners were ever detached while `active` stayed true.
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

    if (this.extraSelections.length > 0) {
      this.extraSelections = [];
      this.overlay.clearMultiSelected();
      void sendRuntimeMessage({
        type: "MULTI_SELECTION_CHANGED",
        payload: { count: 0, selectors: [] },
      });
    }

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

  public undoTextEdit(): void {
    const entry = this.textUndoStack.pop();

    if (entry === undefined || !entry.element.isConnected) {
      return;
    }

    entry.element.textContent = entry.before;
    this.textRedoStack.push(entry);
    this.refreshSnapshotFor(entry.element);
  }

  public redoTextEdit(): void {
    const entry = this.textRedoStack.pop();

    if (entry === undefined || !entry.element.isConnected) {
      return;
    }

    entry.element.textContent = entry.after;
    this.textUndoStack.push(entry);
    this.refreshSnapshotFor(entry.element);
  }

  public undoImageEdit(): void {
    const entry = this.imageUndoStack.pop();

    if (entry === undefined || !entry.element.isConnected) {
      return;
    }

    entry.revert();
    this.imageRedoStack.push(entry);
    this.refreshSnapshotFor(entry.element);
  }

  public redoImageEdit(): void {
    const entry = this.imageRedoStack.pop();

    if (entry === undefined || !entry.element.isConnected) {
      return;
    }

    entry.apply();
    this.imageUndoStack.push(entry);
    this.refreshSnapshotFor(entry.element);
  }

  private refreshSnapshotFor(element: Element): void {
    if (this.selectedElementNode === element) {
      this.refreshSelectedSnapshot();
    }
  }

  private buildEditTarget(element: Element): StructuralEditTarget {
    const snapshot = captureElementSnapshot(element);

    return {
      tagName: snapshot.tagName,
      classList: snapshot.classList,
      selector: snapshot.selector,
      domPath: snapshot.domPath,
      ...(snapshot.id.length > 0 ? { id: snapshot.id } : {}),
      ...(snapshot.fallbackSelectors !== undefined && snapshot.fallbackSelectors.length > 0
        ? { fallbackSelectors: snapshot.fallbackSelectors }
        : {}),
    };
  }

  private emitStructuralEdit(
    element: Element,
    kind: StructuralEditKind,
    summary: string,
    details: Record<string, string>,
  ): void {
    this.callbacks.onStructuralEdit?.({
      id: createEditId(),
      kind,
      timestamp: new Date().toISOString(),
      target: this.buildEditTarget(element),
      summary,
      details,
    });
  }

  public getSelectedElementNode(): Element | null {
    return this.selectedElementNode;
  }

  public scrollSelectedIntoView(): void {
    if (this.selectedElementNode === null) {
      return;
    }

    this.selectedElementNode.scrollIntoView({ block: "center", inline: "nearest" });
    this.refreshSelectedSnapshot();
  }

  public markSelectedForSource(): void {
    this.selectedElementNode?.setAttribute("data-ub-source-target", "1");
  }

  public undoDeleteElement(): void {
    const entry = this.deletedElements.pop();

    if (entry === undefined || !entry.element.isConnected) {
      return;
    }

    entry.element.style.display = entry.display;
    entry.element.style.visibility = entry.visibility;
    this.deletedRedoElements.push(entry);
    this.selectElement(entry.element);
  }

  public redoDeleteElement(): void {
    const entry = this.deletedRedoElements.pop();

    if (entry === undefined || !entry.element.isConnected) {
      return;
    }

    this.deletedElements.push(entry);
    entry.element.style.display = "none";
    entry.element.style.visibility = "hidden";

    if (this.selectedElementNode === entry.element) {
      this.clearSelection();
    }
  }

  private toggleExtraSelection(element: Element): void {
    const index = this.extraSelections.indexOf(element);

    if (index >= 0) {
      this.extraSelections.splice(index, 1);
    } else {
      this.extraSelections.push(element);
    }

    this.syncMultiSelection();
  }

  private syncMultiSelection(): void {
    this.extraSelections = this.extraSelections.filter((element) => element.isConnected);
    this.overlay.showMultiSelected(
      this.extraSelections.map((element) => element.getBoundingClientRect()),
    );

    const selectors = this.extraSelections.map((element) => generateUniqueSelector(element));
    void sendRuntimeMessage({
      type: "MULTI_SELECTION_CHANGED",
      payload: {
        count: this.extraSelections.length + (this.selectedElementNode === null ? 0 : 1),
        selectors,
      },
    });
  }

  public alignSelected(alignment: AlignEdge): void {
    const primary = this.selectedElementNode;

    if (primary === null || this.extraSelections.length === 0) {
      return;
    }

    const reference = primary.getBoundingClientRect();

    for (const element of this.extraSelections) {
      if (!(element instanceof HTMLElement) || !element.isConnected) {
        continue;
      }

      const rect = element.getBoundingClientRect();
      let deltaX = 0;
      let deltaY = 0;

      if (alignment === "left") {
        deltaX = reference.left - rect.left;
      } else if (alignment === "right") {
        deltaX = reference.right - rect.right;
      } else if (alignment === "center-x") {
        deltaX = reference.left + reference.width / 2 - (rect.left + rect.width / 2);
      } else if (alignment === "top") {
        deltaY = reference.top - rect.top;
      } else if (alignment === "bottom") {
        deltaY = reference.bottom - rect.bottom;
      } else {
        deltaY = reference.top + reference.height / 2 - (rect.top + rect.height / 2);
      }

      if (deltaX === 0 && deltaY === 0) {
        continue;
      }

      const before = this.captureMovePositionSnapshot(element);
      const current = this.moveOffsets.get(element) ?? { x: 0, y: 0 };
      this.applyMoveOffset(element, { x: current.x + deltaX, y: current.y + deltaY });
      this.recordMoveHistory(
        element,
        before,
        this.captureMovePositionSnapshot(element),
        `Aligned ${alignment}`,
        { alignment, deltaX: String(Math.round(deltaX)), deltaY: String(Math.round(deltaY)) },
      );
    }

    this.syncMultiSelection();
  }
  public moveSelectedElement(direction: DomMoveDirection): void {
    const element = this.selectedElementNode;

    if (element === null || !this.canRepositionElement(element)) {
      return;
    }

    const before = this.captureMovePositionSnapshot(element);

    if (this.applyDomMove(element, direction)) {
      this.recordMoveHistory(
        element,
        before,
        this.captureMovePositionSnapshot(element),
        `Moved ${direction} in the DOM`,
        { direction },
      );
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
    element.style.translate = original.translate;
    element.style.transition = original.transition;
    element.style.zIndex = original.zIndex;
    this.moveOffsets.delete(element);
    this.originalMoveStyles.delete(element);
    return true;
  }
  private applyMoveHistory(direction: "undo" | "redo"): void {
    const sourceStack = direction === "undo" ? this.moveUndoHistory : this.moveRedoHistory;
    const historyEntry = sourceStack.pop();

    if (historyEntry === undefined) {
      return;
    }

    const targetSnapshot = direction === "undo" ? historyEntry.before : historyEntry.after;

    if (!this.applyMovePositionSnapshot(historyEntry.element, targetSnapshot)) {
      // The element left the document; drop the entry.
      return;
    }

    const destinationStack = direction === "undo" ? this.moveRedoHistory : this.moveUndoHistory;
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
      first.translate === second.translate &&
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
    element.style.translate = state.translate;
    element.style.transition = state.transition;
    element.style.zIndex = state.zIndex;
  }

  private captureInlineMoveState(element: HTMLElement): InlineMoveState {
    return {
      left: element.style.left,
      position: element.style.position,
      top: element.style.top,
      transform: element.style.transform,
      translate: element.style.translate,
      transition: element.style.transition,
      zIndex: element.style.zIndex,
    };
  }

  private captureMovePositionSnapshot(element: Element): MovePositionSnapshot {
    const currentOffset =
      element instanceof HTMLElement ? this.moveOffsets.get(element) : undefined;
    const parentElement = element.parentElement;
    const siblingElements = parentElement === null ? [] : Array.from(parentElement.children);
    const elementIndex = parentElement === null ? -1 : siblingElements.indexOf(element);

    return {
      elementIndex: elementIndex >= 0 ? elementIndex : null,
      nextElementSelector:
        element.nextElementSibling === null
          ? null
          : generateUniqueSelector(element.nextElementSibling),
      nextSibling: element.nextSibling,
      offset: currentOffset === undefined ? null : { ...currentOffset },
      parentNode: element.parentNode,
      parentSelector: parentElement === null ? null : generateUniqueSelector(parentElement),
      previousElementSelector:
        element.previousElementSibling === null
          ? null
          : generateUniqueSelector(element.previousElementSibling),
      style: element instanceof HTMLElement ? this.captureInlineMoveState(element) : null,
    };
  }

  private semanticMoveDetails(
    before: MovePositionSnapshot,
    after: MovePositionSnapshot,
    details: Record<string, string>,
  ): Record<string, string> {
    const enrichedDetails: Record<string, string> = { ...details };

    if (before.parentNode !== after.parentNode) {
      enrichedDetails.intent = "relocate";
      enrichedDetails.confidence = "high";
      enrichedDetails.implementationHint =
        "Move the source markup between the recorded source owners; avoid translate offsets when the intent is hierarchy/layout.";

      if (before.parentSelector !== null) {
        enrichedDetails.beforeParentSelector = before.parentSelector;
      }
      if (after.parentSelector !== null) {
        enrichedDetails.afterParentSelector = after.parentSelector;
      }
      if (before.elementIndex !== null) {
        enrichedDetails.beforeIndex = String(before.elementIndex);
      }
      if (after.elementIndex !== null) {
        enrichedDetails.afterIndex = String(after.elementIndex);
      }

      return enrichedDetails;
    }

    if (
      before.elementIndex !== null &&
      after.elementIndex !== null &&
      before.elementIndex !== after.elementIndex
    ) {
      enrichedDetails.intent = "reorder";
      enrichedDetails.confidence = "high";
      enrichedDetails.implementationHint =
        "Implement through source markup order or the project's existing flex/grid order mechanism; avoid pixel offsets.";
      enrichedDetails.beforeIndex = String(before.elementIndex);
      enrichedDetails.afterIndex = String(after.elementIndex);

      if ((after.parentSelector ?? before.parentSelector) !== null) {
        enrichedDetails.parentSelector = after.parentSelector ?? before.parentSelector ?? "";
      }
      if (before.previousElementSelector !== null) {
        enrichedDetails.beforePreviousSelector = before.previousElementSelector;
      }
      if (before.nextElementSelector !== null) {
        enrichedDetails.beforeNextSelector = before.nextElementSelector;
      }
      if (after.previousElementSelector !== null) {
        enrichedDetails.afterPreviousSelector = after.previousElementSelector;
      }
      if (after.nextElementSelector !== null) {
        enrichedDetails.afterNextSelector = after.nextElementSelector;
      }

      return enrichedDetails;
    }

    const beforeOffset = before.offset ?? { x: 0, y: 0 };
    const afterOffset = after.offset ?? { x: 0, y: 0 };

    if (beforeOffset.x !== afterOffset.x || beforeOffset.y !== afterOffset.y) {
      enrichedDetails.intent = "nudge";
      enrichedDetails.confidence = "medium";
      enrichedDetails.implementationHint =
        "Use transform/translate, margin, or spacing only after matching the visual intent in source; do not change DOM order for a nudge.";
      enrichedDetails.x = enrichedDetails.x ?? String(Math.round(afterOffset.x));
      enrichedDetails.y = enrichedDetails.y ?? String(Math.round(afterOffset.y));

      return enrichedDetails;
    }

    enrichedDetails.intent = "unknown";
    enrichedDetails.confidence = "low";
    return enrichedDetails;
  }

  private clearMoveHistory(element: Element): void {
    const keptUndo = this.moveUndoHistory.filter((entry) => entry.element !== element);
    const keptRedo = this.moveRedoHistory.filter((entry) => entry.element !== element);
    this.moveUndoHistory.splice(0, this.moveUndoHistory.length, ...keptUndo);
    this.moveRedoHistory.splice(0, this.moveRedoHistory.length, ...keptRedo);
  }

  private recordMoveHistory(
    element: Element,
    before: MovePositionSnapshot,
    after: MovePositionSnapshot,
    summary = "Moved element",
    details: Record<string, string> = {},
  ): void {
    if (this.areMovePositionSnapshotsEqual(before, after)) {
      return;
    }

    this.moveUndoHistory.push({ after, before, element });
    this.trimMoveHistory(this.moveUndoHistory);
    this.moveRedoHistory.length = 0;
    this.emitStructuralEdit(
      element,
      "move",
      summary,
      this.semanticMoveDetails(before, after, details),
    );
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
      `Nudged by (${deltaX}, ${deltaY})px`,
      { deltaX: String(deltaX), deltaY: String(deltaY) },
    );
    this.refreshSelectedSnapshot();
  }

  private recordImageEdit(
    element: Element,
    src: string,
    apply: () => void,
    revert: () => void,
  ): void {
    apply();
    this.imageUndoStack.push({ element, apply, revert });
    this.imageRedoStack.length = 0;
    this.emitStructuralEdit(element, "image", "Replaced image source", { src: src.slice(0, 300) });
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
      const beforeSrc = nestedImage.getAttribute("src");
      const beforeSrcset = nestedImage.getAttribute("srcset");
      this.recordImageEdit(
        nestedImage,
        nextSource,
        () => {
          nestedImage.setAttribute("src", nextSource);
          nestedImage.removeAttribute("srcset");
        },
        () => {
          if (beforeSrc === null) {
            nestedImage.removeAttribute("src");
          } else {
            nestedImage.setAttribute("src", beforeSrc);
          }

          if (beforeSrcset === null) {
            nestedImage.removeAttribute("srcset");
          } else {
            nestedImage.setAttribute("srcset", beforeSrcset);
          }
        },
      );
      return;
    }

    if (typeof SVGImageElement !== "undefined" && element instanceof SVGImageElement) {
      const xlink = "http://www.w3.org/1999/xlink";
      const beforeHref = element.getAttribute("href");
      const beforeXlink = element.getAttributeNS(xlink, "href");
      this.recordImageEdit(
        element,
        nextSource,
        () => {
          element.setAttribute("href", nextSource);
          element.setAttributeNS(xlink, "href", nextSource);
        },
        () => {
          if (beforeHref === null) {
            element.removeAttribute("href");
          } else {
            element.setAttribute("href", beforeHref);
          }

          if (beforeXlink === null) {
            element.removeAttributeNS(xlink, "href");
          } else {
            element.setAttributeNS(xlink, "href", beforeXlink);
          }
        },
      );
      return;
    }

    if (element instanceof HTMLElement) {
      const beforeImage = element.style.backgroundImage;
      const beforePosition = element.style.backgroundPosition;
      const beforeSize = element.style.backgroundSize;
      this.recordImageEdit(
        element,
        nextSource,
        () => {
          element.style.backgroundImage = `url(${JSON.stringify(nextSource)})`;
          element.style.backgroundPosition = element.style.backgroundPosition || "center";
          element.style.backgroundSize = element.style.backgroundSize || "cover";
        },
        () => {
          element.style.backgroundImage = beforeImage;
          element.style.backgroundPosition = beforePosition;
          element.style.backgroundSize = beforeSize;
        },
      );
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
    const beforeText = element.textContent ?? "";
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

      const afterText = element.textContent ?? "";

      if (afterText !== beforeText) {
        this.textUndoStack.push({ element, before: beforeText, after: afterText });
        this.textRedoStack.length = 0;
        this.emitStructuralEdit(element, "text", "Edited text content", {
          before: beforeText.slice(0, 200),
          after: afterText.slice(0, 200),
        });
      }

      this.refreshSelectedSnapshot();
    };

    element.addEventListener("blur", onBlur);
  }

  private rememberMoveStyle(element: HTMLElement): InlineMoveStyle {
    const existing = this.originalMoveStyles.get(element);

    if (existing !== undefined) {
      return existing;
    }

    const original: InlineMoveStyle = {
      left: element.style.left,
      position: element.style.position,
      top: element.style.top,
      transform: element.style.transform,
      translate: element.style.translate,
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

    // Use the standalone `translate` property (not `transform`) for the drag
    // offset. It composes with the element's own transform, so styles and
    // animations applied afterwards render at the dragged position instead of
    // snapping the element back to where it started.
    if (offset.x !== 0 || offset.y !== 0) {
      element.style.translate = `${Math.round(offset.x)}px ${Math.round(offset.y)}px`;
    } else {
      element.style.translate = original.translate;
    }

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
        const offset = this.moveOffsets.get(this.movingElement) ?? { x: 0, y: 0 };
        this.recordMoveHistory(
          this.movingElement,
          this.moveDragStartState,
          this.captureMovePositionSnapshot(this.movingElement),
          "Dragged to a new position",
          { x: String(Math.round(offset.x)), y: String(Math.round(offset.y)) },
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

      if (this.extraSelections.length > 0) {
        this.overlay.showMultiSelected(
          this.extraSelections
            .filter((element) => element.isConnected)
            .map((element) => element.getBoundingClientRect()),
        );
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

    if (
      this.mode === "select" &&
      event.shiftKey &&
      this.selectedElementNode !== null &&
      event.target !== this.selectedElementNode
    ) {
      this.toggleExtraSelection(event.target as Element);
      return;
    }

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
      this.deletedElements.push({
        element: el,
        display: el.style.display,
        visibility: el.style.visibility,
      });
      this.deletedRedoElements.length = 0;
      // Record the edit while the element is still in place for an accurate target.
      this.emitStructuralEdit(el, "delete", "Hid element", {});
      el.style.display = "none";
      el.style.visibility = "hidden";

      this.clearSelection();
    }
  };
}
