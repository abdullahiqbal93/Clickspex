import { isExtensionMessage } from "@ui-buddy/shared";
import {
  Accessibility,
  Box,
  Check,
  Code2,
  Crosshair,
  Grid3X3,
  HelpCircle,
  Image,
  Paintbrush,
  Palette,
  Pipette,
  PlaySquare,
  Redo2,
  RefreshCcw,
  Ruler,
  SquareMousePointer,
  Type,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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

type EyeDropperResult = {
  sRGBHex: string;
};

type EyeDropperConstructor = new () => {
  open: () => Promise<EyeDropperResult>;
};

declare global {
  interface Window {
    EyeDropper?: EyeDropperConstructor;
  }
}

type TabUpdatedListener = Parameters<typeof chrome.tabs.onUpdated.addListener>[0];

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
  const selectedElement = usePanelStore((state) => state.selectedElement);
  const setActiveTab = usePanelStore((state) => state.setActiveTab);
  const setError = usePanelStore((state) => state.setError);
  const setGridActive = usePanelStore((state) => state.setGridActive);
  const setHoveredSelector = usePanelStore((state) => state.setHoveredSelector);
  const setPageScan = usePanelStore((state) => state.setPageScan);
  const setPageScanLoading = usePanelStore((state) => state.setPageScanLoading);
  const setPickerActive = usePanelStore((state) => state.setPickerActive);
  const setRulerActive = usePanelStore((state) => state.setRulerActive);
  const setSearchResults = usePanelStore((state) => state.setSearchResults);
  const setMeasurementTarget = usePanelStore((state) => state.setMeasurementTarget);
  const setSelectedElement = usePanelStore((state) => state.setSelectedElement);
  const historyUndoDepth = usePanelStore((state) => state.historyUndoDepth);
  const historyRedoDepth = usePanelStore((state) => state.historyRedoDepth);
  const applySessionSync = usePanelStore((state) => state.applySessionSync);
  const setA11yIssues = usePanelStore((state) => state.setA11yIssues);
  const setAssetFetch = usePanelStore((state) => state.setAssetFetch);
  const setElementCssResult = usePanelStore((state) => state.setElementCssResult);
  const setMultiSelection = usePanelStore((state) => state.setMultiSelection);
  const resetForNavigation = usePanelStore((state) => state.resetForNavigation);

  useEffect(() => {
    const port = connectSidePanelPort();

    const handleMessage = (rawMessage: unknown) => {
      if (!isExtensionMessage(rawMessage)) {
        return;
      }

      if (rawMessage.type === "ELEMENT_SELECTED") {
        const hadSelection = usePanelStore.getState().selectedElement !== null;
        setSelectedElement(rawMessage.payload);
        setPickerActive(true);
        setHoveredSelector(null);

        // Jump to Inspect only for the first selection; keep the user's tab
        // (Styles, Box, A11y, ...) when they re-pick another element.
        if (!hadSelection) {
          setActiveTab("inspect");
        }
      }

      if (rawMessage.type === "ELEMENT_UNSELECTED") {
        setSelectedElement(null);
        setHoveredSelector(null);
      }

      if (rawMessage.type === "ELEMENT_HOVERED") {
        setHoveredSelector(rawMessage.payload.selector);
      }
      if (rawMessage.type === "PICKER_DISABLE") {
        setPickerActive(false);
        setSelectedElement(null);
        setHoveredSelector(null);
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

      if (rawMessage.type === "ELEMENT_SEARCH_RESULT") {
        setSearchResults(rawMessage.payload.results);
      }

      if (rawMessage.type === "ELEMENT_CSS_RESULT") {
        setElementCssResult(rawMessage.payload);
      }

      if (rawMessage.type === "A11Y_SCAN_RESULT") {
        setA11yIssues(rawMessage.payload.issues);
      }

      if (rawMessage.type === "ASSET_FETCHED") {
        setAssetFetch(rawMessage.payload);
      }

      if (rawMessage.type === "MULTI_SELECTION_CHANGED") {
        setMultiSelection(rawMessage.payload);
      }

      if (rawMessage.type === "SESSION_SYNC") {
        applySessionSync(rawMessage.payload);
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
  }, [
    applySessionSync,
    setA11yIssues,
    setActiveTab,
    setAssetFetch,
    setElementCssResult,
    setHoveredSelector,
    setMeasurementTarget,
    setMultiSelection,
    setPageScan,
    setPageScanLoading,
    setPickerActive,
    setRulerActive,
    setSearchResults,
    setSelectedElement,
  ]);

  // Reload the panel with the page: when the inspected tab reloads or the user
  // switches tabs, drop stale selection/edits and rescan the fresh page.
  useEffect(() => {
    const rescanFreshPage = () => {
      setPageScanLoading(true);
      sendMessageToActiveTab({ type: "SCAN_PAGE" }).catch(() => setPageScanLoading(false));
    };

    const handleUpdated: TabUpdatedListener = (_tabId, changeInfo, tab) => {
      if (tab.active !== true) {
        return;
      }

      if (changeInfo.status === "loading") {
        resetForNavigation();
      } else if (changeInfo.status === "complete") {
        rescanFreshPage();
      }
    };

    const handleActivated = () => {
      resetForNavigation();
      rescanFreshPage();
    };

    chrome.tabs.onUpdated.addListener(handleUpdated);
    chrome.tabs.onActivated.addListener(handleActivated);

    return () => {
      chrome.tabs.onUpdated.removeListener(handleUpdated);
      chrome.tabs.onActivated.removeListener(handleActivated);
    };
  }, [resetForNavigation, setPageScanLoading]);

  const togglePicker = useCallback(async () => {
    setError(null);
    const nextActive = !pickerActive;

    try {
      await sendMessageToActiveTab({ type: nextActive ? "PICKER_ENABLE" : "PICKER_DISABLE" });
      setPickerActive(nextActive);

      if (!nextActive) {
        setSelectedElement(null);
        setHoveredSelector(null);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to reach the active tab.",
      );
      setPickerActive(false);
    }
  }, [pickerActive, setError, setHoveredSelector, setPickerActive, setSelectedElement]);

  const toggleGrid = async () => {
    setError(null);
    try {
      await sendMessageToActiveTab({ type: "GRID_TOGGLE" });
      setGridActive(!gridActive);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to toggle grid.");
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
  const [showHelp, setShowHelp] = useState(false);

  const hotkeys: Array<[string, string]> = [
    ["Alt+Shift+P", "Toggle element picker"],
    ["Alt+Arrows", "Walk parent / child / siblings"],
    ["Shift+Click", "Add element to multi-selection"],
    ["Double-click", "Edit text inline"],
    ["Delete", "Hide element (Ctrl+Z restores it)"],
    ["Escape", "Deselect, then stop picking"],
    ["Ctrl/Cmd+Z", "Undo any change (styles, moves, deletes)"],
    ["Ctrl/Cmd+Shift+Z", "Redo"],
    ["Shift+Click (measure)", "Pin a measurement"],
  ];

  const handleEyedropper = async () => {
    const EyeDropper = window.EyeDropper;

    if (EyeDropper === undefined) {
      setError("EyeDropper is not supported in this browser.");
      return;
    }

    setError(null);
    try {
      const eyeDropper = new EyeDropper();
      const result = await eyeDropper.open();
      await navigator.clipboard.writeText(result.sRGBHex);

      // Keep a persistent history for the Palette tab.
      try {
        const stored = await chrome.storage.local.get("ubColorHistory");
        const history: string[] = Array.isArray(stored.ubColorHistory)
          ? (stored.ubColorHistory as string[])
          : [];
        const nextHistory = [
          result.sRGBHex,
          ...history.filter((color) => color !== result.sRGBHex),
        ].slice(0, 24);
        await chrome.storage.local.set({ ubColorHistory: nextHistory });
      } catch {
        // History is best-effort only.
      }

      setEyedropperFeedback(result.sRGBHex);
      setTimeout(() => setEyedropperFeedback(null), 2000);
    } catch {
      // User canceled or error
    }
  };

  const undoAll = useCallback(async () => {
    setError(null);
    try {
      await sendMessageToActiveTab({ type: "UNDO_CHANGE" });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to undo.");
    }
  }, [setError]);

  const redoAll = useCallback(async () => {
    setError(null);
    try {
      await sendMessageToActiveTab({ type: "REDO_CHANGE" });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to redo.");
    }
  }, [setError]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        void togglePicker();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          void redoAll();
        } else {
          void undoAll();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [redoAll, togglePicker, undoAll]);

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-slate-200 bg-panel px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold">ui-buddy</h1>
            <p
              className="truncate text-xs text-muted"
              title={selectedElement?.selector ?? hoveredSelector ?? "No element selected"}
            >
              {selectedElement?.selector ?? hoveredSelector ?? "No element selected"}
            </p>
          </div>
          <div className="relative flex shrink-0 items-center gap-1.5">
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-panel text-slate-600 transition hover:bg-slate-50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
              disabled={historyUndoDepth === 0}
              onClick={() => void undoAll()}
              title="Undo last change (styles, moves, deletes) — Ctrl+Z"
              type="button"
            >
              <Undo2 aria-hidden="true" size={14} />
            </button>
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-panel text-slate-600 transition hover:bg-slate-50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
              disabled={historyRedoDepth === 0}
              onClick={() => void redoAll()}
              title="Redo — Ctrl+Shift+Z"
              type="button"
            >
              <Redo2 aria-hidden="true" size={14} />
            </button>
            <button
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition ${
                showHelp
                  ? "border-accent bg-blue-50 text-accent"
                  : "border-slate-200 bg-panel text-slate-600 hover:bg-slate-50 hover:text-ink"
              }`}
              onClick={() => setShowHelp((current) => !current)}
              title="Keyboard shortcuts"
              type="button"
            >
              <HelpCircle aria-hidden="true" size={14} />
            </button>
            {showHelp ? (
              <div className="absolute right-0 top-10 z-50 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
                <p className="text-xs font-semibold text-slate-900">Keyboard shortcuts</p>
                <dl className="mt-2 space-y-1.5">
                  {hotkeys.map(([keys, description]) => (
                    <div className="flex items-start justify-between gap-2" key={keys}>
                      <dt className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
                        {keys}
                      </dt>
                      <dd className="text-right text-[11px] leading-4 text-slate-600">
                        {description}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
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
                  <span className="text-[10px] font-mono font-bold uppercase">
                    {eyedropperFeedback}
                  </span>
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
