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

export const STYLE_RESPONSIVE_TARGETS = ["all", "mobile", "tablet", "desktop"] as const;

export type StyleResponsiveTarget = (typeof STYLE_RESPONSIVE_TARGETS)[number];

export type StyleResponsiveTargetDefinition = {
  target: StyleResponsiveTarget;
  label: string;
  shortLabel: string;
  mediaQuery: string | null;
  minWidth?: number;
  maxWidth?: number;
};

export const STYLE_RESPONSIVE_TARGET_DEFINITIONS: readonly StyleResponsiveTargetDefinition[] = [
  {
    target: "all",
    label: "All screens",
    shortLabel: "All",
    mediaQuery: null,
  },
  {
    target: "mobile",
    label: "Mobile",
    shortLabel: "Mobile",
    mediaQuery: "(max-width: 767px)",
    maxWidth: 767,
  },
  {
    target: "tablet",
    label: "Tablet",
    shortLabel: "Tablet",
    mediaQuery: "(min-width: 768px) and (max-width: 1023px)",
    minWidth: 768,
    maxWidth: 1023,
  },
  {
    target: "desktop",
    label: "Desktop",
    shortLabel: "Desktop",
    mediaQuery: "(min-width: 1024px)",
    minWidth: 1024,
  },
];

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
  effectiveBackgroundColor?: string;
  fallbackSelectors?: string[];
};

export type StyleChange = {
  selector: string;
  property: string;
  beforeValue: string;
  afterValue: string;
  timestamp: string;
  state?: StyleTargetState;
  responsiveTarget?: StyleResponsiveTarget;
};

export type MatchedStyleDeclaration = {
  property: string;
  value: string;
  important: boolean;
  active: boolean;
  overridden: boolean;
  inherited: boolean;
};

export type MatchedStyleSource = {
  label: string;
  url: string | null;
};

export type MatchedStyleRule = {
  id: string;
  selector: string;
  specificity: [number, number, number];
  origin: "inspector" | "inline" | "author";
  source: MatchedStyleSource;
  declarations: MatchedStyleDeclaration[];
  active: boolean;
  conditional: string | null;
  inheritedFrom: { selector: string; tagName: string } | null;
};

export type MatchedStyleDeclarationMutation = {
  ruleId: string;
  inheritedSelector: string | null;
  property: string;
  nextProperty: string | null;
};

export type MatchedStylesResult = {
  selector: string;
  rules: MatchedStyleRule[];
  computed: Record<string, string>;
  variables: Record<string, string>;
  unreadableStylesheets: number;
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
    fallbackSelectors?: string[];
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
  rawCss?: string;
};

export type StructuralEditKind = "move" | "delete" | "text" | "image" | "attribute";

export type StructuralEditTarget = {
  tagName: string;
  id?: string;
  classList: string[];
  selector: string;
  domPath: string;
  fallbackSelectors?: string[];
};

export type StructuralEdit = {
  id: string;
  kind: StructuralEditKind;
  timestamp: string;
  target: StructuralEditTarget;
  summary: string;
  details: Record<string, string>;
};

/**
 * A complete browser editing session: every edited element (with its style
 * changes and raw CSS) plus every structural edit, so the full set of changes
 * can be exported and mapped to source - not just the last-selected element.
 */
export type PromptStackHint = {
  name: string;
  confidence?: number;
  evidence?: string[];
  guidance?: string;
  sourceModel?: string;
};

export type PromptClassConvention = {
  name: string;
  stablePatterns?: string[];
  weakPatterns?: string[];
  generatedPatterns?: string[];
  utilityPatterns?: string[];
  cssModulePatterns?: string[];
  notes?: string[];
};

export type PromptProjectContext = {
  stackHints?: PromptStackHint[];
  classConventions?: PromptClassConvention[];
  sourceHints?: string[];
  designTokenHints?: string[];
};

