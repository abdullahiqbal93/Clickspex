import { createStyleChange, getAccessibilityNotes } from "@ui-buddy/core";
import { create } from "zustand";

import type {
  AccessibilityNote,
  ElementSearchResult,
  ElementSnapshot,
  PageScanResult,
  StyleChange,
  StyleTargetState,
  SupportedStyleProperty,
} from "@ui-buddy/shared";

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
  accessibilityNotes: AccessibilityNote[];
  activeTab: PanelTab;
  changes: StyleChange[];
  error: string | null;
  gridActive: boolean;
  hoveredSelector: string | null;
  measurementTarget: ElementSnapshot | null;
  pageScan: PageScanResult | null;
  pageScanLoading: boolean;
  pickerActive: boolean;
  rulerActive: boolean;
  redoStack: StyleChange[];
  searchResults: ElementSearchResult[];
  selectedElement: ElementSnapshot | null;
  applyLocalStyleChange: (change: StyleChange) => void;
  prepareStyleChange: (
    property: SupportedStyleProperty,
    afterValue: string,
    state?: StyleTargetState,
  ) => StyleChange | null;
  redoLocalChange: () => void;
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
  undoLocalChange: () => void;
};

export const getCurrentStyleRecord = (
  state: Pick<PanelState, "changes" | "selectedElement">,
  targetState: StyleTargetState = "base",
) => {
  if (state.selectedElement === null) {
    return {};
  }

  const styles: Record<string, string> =
    targetState === "base" ? { ...state.selectedElement.computedStyles } : {};

  for (const change of state.changes) {
    if (
      change.selector === state.selectedElement.selector &&
      (change.state ?? "base") === targetState
    ) {
      styles[change.property] = change.afterValue;
    }
  }

  return styles;
};

export const usePanelStore = create<PanelState>((set, get) => ({
  accessibilityNotes: [],
  activeTab: "inspect",
  changes: [],
  error: null,
  gridActive: false,
  hoveredSelector: null,
  measurementTarget: null,
  pageScan: null,
  pageScanLoading: false,
  pickerActive: false,
  rulerActive: false,
  redoStack: [],
  searchResults: [],
  selectedElement: null,
  applyLocalStyleChange: (change) =>
    set((state) => ({
      changes: [...state.changes, change],
      redoStack: [],
    })),
  prepareStyleChange: (property, afterValue, targetState = "base") => {
    const state = get();

    if (state.selectedElement === null) {
      return null;
    }

    const currentStyles = getCurrentStyleRecord(state, targetState);
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
    );
  },
  redoLocalChange: () =>
    set((state) => {
      const redoStack = state.redoStack.slice(0, -1);
      const change = state.redoStack.at(-1);

      if (change === undefined) {
        return state;
      }

      return {
        changes: [...state.changes, change],
        redoStack,
      };
    }),
  resetElementChanges: () => set({ changes: [], redoStack: [] }),
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
      measurementTarget: null,
      selectedElement,
    }),
  undoLocalChange: () =>
    set((state) => {
      const changes = state.changes.slice(0, -1);
      const change = state.changes.at(-1);

      if (change === undefined) {
        return state;
      }

      return {
        changes,
        redoStack: [...state.redoStack, change],
      };
    }),
}));
