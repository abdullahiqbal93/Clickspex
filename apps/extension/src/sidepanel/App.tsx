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

import { createReconnectingSidePanelPort, sendMessageToActiveTab } from "../chrome/messaging";

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

const tabMeta = {
  inspect: { label: "Inspect", icon: Crosshair },
  styles: { label: "Styles", icon: Paintbrush },
  box: { label: "Box", icon: Box },
  typography: { label: "Type", icon: Type },
  motion: { label: "Motion", icon: PlaySquare },
  measure: { label: "Measure", icon: Ruler },
  palette: { label: "Palette", icon: Palette },
  assets: { label: "Assets", icon: Image },
  accessibility: { label: "A11y", icon: Accessibility },
  export: { label: "Export", icon: Code2 },
} as const satisfies Record<PanelTab, { label: string; icon: typeof Crosshair }>;

type NavGroup = {
  id: string;
  label: string;
  icon: typeof Crosshair;
  tabs: readonly [PanelTab, ...PanelTab[]];
};

const navGroups: readonly NavGroup[] = [
  { id: "inspect", label: "Inspect", icon: Crosshair, tabs: ["inspect"] },
  { id: "style", label: "Style", icon: Paintbrush, tabs: ["styles", "box", "typography", "motion"] },
  { id: "measure", label: "Measure", icon: Ruler, tabs: ["measure"] },
  { id: "assets", label: "Assets", icon: Palette, tabs: ["palette", "assets"] },
  { id: "review", label: "Review", icon: Accessibility, tabs: ["accessibility", "export"] },
];

const groupForTab = (tab: PanelTab) =>
  navGroups.find((group) => group.tabs.includes(tab)) ?? navGroups[0]!;

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
    const handleMessage = (rawMessage: unknown) => {
      if (!isExtensionMessage(rawMessage)) {
        return;
      }

      if (rawMessage.type === "ELEMENT_SELECTED") {
        const hadSelection = usePanelStore.getState().selectedElement !== null;
        setSelectedElement(rawMessage.payload);
        setPickerActive(true);
        setHoveredSelector(null);

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

    const connection = createReconnectingSidePanelPort(handleMessage);

    setPageScanLoading(true);
    sendMessageToActiveTab({ type: "SCAN_PAGE" }).catch(() => {
      setPageScanLoading(false);
    });
    return () => {
      connection.disconnect();
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
  const activeGroup = groupForTab(activeTab);

  return (
    <main className="min-h-screen text-ink">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-panel/85 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2 px-3.5 pt-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-indigo-500 to-fuchsia-500 text-white shadow-accent-glow"
            >
              <SquareMousePointer size={17} />
            </span>
            <div className="min-w-0 leading-tight">
              <h1 className="truncate text-sm font-bold tracking-tight">UI Buddy</h1>
              <p className="truncate text-[10px] font-medium text-muted">Inspect &amp; refine UI</p>
            </div>
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

            <span aria-hidden="true" className="mx-1 h-4 w-px bg-line-strong" />

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
                  ? "inline-flex h-9 items-center gap-1.5 rounded-2xl bg-emerald-50 px-2.5 text-emerald-700 ring-1 ring-inset ring-emerald-200"
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
              className={`ml-1 inline-flex h-9 items-center gap-1.5 rounded-2xl px-3.5 text-xs font-semibold transition-all active:scale-[0.97] ${pickerActive
                ? "bg-rose-500 text-white shadow-soft hover:bg-rose-600"
                : "bg-gradient-to-b from-accent to-accent-hover text-white shadow-accent-glow hover:brightness-105"
                }`}
              onClick={() => void togglePicker()}
              type="button"
            >
              <SquareMousePointer aria-hidden="true" size={14} />
              {pickerActive ? "Stop" : "Pick"}
            </button>
          </div>
        </div>

        <div className="px-3.5 pb-2.5 pt-2">
          <div
            className={`flex items-center gap-2 rounded-2xl border px-3 py-1.5 transition-colors ${currentSelector
              ? "border-accent-ring/60 bg-accent-softer"
              : "border-line bg-panel-soft"
              }`}
          >
            <Crosshair
              aria-hidden="true"
              className={currentSelector ? "shrink-0 text-accent" : "shrink-0 text-slate-300"}
              size={13}
            />
            <p
              className={`min-w-0 truncate font-mono text-2xs ${currentSelector ? "text-accent-hover" : "text-slate-400"
                }`}
              title={currentSelector ?? "No element selected"}
            >
              {currentSelector ?? "No element selected — press Pick to inspect"}
            </p>
          </div>
        </div>

        <nav className="px-3.5 pb-3" aria-label="Panel sections">
          <div className="grid grid-cols-5 gap-1 rounded-2xl border border-line bg-panel-soft p-1 shadow-soft">
            {navGroups.map((group) => {
              const Icon = group.icon;
              const selected = activeGroup.id === group.id;

              return (
                <button
                  aria-current={selected ? "page" : undefined}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-[10px] font-semibold transition-all ${selected
                    ? "bg-gradient-to-b from-accent to-accent-hover text-white shadow-accent-glow"
                    : "text-muted hover:bg-accent-softer hover:text-accent"
                    }`}
                  key={group.id}
                  onClick={() => setActiveTab(group.tabs[0])}
                  type="button"
                >
                  <Icon aria-hidden="true" size={16} />
                  <span>{group.label}</span>
                </button>
              );
            })}
          </div>

          {activeGroup.tabs.length > 1 ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5 animate-fade-in">
              {activeGroup.tabs.map((tabId) => {
                const meta = tabMeta[tabId];
                const Icon = meta.icon;
                const selected = activeTab === tabId;

                return (
                  <button
                    aria-current={selected ? "page" : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all active:scale-95 ${selected
                      ? "bg-accent-soft text-accent ring-1 ring-inset ring-accent-ring"
                      : "text-muted hover:bg-panel-soft hover:text-ink"
                      }`}
                    key={tabId}
                    onClick={() => setActiveTab(tabId)}
                    type="button"
                  >
                    <Icon aria-hidden="true" size={13} />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          ) : null}
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
