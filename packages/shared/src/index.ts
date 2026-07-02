export const SUPPORTED_STYLE_PROPERTIES = [
  "width",
  "min-width",
  "max-width",
  "height",
  "min-height",
  "max-height",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "gap",
  "color",
  "background-color",
  "background-repeat",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-transform",
  "text-decoration-line",
  "border-width",
  "border-style",
  "border-color",
  "border-radius",
  "display",
  "box-sizing",
  "overflow",
  "overflow-x",
  "overflow-y",
  "flex-direction",
  "flex-wrap",
  "justify-content",
  "align-items",
  "align-content",
  "align-self",
  "order",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "justify-items",
  "justify-self",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  "visibility",
  "opacity",
  "cursor",
  "pointer-events",
  "user-select",
  "object-fit",
  "object-position",
  "transform",
  "transform-origin",
  "filter",
  "box-shadow",
  "transition",
  "transition-property",
  "transition-duration",
  "transition-timing-function",
  "transition-delay",
  "animation",
  "animation-name",
  "animation-duration",
  "animation-timing-function",
  "animation-delay",
  "animation-iteration-count",
  "animation-direction",
  "animation-fill-mode",
  "animation-play-state",
] as const;

export type SupportedStyleProperty = (typeof SUPPORTED_STYLE_PROPERTIES)[number];

export const STYLE_TARGET_STATES = [
  "base",
  "hover",
  "focus",
  "focus-visible",
  "focus-within",
  "active",
  "disabled",
  "checked",
] as const;

export type StyleTargetState = (typeof STYLE_TARGET_STATES)[number];
export const IMPORTANT_COMPUTED_STYLE_PROPERTIES = [
  ...SUPPORTED_STYLE_PROPERTIES,
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-style",
  "border-right-style",
  "border-bottom-style",
  "border-left-style",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
] as const;

export type ImportantComputedStyleProperty = (typeof IMPORTANT_COMPUTED_STYLE_PROPERTIES)[number];

