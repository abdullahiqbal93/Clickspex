import { Monitor, PencilRuler, Ruler, Smartphone, Tablet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { sendMessageToActiveTab } from "../../chrome/messaging";
import { usePanelStore } from "../store";

type ViewportSize = {
  width: number;
  height: number;
};

type ViewportStatus = {
  viewport: ViewportSize | null;
  window: ViewportSize | null;
};

type ViewportPreset = ViewportSize & {
  label: string;
  note: string;
  icon: typeof Smartphone;
};

type ViewportPresetGroup = {
  label: string;
  presets: readonly ViewportPreset[];
};

const VIEWPORT_PRESET_GROUPS: readonly ViewportPresetGroup[] = [
  {
    label: "Devices",
    presets: [
      { label: "Phone", width: 390, height: 844, note: "iPhone 12-15", icon: Smartphone },
      { label: "Large phone", width: 430, height: 932, note: "Pro Max", icon: Smartphone },
      { label: "Tablet", width: 768, height: 1024, note: "Portrait", icon: Tablet },
      { label: "Tablet wide", width: 1024, height: 768, note: "Landscape", icon: Tablet },
      { label: "Laptop", width: 1366, height: 768, note: "Common", icon: Monitor },
      { label: "Desktop", width: 1440, height: 900, note: "Default", icon: Monitor },
    ],
  },
  {
    label: "Breakpoint edges",
    presets: [
      { label: "Mobile max", width: 767, height: 900, note: "Before md", icon: Smartphone },
      { label: "Tablet min", width: 768, height: 900, note: "md starts", icon: Tablet },
      { label: "Tablet max", width: 1023, height: 900, note: "Before lg", icon: Tablet },
      { label: "Desktop min", width: 1024, height: 900, note: "lg starts", icon: Monitor },
      { label: "Wide", width: 1280, height: 900, note: "xl starts", icon: Monitor },
      { label: "2XL", width: 1536, height: 960, note: "2xl starts", icon: Monitor },
    ],
  },
];

const VIEWPORT_WIDTH_TOLERANCE = 2;
const VIEWPORT_HEIGHT_TOLERANCE = 24;
const RESIZE_SETTLE_MS = 180;
const RESIZE_CORRECTION_ATTEMPTS = 3;
const MIN_WINDOW_WIDTH = 360;
const MIN_WINDOW_HEIGHT = 320;

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

const formatPixels = (value: number): string => `${Math.round(value)}px`;
const formatSize = (size: ViewportSize): string =>
  `${Math.round(size.width)} x ${Math.round(size.height)}`;
const presetKey = (group: string, preset: ViewportPreset): string =>
  `${group}:${preset.width}x${preset.height}:${preset.label}`;

const isViewportSize = (value: unknown): value is ViewportSize => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<ViewportSize>;
  return typeof candidate.width === "number" && typeof candidate.height === "number";
};

const readActiveInspectableTab = async (): Promise<chrome.tabs.Tab | null> => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return activeTab?.id === undefined || activeTab.windowId === undefined ? null : activeTab;
};

const readTabViewport = async (tabId: number): Promise<ViewportSize | null> => {
  try {
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({ width: window.innerWidth, height: window.innerHeight }),
    });

    return isViewportSize(execution?.result) ? execution.result : null;
  } catch {
    return null;
  }
};

const readWindowSize = async (windowId: number): Promise<ViewportSize | null> => {
  const current = await chrome.windows.get(windowId);

  return current.width !== undefined && current.height !== undefined
    ? { width: current.width, height: current.height }
    : null;
};

const readViewportStatusForTab = async (
  tabId: number,
  windowId: number,
): Promise<ViewportStatus> => {
  const [windowSize, viewport] = await Promise.all([
    readWindowSize(windowId),
    readTabViewport(tabId),
  ]);
  return { viewport, window: windowSize };
};

const isMatchingViewportWidth = (viewport: ViewportSize | null, preset: ViewportSize): boolean =>
  viewport !== null && Math.abs(viewport.width - preset.width) <= VIEWPORT_WIDTH_TOLERANCE;

