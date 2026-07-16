import type { ExtensionMessage } from "@clickspex/shared";

const CONTENT_TO_PANEL_MESSAGES = new Set<ExtensionMessage["type"]>([
  "ELEMENT_HOVERED",
  "ELEMENT_SELECTED",
  "ELEMENT_UNSELECTED",
  "PICKER_DISABLE",
  "MEASURE_TARGET_SELECTED",
  "RULER_DISABLE",
  "PAGE_SCAN_RESULT",
  "ELEMENT_SEARCH_RESULT",
  "DOM_CONTEXT_RESULT",
  "DOM_CHILDREN_RESULT",
  "ELEMENT_CSS_RESULT",
  "MATCHED_STYLES_RESULT",
  "A11Y_SCAN_RESULT",
  "ASSET_FETCHED",
  "MULTI_SELECTION_CHANGED",
  "SESSION_SYNC",
  "EDITS_RESTORED",
]);

export const shouldForwardToSidePanel = (message: ExtensionMessage): boolean =>
  CONTENT_TO_PANEL_MESSAGES.has(message.type);
