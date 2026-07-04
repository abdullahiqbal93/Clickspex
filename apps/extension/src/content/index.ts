import { addRuntimeMessageListener, sendRuntimeMessage } from "../chrome/messaging";

import { runA11yAudit } from "./a11yAudit";
import { extractElementCss } from "./cssExtractor";
import { GridController } from "./grid";
import { OverlayController } from "./overlay";
import { scanPage } from "./pageScanner";
import { ElementPickerController } from "./picker";
import { ManualRulerController } from "./ruler";
import { StyleInjector } from "./styleInjector";

import type { StructuralEdit } from "@ui-buddy/shared";

declare global {
  interface Window {
    __ui_devtools_anim_listener?: boolean;
    __ui_devtools_anim_speed?: number;
    __uiBuddyListenerAttached?: boolean;
  }
}

const overlay = new OverlayController();
const styleInjector = new StyleInjector();

// Unified page-action history.
// One ordered log across style edits, raw CSS, moves, deletes, text, and image
// edits so a single undo/redo covers everything the user did to the page and
// so the full session (not just the last-selected element) can be exported.
type PageAction =
  { kind: "style" } | { kind: "raw-css" } | { kind: StructuralEdit["kind"]; edit: StructuralEdit };

const ACTION_LOG_LIMIT = 200;
const actionUndoLog: PageAction[] = [];
const actionRedoLog: PageAction[] = [];

const collectStructuralEdits = (): StructuralEdit[] =>
  actionUndoLog.flatMap((action) => ("edit" in action ? [action.edit] : []));

const sendSessionSync = (): void => {
  void sendRuntimeMessage({
    type: "SESSION_SYNC",
    payload: {
      styleChanges: styleInjector.getAppliedChanges(),
      rawCss: styleInjector.getRawCssEntries(),
      structuralEdits: collectStructuralEdits(),
      undoDepth: actionUndoLog.length,
      redoDepth: actionRedoLog.length,
    },
  });
};

const recordPageAction = (action: PageAction): void => {
  actionUndoLog.push(action);

  if (actionUndoLog.length > ACTION_LOG_LIMIT) {
    actionUndoLog.shift();
  }

  actionRedoLog.length = 0;
  sendSessionSync();
};

const picker = new ElementPickerController(overlay, {
  onStructuralEdit: (edit) => recordPageAction({ kind: edit.kind, edit }),
});
const ruler = new ManualRulerController();
const grid = new GridController();

const undoPageAction = (action: PageAction): void => {
  switch (action.kind) {
    case "style":
      styleInjector.undo();
      break;
    case "raw-css":
      styleInjector.undoRawCss();
      break;
    case "move":
      picker.undoMovePosition();
      break;
    case "delete":
      picker.undoDeleteElement();
      break;
    case "text":
      picker.undoTextEdit();
      break;
    case "image":
      picker.undoImageEdit();
      break;
  }
};

const redoPageAction = (action: PageAction): void => {
  switch (action.kind) {
    case "style":
      styleInjector.redo();
      break;
    case "raw-css":
      styleInjector.redoRawCss();
      break;
    case "move":
      picker.redoMovePosition();
      break;
    case "delete":
      picker.redoDeleteElement();
      break;
    case "text":
      picker.redoTextEdit();
      break;
    case "image":
      picker.redoImageEdit();
      break;
  }
};

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
      if (styleInjector.applyChange(message.payload)) {
        recordPageAction({ kind: "style" });
      } else {
        // Coalesced into the previous change (continuous drag): no new undo step,
        // but the panel still needs the updated value.
        sendSessionSync();
      }
      return;
    }

    if (message.type === "RESET_ELEMENT_CHANGES") {
      styleInjector.reset();
      // Style + raw CSS entries leave the log; structural history stays untouched.
      const keep = (action: PageAction): boolean =>
        action.kind !== "style" && action.kind !== "raw-css";
      const keptUndo = actionUndoLog.filter(keep);
      const keptRedo = actionRedoLog.filter(keep);
      actionUndoLog.splice(0, actionUndoLog.length, ...keptUndo);
      actionRedoLog.splice(0, actionRedoLog.length, ...keptRedo);
      sendSessionSync();
      return;
    }

    if (message.type === "UNDO_CHANGE") {
      const action = actionUndoLog.pop();

      if (action !== undefined) {
        actionRedoLog.push(action);
        undoPageAction(action);
      }

      sendSessionSync();
      return;
    }

    if (message.type === "REDO_CHANGE") {
      const action = actionRedoLog.pop();

      if (action !== undefined) {
        actionUndoLog.push(action);
        redoPageAction(action);
      }

      sendSessionSync();
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
      if (styleInjector.applyRawCss(message.payload.selector, message.payload.css)) {
        recordPageAction({ kind: "raw-css" });
      }
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