export type RectSnapshot = {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type BoxSideSnapshot = {
  top: string;
  right: string;
  bottom: string;
  left: string;
};

export type BoxModelSnapshot = {
  margin: BoxSideSnapshot;
  border: BoxSideSnapshot;
  padding: BoxSideSnapshot;
  content: {
    width: string;
    height: string;
  };
};

export type ParentLayoutInfo = {
  tagName: string;
  selector: string;
  display: string;
  flexDirection: string | null;
  flexWrap: string | null;
  gap: string | null;
  alignItems: string | null;
  alignContent: string | null;
  justifyContent: string | null;
};

export type ElementSnapshot = {
  tagName: string;
  id: string;
  classList: string[];
  textPreview: string;
  attributes: Record<string, string>;
  selector: string;
  domPath: string;
  rect: RectSnapshot;
  computedStyles: Record<string, string>;
  boxModel: BoxModelSnapshot;
  parentLayout: ParentLayoutInfo | null;
};

export type StyleChange = {
  selector: string;
  property: SupportedStyleProperty;
  beforeValue: string;
  afterValue: string;
  timestamp: string;
  state?: StyleTargetState;
};

export type AccessibilityNote = {
  id: string;
  severity: "info" | "warning" | "error";
  title: string;
  message: string;
};

export type UIChangeIntent = {
  id: string;
  timestamp: string;
  pageUrl: string;
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  target: {
    tagName: string;
    id?: string;
    classList: string[];
    textPreview?: string;
    selector: string;
    domPath: string;
    attributes: Record<string, string>;
  };
  before: {
    styles: Record<string, string>;
    rect: RectSnapshot;
    boxModel: BoxModelSnapshot;
  };
  after: {
    styles: Record<string, string>;
    rect?: RectSnapshot;
    boxModel?: BoxModelSnapshot;
  };
  changes: StyleChange[];
  accessibilityNotes: AccessibilityNote[];
  visualIntent?: string;
  frameworkHints?: string[];
};

export type PatchSuggestion = {
  adapterId: string;
  title: string;
  confidence: number;
  explanation: string;
  filesToChange: string[];
  diffPreview: string;
  warnings: string[];
  manualSteps: string[];
};

export type AdapterExport = {
  adapterId: string;
  label: string;
  content: string;
  warnings: string[];
};

export type ProjectFileKind = "route" | "component" | "stylesheet" | "config" | "asset" | "other";

export type ProjectFileSummary = {
  path: string;
  kind: ProjectFileKind;
  size: number;
  selectors: string[];
  classNames: string[];
  ids: string[];
  imports: string[];
};

export type ProjectSourceFile = ProjectFileSummary & {
  content: string;
};

export type ProjectIndexStats = {
  indexedFiles: number;
  skippedFiles: number;
  truncated: boolean;
  maxDepth: number;
  maxFileBytes: number;
};

export type ProjectContext = {
  rootPath: string;
  packageJson?: {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  configFiles: string[];
  directories: string[];
  files?: ProjectFileSummary[];
  sourceFiles?: ProjectSourceFile[];
  indexStats?: ProjectIndexStats;
};

export type AdapterDetectionResult = {
  adapterId: string;
  name: string;
  detected: boolean;
  confidence: number;
  evidence: string[];
};

export interface FrameworkAdapter {
  id: string;
  name: string;
  detect(projectContext: ProjectContext): Promise<AdapterDetectionResult> | AdapterDetectionResult;
  generatePatch(
    changeIntent: UIChangeIntent,
    projectContext?: ProjectContext,
  ): Promise<PatchSuggestion[]> | PatchSuggestion[];
  generateExport(changeIntent: UIChangeIntent): AdapterExport;
}

export type PageColorInfo = {
  hex: string;
  rgb: string;
  count: number;
  properties: string[];
};

export type PageFontInfo = {
  family: string;
  sizes: string[];
  weights: string[];
  count: number;
};

export type PageAssetInfo = {
  type: "img" | "svg" | "bg";
  src: string;
  alt: string;
  width: number;
  height: number;
};

export type PageScanResult = {
  colors: PageColorInfo[];
  fonts: PageFontInfo[];
  assets: PageAssetInfo[];
};

export type ElementSearchResult = Pick<
  ElementSnapshot,
  "tagName" | "id" | "classList" | "textPreview" | "selector" | "rect"
>;

export type PinCardKind = "styles" | "audit";

export type DomMoveDirection = "previous" | "next" | "out-before" | "out-after";

export type ExtensionMessage =
  | { type: "PICKER_ENABLE" }
  | { type: "PICKER_DISABLE" }
  | { type: "ELEMENT_HOVERED"; payload: { selector: string; rect: RectSnapshot } }
  | { type: "ELEMENT_SELECTED"; payload: ElementSnapshot }
  | { type: "ELEMENT_UNSELECTED" }
  | { type: "APPLY_STYLE_CHANGE"; payload: StyleChange }
  | { type: "RESET_ELEMENT_CHANGES" }
  | { type: "UNDO_CHANGE" }
  | { type: "REDO_CHANGE" }
  | { type: "GET_SELECTED_ELEMENT" }
  | { type: "EXPORT_CHANGE_INTENT" }
  | { type: "MEASURE_START"; payload?: ElementSnapshot }
  | { type: "MEASURE_TARGET_SELECTED"; payload: ElementSnapshot }
  | { type: "RULER_ENABLE" }
  | { type: "RULER_DISABLE" }
  | { type: "SCAN_PAGE" }
  | { type: "GRID_TOGGLE" }
  | { type: "SELECT_ANCESTOR"; payload: { depth: number } }
  | { type: "SEARCH_ELEMENTS"; payload: { query: string } }
  | { type: "ELEMENT_SEARCH_RESULT"; payload: { query: string; results: ElementSearchResult[] } }
  | { type: "SELECT_SEARCH_RESULT"; payload: { selector: string } }
  | { type: "PIN_ELEMENT_CARD"; payload: { snapshot: ElementSnapshot; kind: PinCardKind } }
  | { type: "CLEAR_PINNED_CARDS" }
  | { type: "ELEMENT_MOVE_ENABLE" }
  | { type: "ELEMENT_MOVE_DISABLE" }
  | { type: "RESTORE_SELECTED_ELEMENT" }
  | { type: "UNDO_MOVE_POSITION" }
  | { type: "REDO_MOVE_POSITION" }
  | { type: "MOVE_SELECTED_ELEMENT"; payload: { direction: DomMoveDirection } }
  | { type: "NUDGE_SELECTED_ELEMENT"; payload: { deltaX: number; deltaY: number } }
  | { type: "REPLACE_SELECTED_IMAGE"; payload: { src: string } }
  | { type: "START_TEXT_EDIT" }
  | { type: "SET_ANIMATION_SPEED"; payload: { speed: number } }
  | { type: "PAGE_SCAN_RESULT"; payload: PageScanResult };

export type MessageType = ExtensionMessage["type"];

const MESSAGE_TYPES_WITHOUT_PAYLOAD = new Set<MessageType>([
  "PICKER_ENABLE",
  "PICKER_DISABLE",
  "ELEMENT_UNSELECTED",
  "RESET_ELEMENT_CHANGES",
  "UNDO_CHANGE",
  "REDO_CHANGE",
  "GET_SELECTED_ELEMENT",
  "EXPORT_CHANGE_INTENT",
  "RULER_ENABLE",
  "RULER_DISABLE",
  "SCAN_PAGE",
  "GRID_TOGGLE",
  "CLEAR_PINNED_CARDS",
  "ELEMENT_MOVE_ENABLE",
  "ELEMENT_MOVE_DISABLE",
  "RESTORE_SELECTED_ELEMENT",
  "UNDO_MOVE_POSITION",
  "REDO_MOVE_POSITION",
  "START_TEXT_EDIT",
]);

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) && Object.values(value).every(isString);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString);

