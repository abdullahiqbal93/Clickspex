import { createStyleChange, getAccessibilityNotes } from "@ui-buddy/core";
import { create } from "zustand";

import type {
  A11yIssue,
  AccessibilityNote,
  ElementSearchResult,
  ElementSnapshot,
  PageScanResult,
  PageTechInfo,
  StyleChange,
  StyleResponsiveTarget,
  StyleTargetState,
  SupportedStyleProperty,
} from "@ui-buddy/shared";

export type ElementCssResult = {
  css: string;
  html: string | null;
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
  elementCssResult: ElementCssResult | null;
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
  searchResults: ElementSearchResult[];
  selectedElement: ElementSnapshot | null;
  tech: PageTechInfo[] | null;
  applyLocalStyleChange: (change: StyleChange) => void;
  applyHistorySync: (changes: StyleChange[], undoDepth: number, redoDepth: number) => void;
  setA11yIssues: (issues: A11yIssue[] | null) => void;
  setA11yScanLoading: (loading: boolean) => void;
  setAssetFetch: (result: AssetFetchResult | null) => void;
  setElementCssResult: (result: ElementCssResult | null) => void;
  setMultiSelection: (state: MultiSelectionState) => void;
  setTech: (tech: PageTechInfo[] | null) => void;
  prepareStyleChange: (
    property: SupportedStyleProperty,
    afterValue: string,
    state?: StyleTargetState,
    responsiveTarget?: StyleResponsiveTarget,
  ) => StyleChange | null;
  resetElementChanges: () => void;
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
  activeTab: "inspect",
  assetFetch: null,
  changes: [],
  elementCssResult: null,
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
  searchResults: [],
  selectedElement: null,
  tech: null,
  setA11yIssues: (a11yIssues) => set({ a11yIssues, a11yScanLoading: false }),
  setA11yScanLoading: (a11yScanLoading) => set({ a11yScanLoading }),
  setAssetFetch: (assetFetch) => set({ assetFetch }),
  setElementCssResult: (elementCssResult) => set({ elementCssResult }),
  setMultiSelection: (multiSelection) => set({ multiSelection }),
  setTech: (tech) => set({ tech }),
  applyLocalStyleChange: (change) =>
    set((state) => ({
      changes: [...state.changes, change],
      historyUndoDepth: state.historyUndoDepth + 1,
      historyRedoDepth: 0,
    })),
  applyHistorySync: (changes, undoDepth, redoDepth) =>
    set({ changes, historyUndoDepth: undoDepth, historyRedoDepth: redoDepth }),
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
  resetElementChanges: () => set({ changes: [] }),
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
  setSelectedElement: (selectedElement) =>
    set({
      accessibilityNotes: selectedElement === null ? [] : getAccessibilityNotes(selectedElement),
      elementCssResult: null,
      measurementTarget: null,
      selectedElement,
    }),
}));
