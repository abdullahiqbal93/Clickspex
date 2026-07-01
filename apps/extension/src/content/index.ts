import { addRuntimeMessageListener } from "../chrome/messaging";

import { OverlayController } from "./overlay";
import { ElementPickerController } from "./picker";

const overlay = new OverlayController();
const picker = new ElementPickerController(overlay);

addRuntimeMessageListener((message) => {
  if (message.type === "PICKER_ENABLE") {
    picker.enable();
    return;
  }

  if (message.type === "PICKER_DISABLE") {
    picker.disable();
    return;
  }
});
