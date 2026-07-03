import { addRuntimeMessageListener, sendRuntimeMessage } from "../chrome/messaging";

import { runA11yAudit } from "./a11yAudit";
import { extractElementCss } from "./cssExtractor";
import { GridController } from "./grid";
import { OverlayController } from "./overlay";
import { scanPage } from "./pageScanner";
import { ElementPickerController } from "./picker";
import { ManualRulerController } from "./ruler";
import { StyleInjector } from "./styleInjector";

declare global {
  interface Window {
    __ui_devtools_anim_listener?: boolean;
    __ui_devtools_anim_speed?: number;
    __uiBuddyListenerAttached?: boolean;
  }
}

const overlay = new OverlayController();
const styleInjector = new StyleInjector();

// ── Unified page-action history ─────────────────────────────
// One ordered log across style edits, moves/nudges/aligns, and deletes so a
// single undo/redo covers everything the user did to the page.
type PageActionKind = "style" | "move" | "delete";

const ACTION_LOG_LIMIT = 200;
const actionUndoLog: PageActionKind[] = [];
const actionRedoLog: PageActionKind[] = [];

const sendHistorySync = (): void => {
  void sendRuntimeMessage({
    type: "HISTORY_SYNC",
    payload: {
      changes: styleInjector.getAppliedChanges(),
      undoDepth: actionUndoLog.length,
      redoDepth: actionRedoLog.length,
    },
  });
};

const recordPageAction = (kind: PageActionKind): void => {
  actionUndoLog.push(kind);

  if (actionUndoLog.length > ACTION_LOG_LIMIT) {
    actionUndoLog.shift();
  }

  actionRedoLog.length = 0;
  sendHistorySync();
};

const picker = new ElementPickerController(overlay, {
  onActionRecorded: recordPageAction,
});
const ruler = new ManualRulerController();
const grid = new GridController();

