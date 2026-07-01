import { isExtensionMessage } from "@ui-devtools/shared";
import {
  Accessibility,
  Box,
  Code2,
  Crosshair,
  Paintbrush,
  Ruler,
  SquareMousePointer,
} from "lucide-react";
import { useEffect } from "react";

import { connectSidePanelPort, sendMessageToActiveTab } from "../chrome/messaging";

import { BoxModelPanel } from "./components/BoxModelPanel";
import { InspectorPanel } from "./components/InspectorPanel";
import { MeasurePanel } from "./components/MeasurePanel";
import { StylePanel } from "./components/StylePanel";
import { type PanelTab, usePanelStore } from "./store";

const tabs = [
  { id: "inspect", label: "Inspect", icon: Crosshair },
  { id: "styles", label: "Styles", icon: Paintbrush },
  { id: "box", label: "Box", icon: Box },
  { id: "measure", label: "Measure", icon: Ruler },
  { id: "accessibility", label: "A11y", icon: Accessibility },
  { id: "export", label: "Export", icon: Code2 },
] as const satisfies ReadonlyArray<{ id: PanelTab; label: string; icon: typeof Crosshair }>;

const placeholderLabels: Record<
  Exclude<PanelTab, "inspect" | "styles" | "box" | "measure">,
  string
> = {
  accessibility: "Accessibility",
  export: "Export",
};

export const App = () => {
  const activeTab = usePanelStore((state) => state.activeTab);
  const error = usePanelStore((state) => state.error);
  const hoveredSelector = usePanelStore((state) => state.hoveredSelector);
  const pickerActive = usePanelStore((state) => state.pickerActive);
  const selectedElement = usePanelStore((state) => state.selectedElement);
  const setActiveTab = usePanelStore((state) => state.setActiveTab);
  const setError = usePanelStore((state) => state.setError);
  const setHoveredSelector = usePanelStore((state) => state.setHoveredSelector);
  const setPickerActive = usePanelStore((state) => state.setPickerActive);
  const setMeasurementTarget = usePanelStore((state) => state.setMeasurementTarget);
  const setSelectedElement = usePanelStore((state) => state.setSelectedElement);

  useEffect(() => {
    const port = connectSidePanelPort();

    const handleMessage = (rawMessage: unknown) => {
      if (!isExtensionMessage(rawMessage)) {
        return;
      }

      if (rawMessage.type === "ELEMENT_SELECTED") {
        setSelectedElement(rawMessage.payload);
        setPickerActive(false);
        setHoveredSelector(null);
        setActiveTab("inspect");
      }

      if (rawMessage.type === "ELEMENT_HOVERED") {
        setHoveredSelector(rawMessage.payload.selector);
      }

      if (rawMessage.type === "PICKER_DISABLE") {
        setPickerActive(false);
      }

      if (rawMessage.type === "MEASURE_TARGET_SELECTED") {
        setMeasurementTarget(rawMessage.payload);
        setPickerActive(false);
        setActiveTab("measure");
      }
    };

    port.onMessage.addListener(handleMessage);
    return () => {
      port.onMessage.removeListener(handleMessage);
      port.disconnect();
    };
  }, [setActiveTab, setHoveredSelector, setMeasurementTarget, setPickerActive, setSelectedElement]);

  const togglePicker = async () => {
    setError(null);
    const nextActive = !pickerActive;

    try {
      await sendMessageToActiveTab({ type: nextActive ? "PICKER_ENABLE" : "PICKER_DISABLE" });
      setPickerActive(nextActive);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to reach the active tab.",
      );
      setPickerActive(false);
    }
  };

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-slate-200 bg-panel px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold">UI DevTools</h1>
            <p className="truncate text-xs text-muted">
              {selectedElement?.selector ?? hoveredSelector ?? "No element selected"}
            </p>
          </div>
          <button
            className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md bg-accent px-3 text-xs font-medium text-white shadow-sm transition hover:bg-blue-700"
            onClick={togglePicker}
            type="button"
          >
            <SquareMousePointer aria-hidden="true" size={15} />
            {pickerActive ? "Stop" : "Pick"}
          </button>
        </div>
      </header>

      <nav
        className="grid grid-cols-6 border-b border-slate-200 bg-panel"
        aria-label="Panel sections"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;

          return (
            <button
              aria-current={selected ? "page" : undefined}
              className={`flex h-12 flex-col items-center justify-center gap-1 text-[10px] font-medium transition ${
                selected
                  ? "bg-blue-50 text-accent"
                  : "text-slate-600 hover:bg-slate-50 hover:text-ink"
              }`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              <Icon aria-hidden="true" size={15} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <section className="space-y-3 p-4">
        {error !== null ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
            {error}
          </div>
        ) : null}

        {activeTab === "inspect" ? (
          <InspectorPanel selectedElement={selectedElement} />
        ) : activeTab === "styles" ? (
          <StylePanel />
        ) : activeTab === "box" ? (
          <BoxModelPanel />
        ) : activeTab === "measure" ? (
          <MeasurePanel />
        ) : (
          <div className="rounded-lg border border-slate-200 bg-panel p-4 shadow-panel">
            <h2 className="text-sm font-semibold">{placeholderLabels[activeTab]}</h2>
            <p className="mt-2 break-all text-xs text-muted">
              {selectedElement?.selector ?? hoveredSelector ?? "Idle"}
            </p>
          </div>
        )}
      </section>
    </main>
  );
};
