import { addRuntimeMessageListener } from "../chrome/messaging";
import { sendRuntimeMessage } from "../chrome/messaging";

import { GridController } from "./grid";
import { OverlayController } from "./overlay";
import { scanPage } from "./pageScanner";
import { ElementPickerController } from "./picker";
import { ManualRulerController } from "./ruler";
import { StyleInjector } from "./styleInjector";

const overlay = new OverlayController();
const styleInjector = new StyleInjector();
const picker = new ElementPickerController(overlay, {
  onElementSelected: () => styleInjector.reset(),
});
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
      void sendRuntimeMessage({ type: "PAGE_SCAN_RESULT", payload: { colors: [], fonts: [], assets: [] } });
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

  if (message.type === "SET_ANIMATION_SPEED") {
    const { speed } = message.payload;
    (window as any).__ui_devtools_anim_speed = speed;
    
    const applySpeed = () => {
      document.getAnimations().forEach((anim) => { 
        anim.playbackRate = (window as any).__ui_devtools_anim_speed; 
      });
    };

    applySpeed();
    
    // Attach listeners only once
    if (!(window as any).__ui_devtools_anim_listener) {
      (window as any).__ui_devtools_anim_listener = true;
      document.addEventListener("animationstart", applySpeed, true);
      document.addEventListener("transitionstart", applySpeed, true);
      document.addEventListener("transitionrun", applySpeed, true);
    }
    
    return;
  }
});