export type UIChangeSession = {
  id: string;
  timestamp: string;
  pageUrl: string;
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  elements: UIChangeIntent[];
  structuralEdits: StructuralEdit[];
  frameworkHints?: string[];
  promptContext?: PromptProjectContext;
  stats: {
    editedElements: number;
    styleChanges: number;
    structuralEdits: number;
  };
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

export type PageTokenInfo = {
  name: string;
  value: string;
  isColor: boolean;
};

export type PageScanResult = {
  colors: PageColorInfo[];
  fonts: PageFontInfo[];
  assets: PageAssetInfo[];
  tokens?: PageTokenInfo[];
};

export type PageTechInfo = {
  name: string;
  category: "framework" | "library" | "styling" | "platform" | "analytics" | "other";
  evidence: string;
};

export type A11yIssue = {
  id: string;
  selector: string;
  severity: "info" | "warning" | "error";
  title: string;
  message: string;
};

export const ALIGN_EDGES = ["left", "center-x", "right", "top", "center-y", "bottom"] as const;

export type AlignEdge = (typeof ALIGN_EDGES)[number];

export type ComponentSourceInfo = {
  file: string | null;
  line: number | null;
  column: number | null;
  componentName: string | null;
};

export type ElementSearchResult = Pick<
  ElementSnapshot,
  "tagName" | "id" | "classList" | "textPreview" | "selector" | "rect"
>;

export type DomTreeNode = {
  selector: string;
  domPath: string;
  tagName: string;
  id: string;
  classList: string[];
  attributes: Record<string, string>;
  textPreview: string;
  childCount: number;
  visible: boolean;
};

export type DomContextPayload = {
  ancestry: DomTreeNode[];
  children: DomTreeNode[];
  childrenBySelector: Record<string, DomTreeNode[]>;
  selectedSelector: string | null;
};

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
  | { type: "DOM_CONTEXT_REQUEST" }
  | { type: "DOM_TREE_SUBSCRIBE" }
  | { type: "DOM_TREE_UNSUBSCRIBE" }
  | { type: "DOM_CONTEXT_RESULT"; payload: DomContextPayload }
  | { type: "DOM_CHILDREN_REQUEST"; payload: { selector: string; includeAll?: boolean } }
  | { type: "DOM_CHILDREN_RESULT"; payload: { selector: string; children: DomTreeNode[] } }
  | { type: "HIGHLIGHT_DOM_NODE"; payload: { selector: string | null } }
  | {
      type: "UPDATE_ELEMENT_ATTRIBUTE";
      payload: { selector: string; name: string; value: string | null };
    }
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
  | { type: "PAGE_SCAN_RESULT"; payload: PageScanResult }
  | { type: "COPY_ELEMENT_CSS"; payload: { includeChildren: boolean } }
  | { type: "GET_MATCHED_STYLES" }
  | {
      type: "MUTATE_MATCHED_STYLE_DECLARATION";
      payload: MatchedStyleDeclarationMutation;
    }
  | { type: "MATCHED_STYLES_RESULT"; payload: MatchedStylesResult }
  | {
      type: "ELEMENT_CSS_RESULT";
      payload: { css: string; html: string | null; source: "authored" | "computed" };
    }
  | { type: "A11Y_SCAN" }
  | { type: "A11Y_SCAN_RESULT"; payload: { issues: A11yIssue[] } }
  | { type: "FETCH_ASSET"; payload: { src: string } }
  | { type: "ASSET_FETCHED"; payload: { src: string; dataUrl: string | null; error?: string } }
  | { type: "UNDO_DELETE_ELEMENT" }
  | { type: "ALIGN_SELECTED"; payload: { alignment: AlignEdge } }
  | { type: "SCROLL_SELECTED_INTO_VIEW" }
  | { type: "MARK_SELECTED_FOR_SOURCE" }
  | { type: "SET_CAPTURE_MODE"; payload: { active: boolean } }
  | {
      type: "APPLY_RAW_CSS";
      payload: { selector: string; css: string; coalesce?: boolean };
    }
  | { type: "EDITS_RESTORED"; payload: { count: number } }
  | { type: "MULTI_SELECTION_CHANGED"; payload: { count: number; selectors: string[] } }
  | {
      type: "SESSION_SYNC";
      payload: {
        styleChanges: StyleChange[];
        rawCss: Array<{ selector: string; css: string }>;
        structuralEdits: StructuralEdit[];
        undoDepth: number;
        redoDepth: number;
      };
    };

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
  "DOM_CONTEXT_REQUEST",
  "DOM_TREE_SUBSCRIBE",
  "GET_MATCHED_STYLES",
  "DOM_TREE_UNSUBSCRIBE",
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
  "A11Y_SCAN",
  "UNDO_DELETE_ELEMENT",
  "SCROLL_SELECTED_INTO_VIEW",
  "MARK_SELECTED_FOR_SOURCE",
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
export const isCssPropertyName = (value: unknown): value is string =>
  isString(value) && (/^--[a-z0-9_-]+$/i.test(value) || /^-?[a-z][a-z0-9-]*$/i.test(value));

export const isStyleTargetState = (value: unknown): value is StyleTargetState =>
  isString(value) && STYLE_TARGET_STATES.includes(value as StyleTargetState);

export const isStyleResponsiveTarget = (value: unknown): value is StyleResponsiveTarget =>
  isString(value) && STYLE_RESPONSIVE_TARGETS.includes(value as StyleResponsiveTarget);

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
    isCssPropertyName(value.property) &&
    isString(value.beforeValue) &&
    isString(value.afterValue) &&
    isString(value.timestamp) &&
    (value.state === undefined || isStyleTargetState(value.state)) &&
    (value.responsiveTarget === undefined || isStyleResponsiveTarget(value.responsiveTarget))
  );
};