export const isSupportedStyleProperty = (value: unknown): value is SupportedStyleProperty =>
  isString(value) && SUPPORTED_STYLE_PROPERTIES.includes(value as SupportedStyleProperty);

export const isStyleTargetState = (value: unknown): value is StyleTargetState =>
  isString(value) && STYLE_TARGET_STATES.includes(value as StyleTargetState);

export const isRectSnapshot = (value: unknown): value is RectSnapshot => {
  if (!isRecord(value)) {
    return false;
  }

  return ["x", "y", "width", "height", "top", "right", "bottom", "left"].every((key) =>
    isNumber(value[key]),
  );
};

const isBoxSideSnapshot = (value: unknown): value is BoxSideSnapshot => {
  if (!isRecord(value)) {
    return false;
  }

  return ["top", "right", "bottom", "left"].every((key) => isString(value[key]));
};

export const isBoxModelSnapshot = (value: unknown): value is BoxModelSnapshot => {
  if (!isRecord(value) || !isRecord(value.content)) {
    return false;
  }

  return (
    isBoxSideSnapshot(value.margin) &&
    isBoxSideSnapshot(value.border) &&
    isBoxSideSnapshot(value.padding) &&
    isString(value.content.width) &&
    isString(value.content.height)
  );
};

export const isElementSnapshot = (value: unknown): value is ElementSnapshot => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.tagName) &&
    isString(value.id) &&
    isStringArray(value.classList) &&
    isString(value.textPreview) &&
    isStringRecord(value.attributes) &&
    isString(value.selector) &&
    isString(value.domPath) &&
    isRectSnapshot(value.rect) &&
    isStringRecord(value.computedStyles) &&
    isBoxModelSnapshot(value.boxModel) &&
    (value.parentLayout === null || isRecord(value.parentLayout))
  );
};

