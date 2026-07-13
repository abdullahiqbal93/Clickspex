import { canCoalesceStyleChange, createStyleChange, getAccessibilityNotes } from "@ui-buddy/core";
import { create } from "zustand";

import type {
  A11yIssue,
  AccessibilityNote,
  DomContextPayload,
  DomTreeNode,
  ElementSearchResult,
  ElementSnapshot,
  MatchedStylesResult,
  PageScanResult,
  PageTechInfo,
  StructuralEdit,
  StyleChange,
  StyleResponsiveTarget,
  StyleTargetState,
} from "@ui-buddy/shared";

export type RawCssEntry = { selector: string; css: string };

export type SessionSyncPayload = {
  styleChanges: StyleChange[];
  rawCss: RawCssEntry[];
  structuralEdits: StructuralEdit[];
  undoDepth: number;
  redoDepth: number;
};

export type ElementCssResult = {
  css: string;
  html: string | null;
  source: "authored" | "computed";
};

export type AssetFetchResult = {
  src: string;
  dataUrl: string | null;
  error?: string;
};

export type MultiSelectionState = {
  count: number;
  selectors: string[];
};

export type PanelTab =
  | "elements"
  | "inspect"
  | "styles"
  | "box"
  | "measure"
  | "motion"
  | "palette"
  | "typography"
  | "assets"
  | "accessibility"
  | "export";

export type PanelState = {
  a11yIssues: A11yIssue[] | null;
  a11yScanLoading: boolean;
  accessibilityNotes: AccessibilityNote[];
  activeTab: PanelTab;
  assetFetch: AssetFetchResult | null;
  changes: StyleChange[];
  domChildrenBySelector: Record<string, DomTreeNode[]>;
  domContext: DomContextPayload | null;
  elementCssResult: ElementCssResult | null;
  matchedStyles: MatchedStylesResult | null;
  error: string | null;
  gridActive: boolean;
  hoveredSelector: string | null;
  measurementTarget: ElementSnapshot | null;
  multiSelection: MultiSelectionState;
  pageScan: PageScanResult | null;
  pageScanLoading: boolean;
  historyRedoDepth: number;
  historyUndoDepth: number;
  pickerActive: boolean;
  rulerActive: boolean;
  rawCssEntries: RawCssEntry[];
  structuralEdits: StructuralEdit[];
  /** Number of edits re-applied from a prior session after a page reload. */
  restoredEditsCount: number;
  /** Baseline (pre-edit) snapshot of every element selected this session. */
  snapshotBySelector: Record<string, ElementSnapshot>;
  searchResults: ElementSearchResult[];
  selectedElement: ElementSnapshot | null;
  tech: PageTechInfo[] | null;
  applyLocalStyleChange: (change: StyleChange) => void;
  applySessionSync: (payload: SessionSyncPayload) => void;
  setA11yIssues: (issues: A11yIssue[] | null) => void;
  setA11yScanLoading: (loading: boolean) => void;
  setAssetFetch: (result: AssetFetchResult | null) => void;
  setDomChildren: (selector: string, children: DomTreeNode[]) => void;
  setDomContext: (context: DomContextPayload | null) => void;
  setElementCssResult: (result: ElementCssResult | null) => void;
  setMatchedStyles: (result: MatchedStylesResult | null) => void;
  setMultiSelection: (state: MultiSelectionState) => void;
  setTech: (tech: PageTechInfo[] | null) => void;
  prepareStyleChange: (
    property: string,
    afterValue: string,
    state?: StyleTargetState,
    responsiveTarget?: StyleResponsiveTarget,
  ) => StyleChange | null;
  resetElementChanges: () => void;
  resetForNavigation: () => void;
  setActiveTab: (tab: PanelTab) => void;
  setError: (error: string | null) => void;
  setGridActive: (active: boolean) => void;
  setHoveredSelector: (selector: string | null) => void;
  setMeasurementTarget: (snapshot: ElementSnapshot | null) => void;
  setPageScan: (result: PageScanResult | null) => void;
  setPageScanLoading: (loading: boolean) => void;
  setPickerActive: (active: boolean) => void;
  setRulerActive: (active: boolean) => void;
  setSearchResults: (results: ElementSearchResult[]) => void;
  setSelectedElement: (snapshot: ElementSnapshot | null) => void;
  setRestoredEditsCount: (count: number) => void;
};

