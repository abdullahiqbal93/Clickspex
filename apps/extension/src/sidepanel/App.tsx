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

  const currentSelector = selectedElement?.selector ?? hoveredSelector;

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-panel/95 backdrop-blur">
        <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-accent-glow"
            >
              <SquareMousePointer size={15} />
            </span>
            <h1 className="truncate text-sm font-semibold tracking-tight">UI Buddy</h1>
          </div>

          <div className="relative flex shrink-0 items-center gap-0.5">
            <button
              className="ub-icon-btn"
              disabled={historyUndoDepth === 0}
              onClick={() => void undoAll()}
              title="Undo last change (styles, moves, deletes) - Ctrl+Z"
              type="button"
            >
              <Undo2 aria-hidden="true" size={15} />
            </button>
            <button
              className="ub-icon-btn"
              disabled={historyRedoDepth === 0}
              onClick={() => void redoAll()}
              title="Redo - Ctrl+Shift+Z"
              type="button"
            >
              <Redo2 aria-hidden="true" size={15} />
            </button>

            <span aria-hidden="true" className="mx-1 h-4 w-px bg-line" />

            {["palette", "typography", "assets"].includes(activeTab) && (
              <button
                className="ub-icon-btn"
                onClick={() => void handleRescan()}
                title="Rescan Page"
                type="button"
              >
                <RefreshCcw aria-hidden="true" size={15} />
              </button>
            )}
            <button
              className={
                eyedropperFeedback
                  ? "inline-flex h-8 items-center gap-1.5 rounded-lg bg-emerald-50 px-2 text-emerald-700 ring-1 ring-inset ring-emerald-200"
                  : "ub-icon-btn"
              }
              onClick={() => void handleEyedropper()}
              title="Global Eyedropper"
              type="button"
            >
              {eyedropperFeedback ? (
                <>
                  <Check aria-hidden="true" size={13} />
                  <span className="font-mono text-[10px] font-bold uppercase">
                    {eyedropperFeedback}
                  </span>
                </>
              ) : (
                <Pipette aria-hidden="true" size={15} />
              )}
            </button>
            <button
              className={`ub-icon-btn ${gridActive ? "ub-icon-btn-active" : ""}`}
              onClick={() => void toggleGrid()}
              title="Toggle Layout Grid"
              type="button"
            >
              <Grid3X3 aria-hidden="true" size={15} />
            </button>
            <button
              className={`ub-icon-btn ${showHelp ? "ub-icon-btn-active" : ""}`}
              onClick={() => setShowHelp((current) => !current)}
              title="Keyboard shortcuts"
              type="button"
            >
              <HelpCircle aria-hidden="true" size={15} />
            </button>
            {showHelp ? (
              <div className="absolute right-0 top-10 z-50 w-72 rounded-card border border-line bg-panel p-3.5 shadow-pop">
                <p className="text-xs font-semibold text-ink">Keyboard shortcuts</p>
                <dl className="mt-2.5 space-y-2">
                  {hotkeys.map(([keys, description]) => (
                    <div className="flex items-start justify-between gap-3" key={keys}>
                      <dt className="ub-kbd shrink-0">{keys}</dt>
                      <dd className="text-right text-2xs leading-4 text-muted">{description}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            <button
              className={`ml-1.5 inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${pickerActive
                ? "bg-rose-500 text-white shadow-sm hover:bg-rose-600"
                : "bg-accent text-white shadow-accent-glow hover:bg-accent-hover"
                }`}
              onClick={() => void togglePicker()}
              type="button"
            >
              <SquareMousePointer aria-hidden="true" size={14} />
              {pickerActive ? "Stop" : "Pick"}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3 pb-2 pt-1.5">
          <Crosshair
            aria-hidden="true"
            className={currentSelector ? "shrink-0 text-accent" : "shrink-0 text-slate-300"}
            size={12}
          />
          <p
            className={`min-w-0 truncate font-mono text-2xs ${currentSelector ? "text-slate-600" : "text-slate-400"
              }`}
            title={currentSelector ?? "No element selected"}
          >
            {currentSelector ?? "No element selected - press Pick to inspect"}
          </p>
        </div>

        <nav
          className="grid grid-cols-5 gap-1 border-t border-line bg-canvas/60 p-1.5"
          aria-label="Panel sections"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const selected = activeTab === tab.id;

            return (
              <button
                aria-current={selected ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[10px] font-medium transition-colors ${selected
                  ? "bg-accent-soft text-accent shadow-sm ring-1 ring-inset ring-accent-ring"
                  : "text-muted hover:bg-slate-100 hover:text-ink"
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
      </header>

      <section className="space-y-3 p-3">
        {error !== null ? (
          <div className="rounded-card border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700">
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
