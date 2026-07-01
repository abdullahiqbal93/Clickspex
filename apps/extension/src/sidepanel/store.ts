import { create } from "zustand";

import type { ElementSnapshot } from "@ui-devtools/shared";

export type PanelTab = "inspect" | "styles" | "box" | "measure" | "accessibility" | "export";

export type PanelState = {
  activeTab: PanelTab;
  error: string | null;
  hoveredSelector: string | null;
  pickerActive: boolean;
  selectedElement: ElementSnapshot | null;
  setActiveTab: (tab: PanelTab) => void;
  setError: (error: string | null) => void;
  setHoveredSelector: (selector: string | null) => void;
  setPickerActive: (active: boolean) => void;
  setSelectedElement: (snapshot: ElementSnapshot | null) => void;
};

export const usePanelStore = create<PanelState>((set) => ({
  activeTab: "inspect",
  error: null,
  hoveredSelector: null,
  pickerActive: false,
  selectedElement: null,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setError: (error) => set({ error }),
  setHoveredSelector: (hoveredSelector) => set({ hoveredSelector }),
  setPickerActive: (pickerActive) => set({ pickerActive }),
  setSelectedElement: (selectedElement) => set({ selectedElement }),
}));