export const isStyleChange = (value: unknown): value is StyleChange => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.selector) &&
    isSupportedStyleProperty(value.property) &&
    isString(value.beforeValue) &&
    isString(value.afterValue) &&
    isString(value.timestamp) &&
    (value.state === undefined || isStyleTargetState(value.state))
  );
};

const isElementSearchResult = (value: unknown): value is ElementSearchResult => {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isString(value.tagName) &&
    isString(value.id) &&
    isStringArray(value.classList) &&
    isString(value.textPreview) &&
    isString(value.selector) &&
    isRectSnapshot(value.rect)
  );
};

const isPinCardKind = (value: unknown): value is PinCardKind =>
  value === "styles" || value === "audit";

const isDomMoveDirection = (value: unknown): value is DomMoveDirection =>
  value === "previous" || value === "next" || value === "out-before" || value === "out-after";

export const isExtensionMessage = (value: unknown): value is ExtensionMessage => {
  if (!isRecord(value) || !isString(value.type)) {
    return false;
  }

  const messageType = value.type as MessageType;

  if (MESSAGE_TYPES_WITHOUT_PAYLOAD.has(messageType)) {
    return value.payload === undefined;
  }

  if (messageType === "ELEMENT_HOVERED") {
    return (
      isRecord(value.payload) &&
      isString(value.payload.selector) &&
      isRectSnapshot(value.payload.rect)
    );
  }

  if (messageType === "ELEMENT_SELECTED" || messageType === "MEASURE_TARGET_SELECTED") {
    return isElementSnapshot(value.payload);
  }

  if (messageType === "APPLY_STYLE_CHANGE") {
    return isStyleChange(value.payload);
  }

  if (messageType === "PAGE_SCAN_RESULT") {
    return (
      isRecord(value.payload) &&
      Array.isArray(value.payload.colors) &&
      Array.isArray(value.payload.fonts) &&
      Array.isArray(value.payload.assets)
    );
  }

  if (messageType === "ELEMENT_SEARCH_RESULT") {
    return (
      isRecord(value.payload) &&
      isString(value.payload.query) &&
      Array.isArray(value.payload.results) &&
      value.payload.results.every(isElementSearchResult)
    );
  }

  if (messageType === "PIN_ELEMENT_CARD") {
    return (
      isRecord(value.payload) &&
      isElementSnapshot(value.payload.snapshot) &&
      isPinCardKind(value.payload.kind)
    );
  }

  if (messageType === "SEARCH_ELEMENTS" || messageType === "SELECT_SEARCH_RESULT") {
    return isRecord(value.payload) && isString(value.payload.query ?? value.payload.selector);
  }

  if (messageType === "MOVE_SELECTED_ELEMENT") {
    return isRecord(value.payload) && isDomMoveDirection(value.payload.direction);
  }

  if (messageType === "NUDGE_SELECTED_ELEMENT") {
    return (
      isRecord(value.payload) && isNumber(value.payload.deltaX) && isNumber(value.payload.deltaY)
    );
  }

  if (messageType === "REPLACE_SELECTED_IMAGE") {
    return isRecord(value.payload) && isString(value.payload.src);
  }

  if (messageType === "MEASURE_START") {
    return value.payload === undefined || isElementSnapshot(value.payload);
  }

  if (messageType === "SELECT_ANCESTOR") {
    return isRecord(value.payload) && isNumber(value.payload.depth);
  }

  if (messageType === "SET_ANIMATION_SPEED") {
    return isRecord(value.payload) && isNumber(value.payload.speed);
  }

  return false;
};

export const createUnsupportedPatchSuggestion = (
  adapterId: string,
  title: string,
): PatchSuggestion => ({
  adapterId,
  title,
  confidence: 0,
  explanation: "Not yet implemented. See ROADMAP(v2) in adapter source.",
  filesToChange: [],
  diffPreview: "",
  warnings: ["This adapter does not generate real patches in v1."],
  manualSteps: [],
});