// If this script is injected on demand (into a tab that was already open) while
// the declared content script also runs, guard against registering the message
// handler twice — a second listener would double-process every command.
if (window.__uiBuddyListenerAttached !== true) {
  window.__uiBuddyListenerAttached = true;

  addRuntimeMessageListener((message) => {
  if (message.type === "PICKER_ENABLE") {
    ruler.disable();
    picker.enable("select");
    return;
  }

  if (message.type === "PICKER_DISABLE") {
    picker.disable();
    return;
  }

  if (message.type === "MEASURE_START") {
    picker.enable("measure", message.payload);
    return;
  }

  if (message.type === "APPLY_STYLE_CHANGE") {
    styleInjector.applyChange(message.payload);
    recordPageAction("style");
    return;
  }

  if (message.type === "RESET_ELEMENT_CHANGES") {
    styleInjector.reset();
    // Style entries leave the log; move/delete history stays untouched.
    const keptUndo = actionUndoLog.filter((kind) => kind !== "style");
    const keptRedo = actionRedoLog.filter((kind) => kind !== "style");
    actionUndoLog.splice(0, actionUndoLog.length, ...keptUndo);
    actionRedoLog.splice(0, actionRedoLog.length, ...keptRedo);
    sendHistorySync();
    return;
  }

  if (message.type === "UNDO_CHANGE") {
    const kind = actionUndoLog.pop();

    if (kind !== undefined) {
      actionRedoLog.push(kind);

      if (kind === "style") {
        styleInjector.undo();
      } else if (kind === "move") {
        picker.undoMovePosition();
      } else {
        picker.undoDeleteElement();
      }
    }

    sendHistorySync();
    return;
  }

  if (message.type === "REDO_CHANGE") {
    const kind = actionRedoLog.pop();

    if (kind !== undefined) {
      actionUndoLog.push(kind);

      if (kind === "style") {
        styleInjector.redo();
      } else if (kind === "move") {
        picker.redoMovePosition();
      } else {
        picker.redoDeleteElement();
      }
    }

    sendHistorySync();
    return;
  }

  if (message.type === "RULER_ENABLE") {
    picker.disable();
    ruler.enable();
    return;
  }

  if (message.type === "RULER_DISABLE") {
    ruler.disable();
    return;
  }

  if (message.type === "SCAN_PAGE") {
    try {
      const result = scanPage();
      void sendRuntimeMessage({ type: "PAGE_SCAN_RESULT", payload: result });
    } catch (e) {
      console.error("Failed to scan page:", e);
      void sendRuntimeMessage({
        type: "PAGE_SCAN_RESULT",
        payload: { colors: [], fonts: [], assets: [] },
      });
    }
    return;
  }

  if (message.type === "GRID_TOGGLE") {
    grid.toggle();
    return;
  }

  if (message.type === "SELECT_ANCESTOR") {
    if (picker.isActive()) {
      picker.selectAncestor(message.payload.depth);
    }
    return;
  }

  if (message.type === "SEARCH_ELEMENTS") {
    void sendRuntimeMessage({
      type: "ELEMENT_SEARCH_RESULT",
      payload: {
        query: message.payload.query,
        results: picker.searchElements(message.payload.query),
      },
    });
    return;
  }

  if (message.type === "SELECT_SEARCH_RESULT") {
    picker.selectBySelector(message.payload.selector);
    return;
  }

  if (message.type === "PIN_ELEMENT_CARD") {
    overlay.pinElementCard(message.payload.snapshot, message.payload.kind);
    return;
  }

  if (message.type === "CLEAR_PINNED_CARDS") {
    overlay.clearPinnedCards();
    return;
  }

  if (message.type === "ELEMENT_MOVE_ENABLE") {
    picker.setMoveMode(true);
    return;
  }

  if (message.type === "ELEMENT_MOVE_DISABLE") {
    picker.setMoveMode(false);
    return;
  }

  if (message.type === "RESTORE_SELECTED_ELEMENT") {
    picker.restoreSelectedElement();
    return;
  }

  if (message.type === "MOVE_SELECTED_ELEMENT") {
    picker.moveSelectedElement(message.payload.direction);
    return;
  }

  if (message.type === "NUDGE_SELECTED_ELEMENT") {
    picker.nudgeSelectedElement(message.payload.deltaX, message.payload.deltaY);
    return;
  }

  if (message.type === "REPLACE_SELECTED_IMAGE") {
    picker.replaceSelectedImage(message.payload.src);
    return;
  }

  if (message.type === "START_TEXT_EDIT") {
    picker.startTextEdit();
    return;
  }

  if (message.type === "COPY_ELEMENT_CSS") {
    const element = picker.getSelectedElementNode();

    if (element !== null) {
      const result = extractElementCss(element, message.payload.includeChildren);
      void sendRuntimeMessage({ type: "ELEMENT_CSS_RESULT", payload: result });
    }
    return;
  }

  if (message.type === "A11Y_SCAN") {
    try {
      const issues = runA11yAudit();
      void sendRuntimeMessage({ type: "A11Y_SCAN_RESULT", payload: { issues } });
    } catch (error) {
      console.error("ui-buddy accessibility scan failed:", error);
      void sendRuntimeMessage({ type: "A11Y_SCAN_RESULT", payload: { issues: [] } });
    }
    return;
  }

  if (message.type === "FETCH_ASSET") {
    const { src } = message.payload;
    void (async () => {
      try {
        const response = await fetch(src);
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.addEventListener("error", () => reject(new Error("Unable to read asset.")));
          reader.addEventListener("load", () => {
            if (typeof reader.result === "string") {
              resolve(reader.result);
            } else {
              reject(new Error("Unable to read asset."));
            }
          });
          reader.readAsDataURL(blob);
        });
        void sendRuntimeMessage({ type: "ASSET_FETCHED", payload: { src, dataUrl } });
      } catch (error) {
        void sendRuntimeMessage({
          type: "ASSET_FETCHED",
          payload: {
            src,
            dataUrl: null,
            error: error instanceof Error ? error.message : "Unable to fetch asset.",
          },
        });
      }
    })();
    return;
  }

  if (message.type === "ALIGN_SELECTED") {
    picker.alignSelected(message.payload.alignment);
    return;
  }

  if (message.type === "SCROLL_SELECTED_INTO_VIEW") {
    picker.scrollSelectedIntoView();
    return;
  }

  if (message.type === "MARK_SELECTED_FOR_SOURCE") {
    picker.markSelectedForSource();
    return;
  }

  if (message.type === "SET_CAPTURE_MODE") {
    overlay.setCaptureHidden(message.payload.active);
    return;
  }

  if (message.type === "APPLY_RAW_CSS") {
    styleInjector.setRawCss(message.payload.selector, message.payload.css);
    return;
  }

  if (message.type === "SET_ANIMATION_SPEED") {
    const { speed } = message.payload;
    window.__ui_devtools_anim_speed = speed;

    const applySpeed = () => {
      const playbackRate = window.__ui_devtools_anim_speed ?? speed;
      document.getAnimations().forEach((animation) => {
        animation.playbackRate = playbackRate;
      });
    };

    applySpeed();

    if (window.__ui_devtools_anim_listener !== true) {
      window.__ui_devtools_anim_listener = true;
      document.addEventListener("animationstart", applySpeed, true);
      document.addEventListener("transitionstart", applySpeed, true);
      document.addEventListener("transitionrun", applySpeed, true);
    }

    return;
  }
  });
}
