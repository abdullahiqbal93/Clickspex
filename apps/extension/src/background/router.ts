import type { ExtensionMessage } from "@ui-devtools/shared";

const CONTENT_TO_PANEL_MESSAGES = new Set<ExtensionMessage["type"]>([
  "ELEMENT_HOVERED",
  "ELEMENT_SELECTED",
  "ELEMENT_UNSELECTED",
  "PICKER_DISABLE",
  "MEASURE_TARGET_SELECTED",
  "RULER_DISABLE",
  "PAGE_SCAN_RESULT",
]);

export const shouldForwardToSidePanel = (message: ExtensionMessage): boolean =>
  CONTENT_TO_PANEL_MESSAGES.has(message.type);
