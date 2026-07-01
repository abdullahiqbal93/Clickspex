import { addRuntimeMessageListener } from "../chrome/messaging";

import { OverlayController } from "./overlay";
import { ElementPickerController } from "./picker";
import { StyleInjector } from "./styleInjector";

const overlay = new OverlayController();
const picker = new ElementPickerController(overlay);
const styleInjector = new StyleInjector();

addRuntimeMessageListener((message) => {
  if (message.type === "PICKER_ENABLE") {
    picker.enable();
    return;
  }

  if (message.type === "PICKER_DISABLE") {
    picker.disable();
    return;
  }

  if (message.type === "APPLY_STYLE_CHANGE") {
    styleInjector.applyChange(message.payload);
    return;
  }

  if (message.type === "RESET_ELEMENT_CHANGES") {
    styleInjector.reset();
  }
});
