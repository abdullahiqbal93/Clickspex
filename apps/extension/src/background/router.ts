import type { ExtensionMessage } from "@ui-devtools/shared";

const CONTENT_TO_PANEL_MESSAGES = new Set<ExtensionMessage["type"]>([
  "ELEMENT_HOVERED",
  "ELEMENT_SELECTED",
  "PICKER_DISABLE",
  "MEASURE_TARGET_SELECTED",
]);

export const shouldForwardToSidePanel = (message: ExtensionMessage): boolean =>
  CONTENT_TO_PANEL_MESSAGES.has(message.type);