const applyStyleLayerChange = (
  styles: Record<string, string>,
  change: StyleChange,
  fallback?: Record<string, string>,
): void => {
  if (change.afterValue.trim().length === 0) {
    const fallbackValue = fallback?.[change.property];

    if (fallbackValue === undefined) {
      delete styles[change.property];
    } else {
      styles[change.property] = fallbackValue;
    }
    return;
  }

  styles[change.property] = change.afterValue;
};

export const getCurrentStyleRecord = (
  state: Pick<PanelState, "changes" | "selectedElement">,
  targetState: StyleTargetState = "base",
  targetResponsiveTarget: StyleResponsiveTarget = "all",
) => {
  if (state.selectedElement === null) {
    return {};
  }

  const baseStyles: Record<string, string> =
    targetState === "base" ? { ...state.selectedElement.computedStyles } : {};
  const responsiveOverrides: Record<string, string> = {};

  for (const change of state.changes) {
    if (
      change.selector !== state.selectedElement.selector ||
      (change.state ?? "base") !== targetState
    ) {
      continue;
    }

    const changeResponsiveTarget = change.responsiveTarget ?? "all";

    if (changeResponsiveTarget === "all") {
      applyStyleLayerChange(
        baseStyles,
        change,
        targetState === "base" ? state.selectedElement.computedStyles : undefined,
      );
      continue;
    }

    if (changeResponsiveTarget === targetResponsiveTarget) {
      applyStyleLayerChange(responsiveOverrides, change);
    }
  }

  return targetResponsiveTarget === "all" ? baseStyles : { ...baseStyles, ...responsiveOverrides };
};