const STRUCTURAL_EDIT_KINDS: readonly StructuralEditKind[] = [
  "move",
  "delete",
  "text",
  "image",
  "attribute",
];

export const isStructuralEdit = (value: unknown): value is StructuralEdit => {
  if (!isRecord(value) || !isRecord(value.target) || !isRecord(value.details)) {
    return false;
  }

  const target = value.target;

  return (
    isString(value.id) &&
    isString(value.kind) &&
    (STRUCTURAL_EDIT_KINDS as readonly string[]).includes(value.kind) &&
    isString(value.timestamp) &&
    isString(value.summary) &&
    isString(target.tagName) &&
    isStringArray(target.classList) &&
    isString(target.selector) &&
    isString(target.domPath) &&
    Object.values(value.details).every(isString)
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

const isDomTreeNode = (value: unknown): value is DomTreeNode =>
  isRecord(value) &&
  isString(value.selector) &&
  isString(value.domPath) &&
  isString(value.tagName) &&
  isString(value.id) &&
  isStringArray(value.classList) &&
  isStringRecord(value.attributes) &&
  isString(value.textPreview) &&
  isNumber(value.childCount) &&
  typeof value.visible === "boolean";

const isDomChildrenRecord = (value: unknown): value is Record<string, DomTreeNode[]> =>
  isRecord(value) &&
  Object.values(value).every(
    (children) => Array.isArray(children) && children.every(isDomTreeNode),
  );

const isPinCardKind = (value: unknown): value is PinCardKind =>
  value === "styles" || value === "audit";

const isMatchedStyleDeclaration = (value: unknown): value is MatchedStyleDeclaration =>
  isRecord(value) &&
  isString(value.property) &&
  isString(value.value) &&
  typeof value.important === "boolean" &&
  typeof value.active === "boolean" &&
  typeof value.overridden === "boolean" &&
  typeof value.inherited === "boolean";

const isMatchedStyleRule = (value: unknown): value is MatchedStyleRule =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.selector) &&
  Array.isArray(value.specificity) &&
  value.specificity.length === 3 &&
  value.specificity.every(isNumber) &&
  (value.origin === "inspector" || value.origin === "inline" || value.origin === "author") &&
  isRecord(value.source) &&
  isString(value.source.label) &&
  (value.source.url === null || isString(value.source.url)) &&
  Array.isArray(value.declarations) &&
  value.declarations.every(isMatchedStyleDeclaration) &&
  typeof value.active === "boolean" &&
  (value.conditional === null || isString(value.conditional)) &&
  (value.inheritedFrom === null ||
    (isRecord(value.inheritedFrom) &&
      isString(value.inheritedFrom.selector) &&
      isString(value.inheritedFrom.tagName)));

const isMatchedStylesResult = (value: unknown): value is MatchedStylesResult =>
  isRecord(value) &&
  isString(value.selector) &&
  Array.isArray(value.rules) &&
  value.rules.every(isMatchedStyleRule) &&
  isStringRecord(value.computed) &&
  isStringRecord(value.variables) &&
  isNumber(value.unreadableStylesheets);

const isA11yIssue = (value: unknown): value is A11yIssue =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.selector) &&
  (value.severity === "info" || value.severity === "warning" || value.severity === "error") &&
  isString(value.title) &&
  isString(value.message);

