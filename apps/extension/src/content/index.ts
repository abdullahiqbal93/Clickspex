import { addRuntimeMessageListener, sendRuntimeMessage } from "../chrome/messaging";

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
  }
}

const overlay = new OverlayController();
const styleInjector = new StyleInjector();
const picker = new ElementPickerController(overlay);
const ruler = new ManualRulerController();
const grid = new GridController();

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
    return;
  }

  if (message.type === "RESET_ELEMENT_CHANGES") {
    styleInjector.reset();
    return;
  }

  if (message.type === "UNDO_CHANGE") {
    styleInjector.undo();
    return;
  }

  if (message.type === "REDO_CHANGE") {
    styleInjector.redo();
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

  if (message.type === "UNDO_MOVE_POSITION") {
    picker.undoMovePosition();
    return;
  }

  if (message.type === "REDO_MOVE_POSITION") {
    picker.redoMovePosition();
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
