import { isExtensionMessage } from "@ui-devtools/shared";
import {
  Accessibility,
  Box,
  Check,
  Code2,
  Crosshair,
  Grid3X3,
  Image,
  Paintbrush,
  Palette,
  Pipette,
  PlaySquare,
  RefreshCcw,
  Ruler,
  SquareMousePointer,
  Type,
} from "lucide-react";
import { useEffect, useState } from "react";

import { connectSidePanelPort, sendMessageToActiveTab } from "../chrome/messaging";

import { AccessibilityPanel } from "./components/AccessibilityPanel";
import { AssetsPanel } from "./components/AssetsPanel";
import { BoxModelPanel } from "./components/BoxModelPanel";
import { ExportPanel } from "./components/ExportPanel";
import { InspectorPanel } from "./components/InspectorPanel";
import { MeasurePanel } from "./components/MeasurePanel";
import { MotionPanel } from "./components/MotionPanel";
import { PalettePanel } from "./components/PalettePanel";
import { StylePanel } from "./components/StylePanel";
import { TypographyPanel } from "./components/TypographyPanel";
import { type PanelTab, usePanelStore } from "./store";

export type PanelTab = "inspect" | "styles" | "box" | "measure" | "motion" | "accessibility" | "export" | "palette" | "typography" | "assets";

const tabs = [
  { id: "inspect", label: "Inspect", icon: Crosshair },
  { id: "styles", label: "Styles", icon: Paintbrush },
  { id: "box", label: "Box", icon: Box },
  { id: "measure", label: "Measure", icon: Ruler },
  { id: "motion", label: "Motion", icon: PlaySquare },
  { id: "palette", label: "Palette", icon: Palette },
  { id: "typography", label: "Type", icon: Type },
  { id: "assets", label: "Assets", icon: Image },
  { id: "accessibility", label: "A11y", icon: Accessibility },
  { id: "export", label: "Export", icon: Code2 },
] as const satisfies ReadonlyArray<{ id: PanelTab; label: string; icon: typeof Crosshair }>;