const isAlignEdge = (value: unknown): value is AlignEdge =>
  isString(value) && (ALIGN_EDGES as readonly string[]).includes(value);

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
      Array.isArray(value.payload.assets) &&
      (value.payload.tokens === undefined || Array.isArray(value.payload.tokens))
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

  if (messageType === "DOM_CONTEXT_RESULT") {
    return (
      isRecord(value.payload) &&
      Array.isArray(value.payload.ancestry) &&
      value.payload.ancestry.every(isDomTreeNode) &&
      Array.isArray(value.payload.children) &&
      value.payload.children.every(isDomTreeNode) &&
      isDomChildrenRecord(value.payload.childrenBySelector) &&
      (value.payload.selectedSelector === null || isString(value.payload.selectedSelector))
    );
  }

  if (messageType === "DOM_CHILDREN_RESULT") {
    return (
      isRecord(value.payload) &&
      isString(value.payload.selector) &&
      Array.isArray(value.payload.children) &&
      value.payload.children.every(isDomTreeNode)
    );
  }

  if (messageType === "PIN_ELEMENT_CARD") {
    return (
      isRecord(value.payload) &&
      isElementSnapshot(value.payload.snapshot) &&
      isPinCardKind(value.payload.kind)
    );
  }

  if (messageType === "SEARCH_ELEMENTS") {
    return isRecord(value.payload) && isString(value.payload.query);
  }

  if (messageType === "SELECT_SEARCH_RESULT") {
    return isRecord(value.payload) && isString(value.payload.selector);
  }

  if (messageType === "DOM_CHILDREN_REQUEST") {
    return (
      isRecord(value.payload) &&
      isString(value.payload.selector) &&
      (value.payload.includeAll === undefined || typeof value.payload.includeAll === "boolean")
    );
  }

  if (messageType === "HIGHLIGHT_DOM_NODE") {
    return (
      isRecord(value.payload) &&
      (value.payload.selector === null || isString(value.payload.selector))
    );
  }

  if (messageType === "UPDATE_ELEMENT_ATTRIBUTE") {
    return (
      isRecord(value.payload) &&
      isString(value.payload.selector) &&
      isString(value.payload.name) &&
      (value.payload.value === null || isString(value.payload.value))
    );
  }

  if (messageType === "MOVE_SELECTED_ELEMENT") {
    return isRecord(value.payload) && isDomMoveDirection(value.payload.direction);
  }

  if (messageType === "NUDGE_SELECTED_ELEMENT") {
    return (
      isRecord(value.payload) && isNumber(value.payload.deltaX) && isNumber(value.payload.deltaY)
    );
  }

  if (messageType === "MUTATE_MATCHED_STYLE_DECLARATION") {
    return (
      isRecord(value.payload) &&
      isString(value.payload.ruleId) &&
      (value.payload.inheritedSelector === null || isString(value.payload.inheritedSelector)) &&
      isCssPropertyName(value.payload.property) &&
      (value.payload.nextProperty === null || isCssPropertyName(value.payload.nextProperty))
    );
  }

  if (messageType === "REPLACE_SELECTED_IMAGE") {
    return isRecord(value.payload) && isString(value.payload.src);
  }

  if (messageType === "COPY_ELEMENT_CSS") {
    return isRecord(value.payload) && typeof value.payload.includeChildren === "boolean";
  }

  if (messageType === "MATCHED_STYLES_RESULT") {
    return isMatchedStylesResult(value.payload);
  }

  if (messageType === "ELEMENT_CSS_RESULT") {
    return (
      isRecord(value.payload) &&
      isString(value.payload.css) &&
      (value.payload.html === null || isString(value.payload.html)) &&
      (value.payload.source === "authored" || value.payload.source === "computed")
    );
  }

  if (messageType === "A11Y_SCAN_RESULT") {
    return (
      isRecord(value.payload) &&
      Array.isArray(value.payload.issues) &&
      value.payload.issues.every(isA11yIssue)
    );
  }

  if (messageType === "FETCH_ASSET") {
    return isRecord(value.payload) && isString(value.payload.src);
  }

  if (messageType === "ASSET_FETCHED") {
    return (
      isRecord(value.payload) &&
      isString(value.payload.src) &&
      (value.payload.dataUrl === null || isString(value.payload.dataUrl)) &&
      (value.payload.error === undefined || isString(value.payload.error))
    );
  }

  if (messageType === "ALIGN_SELECTED") {
    return isRecord(value.payload) && isAlignEdge(value.payload.alignment);
  }

  if (messageType === "SESSION_SYNC") {
    const payload = value.payload;
    return (
      isRecord(payload) &&
      Array.isArray(payload.styleChanges) &&
      payload.styleChanges.every(isStyleChange) &&
      Array.isArray(payload.rawCss) &&
      payload.rawCss.every(
        (entry) => isRecord(entry) && isString(entry.selector) && isString(entry.css),
      ) &&
      Array.isArray(payload.structuralEdits) &&
      payload.structuralEdits.every(isStructuralEdit) &&
      isNumber(payload.undoDepth) &&
      isNumber(payload.redoDepth)
    );
  }

  if (messageType === "MULTI_SELECTION_CHANGED") {
    return (
      isRecord(value.payload) &&
      isNumber(value.payload.count) &&
      isStringArray(value.payload.selectors)
    );
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

  if (messageType === "SET_CAPTURE_MODE") {
    return isRecord(value.payload) && typeof value.payload.active === "boolean";
  }

  if (messageType === "APPLY_RAW_CSS") {
    return (
      isRecord(value.payload) &&
      isString(value.payload.selector) &&
      isString(value.payload.css) &&
      (value.payload.coalesce === undefined || typeof value.payload.coalesce === "boolean")
    );
  }

  if (messageType === "EDITS_RESTORED") {
    return isRecord(value.payload) && isNumber(value.payload.count);
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