export const usePanelStore = create<PanelState>((set, get) => ({
  a11yIssues: null,
  a11yScanLoading: false,
  accessibilityNotes: [],
  activeTab: "elements",
  assetFetch: null,
  changes: [],
  domChildrenBySelector: {},
  domContext: null,
  elementCssResult: null,
  matchedStyles: null,
  error: null,
  gridActive: false,
  hoveredSelector: null,
  measurementTarget: null,
  multiSelection: { count: 0, selectors: [] },
  pageScan: null,
  pageScanLoading: false,
  historyRedoDepth: 0,
  historyUndoDepth: 0,
  pickerActive: false,
  rulerActive: false,
  rawCssEntries: [],
  structuralEdits: [],
  restoredEditsCount: 0,
  snapshotBySelector: {},
  searchResults: [],
  selectedElement: null,
  tech: null,
  setA11yIssues: (a11yIssues) => set({ a11yIssues, a11yScanLoading: false }),
  setA11yScanLoading: (a11yScanLoading) => set({ a11yScanLoading }),
  setAssetFetch: (assetFetch) => set({ assetFetch }),
  setDomChildren: (selector, children) =>
    set((state) => ({
      domChildrenBySelector: { ...state.domChildrenBySelector, [selector]: children },
    })),
  setDomContext: (domContext) =>
    set((state) => {
      // Busy applications can mutate their DOM many times per second. Avoid
      // repainting the entire tree when the bounded inspector snapshot did not
      // actually change.
      if (
        state.domContext !== null &&
        domContext !== null &&
        JSON.stringify(state.domContext) === JSON.stringify(domContext)
      ) {
        return state;
      }

      return {
        domContext,
        domChildrenBySelector: domContext?.childrenBySelector ?? {},
      };
    }),
  setElementCssResult: (elementCssResult) => set({ elementCssResult }),
  setMatchedStyles: (matchedStyles) => set({ matchedStyles }),
  setMultiSelection: (multiSelection) => set({ multiSelection }),
  setTech: (tech) => set({ tech }),
  applyLocalStyleChange: (change) =>
    set((state) => {
      const last = state.changes[state.changes.length - 1];

      // Mirror the injector: collapse a continuous drag into one entry so the
      // change count and undo depth stay accurate before SESSION_SYNC arrives.
      if (last !== undefined && canCoalesceStyleChange(last, change)) {
        const changes = state.changes.slice(0, -1);
        changes.push({ ...last, afterValue: change.afterValue, timestamp: change.timestamp });
        return { changes, historyRedoDepth: 0 };
      }

      return {
        changes: [...state.changes, change],
        historyUndoDepth: state.historyUndoDepth + 1,
        historyRedoDepth: 0,
      };
    }),
  applySessionSync: (payload) =>
    set({
      changes: payload.styleChanges,
      rawCssEntries: payload.rawCss,
      structuralEdits: payload.structuralEdits,
      historyUndoDepth: payload.undoDepth,
      historyRedoDepth: payload.redoDepth,
    }),
  prepareStyleChange: (property, afterValue, targetState = "base", responsiveTarget = "all") => {
    const state = get();

    if (state.selectedElement === null) {
      return null;
    }

    const currentStyles = getCurrentStyleRecord(state, targetState, responsiveTarget);
    const beforeValue = currentStyles[property] ?? "";

    if (beforeValue === afterValue) {
      return null;
    }

    return createStyleChange(
      state.selectedElement.selector,
      property,
      beforeValue,
      afterValue,
      undefined,
      targetState,
      responsiveTarget,
    );
  },
  resetElementChanges: () => set({ changes: [], rawCssEntries: [] }),
  // Wipe everything tied to a specific page. Called when the inspected tab
  // reloads or navigates so the panel doesn't show stale selections/edits from
  // a page whose content script (and applied styles) no longer exist.
  resetForNavigation: () =>
    set({
      a11yIssues: null,
      a11yScanLoading: false,
      accessibilityNotes: [],
      assetFetch: null,
      changes: [],
      domChildrenBySelector: {},
      domContext: null,
      elementCssResult: null,
      matchedStyles: null,
      error: null,
      gridActive: false,
      historyRedoDepth: 0,
      historyUndoDepth: 0,
      hoveredSelector: null,
      measurementTarget: null,
      multiSelection: { count: 0, selectors: [] },
      pickerActive: false,
      rulerActive: false,
      rawCssEntries: [],
      structuralEdits: [],
      restoredEditsCount: 0,
      snapshotBySelector: {},
      searchResults: [],
      selectedElement: null,
      tech: null,
    }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setError: (error) => set({ error }),
  setGridActive: (gridActive) => set({ gridActive }),
  setHoveredSelector: (hoveredSelector) => set({ hoveredSelector }),
  setMeasurementTarget: (measurementTarget) => set({ measurementTarget }),
  setPageScan: (pageScan) => set({ pageScan, pageScanLoading: false }),
  setPageScanLoading: (pageScanLoading) => set({ pageScanLoading }),
  setPickerActive: (pickerActive) =>
    set({ pickerActive, rulerActive: pickerActive ? false : get().rulerActive }),
  setRulerActive: (rulerActive) =>
    set({ rulerActive, pickerActive: rulerActive ? false : get().pickerActive }),
  setSearchResults: (searchResults) => set({ searchResults }),
  setRestoredEditsCount: (restoredEditsCount) => set({ restoredEditsCount }),
  setSelectedElement: (selectedElement) =>
    set((state) => {
      // Cache the first (pre-edit) snapshot per selector so the exported session
      // can reconstruct accurate before/after styles for every edited element,
      // not just the one currently selected.
      const snapshotBySelector =
        selectedElement !== null && state.snapshotBySelector[selectedElement.selector] === undefined
          ? { ...state.snapshotBySelector, [selectedElement.selector]: selectedElement }
          : state.snapshotBySelector;

      return {
        accessibilityNotes: selectedElement === null ? [] : getAccessibilityNotes(selectedElement),
        elementCssResult: null,
        matchedStyles:
          selectedElement !== null && state.selectedElement?.domPath === selectedElement.domPath
            ? state.matchedStyles
            : null,
        measurementTarget: null,
        selectedElement,
        snapshotBySelector,
      };
    }),
}));
