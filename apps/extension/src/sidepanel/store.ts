import { createStyleChange } from "@ui-devtools/core";
import { create } from "zustand";

import type { ElementSnapshot, StyleChange, SupportedStyleProperty } from "@ui-devtools/shared";

export type PanelTab = "inspect" | "styles" | "box" | "measure" | "accessibility" | "export";

export type PanelState = {
  activeTab: PanelTab;
  changes: StyleChange[];
  error: string | null;
  hoveredSelector: string | null;
  pickerActive: boolean;
  selectedElement: ElementSnapshot | null;
  applyLocalStyleChange: (change: StyleChange) => void;
  prepareStyleChange: (property: SupportedStyleProperty, afterValue: string) => StyleChange | null;
  resetElementChanges: () => void;
  setActiveTab: (tab: PanelTab) => void;
  setError: (error: string | null) => void;
  setHoveredSelector: (selector: string | null) => void;
  setPickerActive: (active: boolean) => void;
  setSelectedElement: (snapshot: ElementSnapshot | null) => void;
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
  activeTab: "inspect",
  changes: [],
  error: null,
  hoveredSelector: null,
  pickerActive: false,
  selectedElement: null,
  applyLocalStyleChange: (change) =>
    set((state) => ({
      changes: [...state.changes, change],
    })),
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
  resetElementChanges: () => set({ changes: [] }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setError: (error) => set({ error }),
  setHoveredSelector: (hoveredSelector) => set({ hoveredSelector }),
  setPickerActive: (pickerActive) => set({ pickerActive }),
  setSelectedElement: (selectedElement) => set({ changes: [], selectedElement }),
}));