export const App = () => {
  const activeTab = usePanelStore((state) => state.activeTab);
  const error = usePanelStore((state) => state.error);
  const gridActive = usePanelStore((state) => state.gridActive);
  const hoveredSelector = usePanelStore((state) => state.hoveredSelector);
  const pickerActive = usePanelStore((state) => state.pickerActive);
  const rulerActive = usePanelStore((state) => state.rulerActive);
  const selectedElement = usePanelStore((state) => state.selectedElement);
  const setActiveTab = usePanelStore((state) => state.setActiveTab);
  const setError = usePanelStore((state) => state.setError);
  const setGridActive = usePanelStore((state) => state.setGridActive);
  const setHoveredSelector = usePanelStore((state) => state.setHoveredSelector);
  const setPageScan = usePanelStore((state) => state.setPageScan);
  const setPageScanLoading = usePanelStore((state) => state.setPageScanLoading);
  const setPickerActive = usePanelStore((state) => state.setPickerActive);
  const setRulerActive = usePanelStore((state) => state.setRulerActive);
  const setMeasurementTarget = usePanelStore((state) => state.setMeasurementTarget);
  const setSelectedElement = usePanelStore((state) => state.setSelectedElement);
  const undoLocalChange = usePanelStore((state) => state.undoLocalChange);
  const redoLocalChange = usePanelStore((state) => state.redoLocalChange);

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

      if (rawMessage.type === "ELEMENT_UNSELECTED") {
        setSelectedElement(null);
      }

      if (rawMessage.type === "PICKER_DISABLE") {
        setPickerActive(false);
      }

      if (rawMessage.type === "MEASURE_TARGET_SELECTED") {
        setMeasurementTarget(rawMessage.payload);
        setPickerActive(false);
        setActiveTab("measure");
      }

      if (rawMessage.type === "RULER_DISABLE") {
        setRulerActive(false);
      }

      if (rawMessage.type === "PAGE_SCAN_RESULT") {
        setPageScan(rawMessage.payload);
      }
    };

    port.onMessage.addListener(handleMessage);
    
    setPageScanLoading(true);
    sendMessageToActiveTab({ type: "SCAN_PAGE" }).catch(() => {
      setPageScanLoading(false);
    });
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

  const toggleGrid = async () => {
    setError(null);
    try {
      await sendMessageToActiveTab({ type: "GRID_TOGGLE" });
      setGridActive(!gridActive);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to toggle grid.",
      );
    }
  };

  const handleRescan = async () => {
    setPageScanLoading(true);
    try {
      await sendMessageToActiveTab({ type: "SCAN_PAGE" });
    } catch {
      setPageScanLoading(false);
    }
  };

  const [eyedropperFeedback, setEyedropperFeedback] = useState<string | null>(null);

  const handleEyedropper = async () => {
    if (!("EyeDropper" in window)) {
      setError("EyeDropper is not supported in this browser.");
      return;
    }
    setError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
      const eyeDropper = new (window as any).EyeDropper();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      const result = await eyeDropper.open();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
      await navigator.clipboard.writeText(result.sRGBHex);
      
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      setEyedropperFeedback(result.sRGBHex);
      setTimeout(() => setEyedropperFeedback(null), 2000);
    } catch {
      // User canceled or error
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        void togglePicker();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          sendMessageToActiveTab({ type: "REDO_CHANGE" });
          redoLocalChange();
        } else {
          sendMessageToActiveTab({ type: "UNDO_CHANGE" });
          undoLocalChange();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pickerActive, redoLocalChange, undoLocalChange]);

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-slate-200 bg-panel px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold">UI DevTools</h1>
            <p className="truncate text-xs text-muted" title={selectedElement?.selector ?? hoveredSelector ?? "No element selected"}>
              {selectedElement?.selector ?? hoveredSelector ?? "No element selected"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {["palette", "typography", "assets"].includes(activeTab) && (
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-panel text-slate-600 transition hover:bg-slate-50 hover:text-ink"
                onClick={() => void handleRescan()}
                title="Rescan Page"
                type="button"
              >
                <RefreshCcw aria-hidden="true" size={14} />
              </button>
            )}
            <button
              className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md border transition ${
                eyedropperFeedback
                  ? "border-emerald-200 bg-emerald-50 px-2 text-emerald-700"
                  : "w-8 border-slate-200 bg-panel text-slate-600 hover:bg-slate-50 hover:text-ink"
              }`}
              onClick={() => void handleEyedropper()}
              title="Global Eyedropper"
              type="button"
            >
              {eyedropperFeedback ? (
                <>
                  <Check aria-hidden="true" size={13} />
                  <span className="text-[10px] font-mono font-bold uppercase">{eyedropperFeedback}</span>
                </>
              ) : (
                <Pipette aria-hidden="true" size={14} />
              )}
            </button>
            <button
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${
                gridActive
                  ? "border-accent bg-accent text-white hover:bg-blue-700"
                  : "border-slate-200 bg-panel text-slate-600 hover:bg-slate-50 hover:text-ink"
              }`}
              onClick={() => void toggleGrid()}
              title="Toggle Layout Grid"
              type="button"
            >
              <Grid3X3 aria-hidden="true" size={15} />
            </button>
            <button
              className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium shadow-sm transition ${
                pickerActive
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-accent text-white hover:bg-blue-700"
              }`}
              onClick={() => void togglePicker()}
              type="button"
            >
              <SquareMousePointer aria-hidden="true" size={15} />
              {pickerActive ? "Stop" : "Pick"}
            </button>
          </div>
        </div>
      </header>

      <nav
        className="flex overflow-x-auto border-b border-slate-200 bg-panel scrollbar-hide"
        aria-label="Panel sections"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;

          return (
            <button
              aria-current={selected ? "page" : undefined}
              className={`flex h-12 min-w-[64px] flex-col items-center justify-center gap-1 text-[10px] font-medium transition ${
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
        ) : activeTab === "motion" ? (
          <MotionPanel />
        ) : activeTab === "palette" ? (
          <PalettePanel />
        ) : activeTab === "typography" ? (
          <TypographyPanel />
        ) : activeTab === "assets" ? (
          <AssetsPanel />
        ) : activeTab === "accessibility" ? (
          <AccessibilityPanel />
        ) : (
          <ExportPanel />
        )}
      </section>
    </main>
  );
};
