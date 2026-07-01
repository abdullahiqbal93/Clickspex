import { createStyleChange, getAccessibilityNotes } from "@ui-devtools/core";
import { create } from "zustand";

import type {
  AccessibilityNote,
  ElementSnapshot,
  StyleChange,
  SupportedStyleProperty,
} from "@ui-devtools/shared";

export type PanelTab = "inspect" | "styles" | "box" | "measure" | "accessibility" | "export";

export type PanelState = {
  accessibilityNotes: AccessibilityNote[];
  activeTab: PanelTab;
  changes: StyleChange[];
  error: string | null;
  hoveredSelector: string | null;
  measurementTarget: ElementSnapshot | null;
  pickerActive: boolean;
  redoStack: StyleChange[];
  selectedElement: ElementSnapshot | null;
  applyLocalStyleChange: (change: StyleChange) => void;
  prepareRedoChange: () => StyleChange | null;
  prepareStyleChange: (property: SupportedStyleProperty, afterValue: string) => StyleChange | null;
  prepareUndoChange: () => StyleChange | null;
  redoLocalChange: () => void;
  resetElementChanges: () => void;
  setActiveTab: (tab: PanelTab) => void;
  setError: (error: string | null) => void;
  setHoveredSelector: (selector: string | null) => void;
  setMeasurementTarget: (snapshot: ElementSnapshot | null) => void;
  setPickerActive: (active: boolean) => void;
  setSelectedElement: (snapshot: ElementSnapshot | null) => void;
  undoLocalChange: () => void;
};

export const getCurrentStyleRecord = (state: Pick<PanelState, "changes" | "selectedElement">) => {
  if (state.selectedElement === null) {
    return {};
  }

  const styles: Record<string, string> = { ...state.selectedElement.computedStyles };

  for (const change of state.changes) {
    if (change.selector === state.selectedElement.selector) {
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
  hoveredSelector: null,
  measurementTarget: null,
  pickerActive: false,
  redoStack: [],
  selectedElement: null,
  applyLocalStyleChange: (change) =>
    set((state) => ({
      changes: [...state.changes, change],
      redoStack: [],
    })),
  prepareRedoChange: () => {
    const [change] = get().redoStack.slice(-1);

    if (change === undefined) {
      return null;
    }

    return createStyleChange(
      change.selector,
      change.property,
      change.beforeValue,
      change.afterValue,
    );
  },
  prepareStyleChange: (property, afterValue) => {
    const state = get();

    if (state.selectedElement === null) {
      return null;
    }

    const currentStyles = getCurrentStyleRecord(state);
    const beforeValue = currentStyles[property] ?? "";

    if (beforeValue === afterValue) {
      return null;
    }

    return createStyleChange(state.selectedElement.selector, property, beforeValue, afterValue);
  },
  prepareUndoChange: () => {
    const [change] = get().changes.slice(-1);

    if (change === undefined) {
      return null;
    }

    return createStyleChange(
      change.selector,
      change.property,
      change.afterValue,
      change.beforeValue,
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
  setHoveredSelector: (hoveredSelector) => set({ hoveredSelector }),
  setMeasurementTarget: (measurementTarget) => set({ measurementTarget }),
  setPickerActive: (pickerActive) => set({ pickerActive }),
  setSelectedElement: (selectedElement) =>
    set({
      accessibilityNotes: selectedElement === null ? [] : getAccessibilityNotes(selectedElement),
      changes: [],
      measurementTarget: null,
      redoStack: [],
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