const isMatchingViewportHeight = (viewport: ViewportSize | null, preset: ViewportSize): boolean =>
  viewport !== null && Math.abs(viewport.height - preset.height) <= VIEWPORT_HEIGHT_TOLERANCE;

const activePresetTitle = (
  preset: ViewportPreset,
  active: boolean,
  heightMatched: boolean,
): string => {
  const target = `Target viewport: ${preset.width} x ${preset.height}`;

  if (!active) {
    return target;
  }

  return heightMatched
    ? `${target} - active`
    : `${target} - width active, height may be limited by the screen/browser chrome`;
};

export const MeasurePanel = () => {
  const rulerActive = usePanelStore((state) => state.rulerActive);
  const selectedElement = usePanelStore((state) => state.selectedElement);
  const setError = usePanelStore((state) => state.setError);
  const setPickerActive = usePanelStore((state) => state.setPickerActive);
  const setRulerActive = usePanelStore((state) => state.setRulerActive);

  const [viewportStatus, setViewportStatus] = useState<ViewportStatus>({
    viewport: null,
    window: null,
  });
  const [resizingPresetKey, setResizingPresetKey] = useState<string | null>(null);

  const refreshViewportStatus = useCallback(async () => {
    try {
      const activeTab = await readActiveInspectableTab();

      if (activeTab === null) {
        setViewportStatus({ viewport: null, window: null });
        return;
      }

      setViewportStatus(await readViewportStatusForTab(activeTab.id!, activeTab.windowId));
    } catch {
      setViewportStatus({ viewport: null, window: null });
    }
  }, []);

  useEffect(() => {
    void refreshViewportStatus();

    const handleBoundsChanged = () => {
      void refreshViewportStatus();
    };

    chrome.windows.onBoundsChanged.addListener(handleBoundsChanged);
    return () => chrome.windows.onBoundsChanged.removeListener(handleBoundsChanged);
  }, [refreshViewportStatus]);

  const applyViewportPreset = async (targetViewport: ViewportPreset, key: string) => {
    setError(null);
    setResizingPresetKey(key);
    try {
      const activeTab = await readActiveInspectableTab();

      if (activeTab === null) {
        throw new Error("No active tab is available for viewport resizing.");
      }

      const activeWindow = await chrome.windows.get(activeTab.windowId);

      if (activeWindow.state !== undefined && activeWindow.state !== "normal") {
        await chrome.windows.update(activeTab.windowId, { state: "normal" });
        await delay(RESIZE_SETTLE_MS);
      }

      let status = await readViewportStatusForTab(activeTab.id!, activeTab.windowId);

      if (status.window === null || status.viewport === null) {
        throw new Error("Unable to read this page viewport. Use an http/https tab and refresh it.");
      }

      for (let attempt = 0; attempt < RESIZE_CORRECTION_ATTEMPTS; attempt += 1) {
        const widthChromeOffset = Math.max(0, status.window.width - status.viewport.width);
        const heightChromeOffset = Math.max(0, status.window.height - status.viewport.height);

        await chrome.windows.update(activeTab.windowId, {
          height: Math.max(MIN_WINDOW_HEIGHT, targetViewport.height + heightChromeOffset),
          width: Math.max(MIN_WINDOW_WIDTH, targetViewport.width + widthChromeOffset),
        });
        await delay(RESIZE_SETTLE_MS);

        status = await readViewportStatusForTab(activeTab.id!, activeTab.windowId);

        if (
          isMatchingViewportWidth(status.viewport, targetViewport) &&
          isMatchingViewportHeight(status.viewport, targetViewport)
        ) {
          break;
        }

        if (status.window === null || status.viewport === null) {
          break;
        }
      }

      setViewportStatus(status);

      if (!isMatchingViewportWidth(status.viewport, targetViewport)) {
        throw new Error(
          `Chrome resized to ${status.viewport === null ? "an unknown viewport" : formatSize(status.viewport)}. The requested width may not fit on this screen with the side panel open.`,
        );
      }
    } catch (caughtError) {
      await refreshViewportStatus();
      setError(caughtError instanceof Error ? caughtError.message : "Unable to resize the window.");
    } finally {
      setResizingPresetKey(null);
    }
  };

  const startElementMeasure = async () => {
    if (selectedElement === null) {
      return;
    }

    setError(null);
    try {
      await sendMessageToActiveTab({ type: "MEASURE_START", payload: selectedElement });
      setPickerActive(true);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to start element measurement.",
      );
    }
  };
  const toggleRuler = async () => {
    setError(null);
    const nextActive = !rulerActive;

    try {
      await sendMessageToActiveTab({ type: nextActive ? "RULER_ENABLE" : "RULER_DISABLE" });
      setRulerActive(nextActive);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to reach the active tab.",
      );
      setRulerActive(false);
    }
  };

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Ruler size={16} />
              Manual Ruler
            </h2>
            <p className="mt-1 break-all text-xs text-muted">
              Draw a custom measuring box on the screen
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <button
              className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={selectedElement === null}
              onClick={() => void startElementMeasure()}
              type="button"
            >
              <Ruler aria-hidden="true" size={14} />
              Measure Element
            </button>
            <button
              className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium transition ${
                rulerActive
                  ? "bg-teal-600 text-white shadow-sm hover:bg-teal-700"
                  : "border border-border text-slate-700 hover:bg-slate-50"
              }`}
              onClick={() => void toggleRuler()}
              type="button"
            >
              <PencilRuler aria-hidden="true" size={14} />
              {rulerActive ? "Stop Drawing" : "Draw Ruler"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Viewport presets</h3>
            <p className="mt-1 text-xs leading-5 text-muted">
              {viewportStatus.viewport !== null
                ? `Viewport: ${formatSize(viewportStatus.viewport)}`
                : "Viewport unavailable"}
              {viewportStatus.window !== null
                ? ` | Window: ${formatSize(viewportStatus.window)}`
                : ""}
            </p>
          </div>
          <button
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-border px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => void refreshViewportStatus()}
            type="button"
          >
            Refresh
          </button>
        </div>
        <div className="mt-3 space-y-3">
          {VIEWPORT_PRESET_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-normal text-slate-500">
                {group.label}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {group.presets.map((preset) => {
                  const Icon = preset.icon;
                  const key = presetKey(group.label, preset);
                  const active = isMatchingViewportWidth(viewportStatus.viewport, preset);
                  const heightMatched = isMatchingViewportHeight(viewportStatus.viewport, preset);
                  const resizing = resizingPresetKey === key;

                  return (
                    <button
                      className={`flex min-h-[58px] min-w-0 items-center gap-2 rounded-md border px-2 text-left transition disabled:cursor-wait disabled:opacity-70 ${
                        active
                          ? "border-accent bg-blue-50 text-accent"
                          : "border-border text-slate-700 hover:bg-slate-50"
                      }`}
                      disabled={resizingPresetKey !== null}
                      key={key}
                      onClick={() => void applyViewportPreset(preset, key)}
                      title={activePresetTitle(preset, active, heightMatched)}
                      type="button"
                    >
                      <Icon aria-hidden="true" className="shrink-0" size={14} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold">
                          {resizing ? "Applying..." : preset.label}
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          {preset.width} x {preset.height}
                        </span>
                        <span className="block truncate text-[10px] text-slate-400">
                          {active && !heightMatched ? "Width active" : preset.note}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {selectedElement !== null && (
        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
            <p className="text-[10px] font-semibold uppercase tracking-normal text-slate-500">
              Element Width
            </p>
            <p className="mt-1 text-lg font-semibold">{formatPixels(selectedElement.rect.width)}</p>
          </div>
          <div className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
            <p className="text-[10px] font-semibold uppercase tracking-normal text-slate-500">
              Element Height
            </p>
            <p className="mt-1 text-lg font-semibold">
              {formatPixels(selectedElement.rect.height)}
            </p>
          </div>
        </section>
      )}
    </div>
  );
};
