import { Clipboard, History, Palette, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { usePanelStore } from "../store";

type GradientStop = {
  color: string;
  position: number;
};

const DEFAULT_STOPS: GradientStop[] = [
  { color: "#2563eb", position: 0 },
  { color: "#9333ea", position: 100 },
];

const gradientCss = (kind: "linear" | "radial", angle: number, stops: GradientStop[]): string => {
  const stopList = [...stops]
    .sort((a, b) => a.position - b.position)
    .map((stop) => `${stop.color} ${stop.position}%`)
    .join(", ");

  return kind === "linear"
    ? `linear-gradient(${angle}deg, ${stopList})`
    : `radial-gradient(circle, ${stopList})`;
};

export const PalettePanel = () => {
  const scan = usePanelStore((state) => state.pageScan);
  const loading = usePanelStore((state) => state.pageScanLoading);
  const [history, setHistory] = useState<string[]>([]);
  const [stops, setStops] = useState<GradientStop[]>(DEFAULT_STOPS);
  const [gradientKind, setGradientKind] = useState<"linear" | "radial">("linear");
  const [angle, setAngle] = useState(90);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void chrome.storage.local.get("ubColorHistory").then((stored) => {
      if (Array.isArray(stored.ubColorHistory)) {
        setHistory(stored.ubColorHistory as string[]);
      }
    });

    const onStorageChange = (changes: Record<string, chrome.storage.StorageChange>) => {
      const next = changes.ubColorHistory?.newValue;
      if (Array.isArray(next)) {
        setHistory(next as string[]);
      }
    };

    chrome.storage.onChanged.addListener(onStorageChange);
    return () => chrome.storage.onChanged.removeListener(onStorageChange);
  }, []);

  const clearHistory = async () => {
    await chrome.storage.local.set({ ubColorHistory: [] });
    setHistory([]);
  };

  const updateStop = (index: number, stop: Partial<GradientStop>) => {
    setStops((current) =>
      current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...stop } : entry)),
    );
  };

  const addStop = () => {
    setStops((current) =>
      current.length >= 5 ? current : [...current, { color: "#f59e0b", position: 50 }],
    );
  };

  const removeStop = (index: number) => {
    setStops((current) =>
      current.length <= 2 ? current : current.filter((_, entryIndex) => entryIndex !== index),
    );
  };

  const gradientValue = gradientCss(gradientKind, angle, stops);

  const copyGradient = async () => {
    try {
      await navigator.clipboard.writeText(`background: ${gradientValue};`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  if (loading || !scan) {
    return (
      <div className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Palette aria-hidden="true" size={16} />
          Palette
        </div>
        <p className="mt-2 text-xs text-muted">{loading ? "Scanning page colors..." : "Idle"}</p>
      </div>
    );
  }

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Palette size={16} />
              Color Palette
            </h2>
            <p className="mt-1 break-all text-xs text-muted">
              Top colors extracted from the page. Click to copy hex.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <div className="grid grid-cols-5 gap-2">
          {scan.colors.length === 0 ? (
            <p className="col-span-5 text-xs text-muted">No colors found</p>
          ) : (
            scan.colors.map((color, i) => (
              <button
                key={i}
                className="group relative flex aspect-square flex-col items-center justify-end overflow-hidden rounded-md border border-border shadow-sm transition hover:scale-105"
                style={{ backgroundColor: color.rgb }}
                onClick={() => void copyToClipboard(color.hex)}
                title={`${color.hex}\nUsed ${color.count} times\nIn: ${color.properties.join(", ")}`}
              >
                <div className="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-center text-[9px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                  {color.hex}
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <History size={15} />
            Eyedropper history
          </h3>
          {history.length > 0 ? (
            <button
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-slate-500 transition hover:bg-slate-50"
              onClick={() => void clearHistory()}
              title="Clear history"
              type="button"
            >
              <Trash2 aria-hidden="true" size={13} />
            </button>
          ) : null}
        </div>
        {history.length === 0 ? (
          <p className="mt-2 text-xs text-muted">
            Colors picked with the eyedropper (pipette icon in the header) appear here.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-6 gap-2">
            {history.map((color) => (
              <button
                className="group relative aspect-square overflow-hidden rounded-md border border-border shadow-sm transition hover:scale-105"
                key={color}
                onClick={() => void copyToClipboard(color)}
                style={{ backgroundColor: color }}
                title={`${color} — click to copy`}
                type="button"
              >
                <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[8px] font-medium text-white opacity-0 transition group-hover:opacity-100">
                  {color}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <h3 className="text-sm font-semibold">Gradient generator</h3>
        <div
          className="mt-3 h-16 rounded-md border border-slate-200"
          style={{ background: gradientValue }}
        />
        <div className="mt-3 flex items-center gap-2">
          <select
            aria-label="Gradient type"
            className="h-8 rounded-md border border-border bg-white px-2 text-xs text-slate-700 outline-none"
            onChange={(event) => setGradientKind(event.target.value as "linear" | "radial")}
            value={gradientKind}
          >
            <option value="linear">Linear</option>
            <option value="radial">Radial</option>
          </select>
          {gradientKind === "linear" ? (
            <label className="flex flex-1 items-center gap-2 text-xs text-slate-600">
              <input
                className="w-full accent-accent"
                max={360}
                min={0}
                onChange={(event) => setAngle(Number.parseInt(event.target.value, 10))}
                type="range"
                value={angle}
              />
              <span className="w-10 text-right font-mono">{angle}°</span>
            </label>
          ) : null}
        </div>
        <div className="mt-3 space-y-2">
          {stops.map((stop, index) => (
            <div className="flex items-center gap-2" key={index}>
              <input
                aria-label={`Stop ${index + 1} color`}
                className="h-8 w-9 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0"
                onChange={(event) => updateStop(index, { color: event.target.value })}
                type="color"
                value={stop.color}
              />
              <input
                aria-label={`Stop ${index + 1} position`}
                className="w-full accent-accent"
                max={100}
                min={0}
                onChange={(event) =>
                  updateStop(index, { position: Number.parseInt(event.target.value, 10) })
                }
                type="range"
                value={stop.position}
              />
              <span className="w-9 text-right font-mono text-[10px] text-slate-500">
                {stop.position}%
              </span>
              <button
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                disabled={stops.length <= 2}
                onClick={() => removeStop(index)}
                title="Remove stop"
                type="button"
              >
                <X aria-hidden="true" size={12} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            disabled={stops.length >= 5}
            onClick={addStop}
            type="button"
          >
            <Plus aria-hidden="true" size={13} />
            Add stop
          </button>
          <button
            className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium transition ${
              copied
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "bg-accent text-white hover:bg-blue-700"
            }`}
            onClick={() => void copyGradient()}
            type="button"
          >
            <Clipboard aria-hidden="true" size={13} />
            {copied ? "Copied!" : "Copy CSS"}
          </button>
        </div>
        <pre className="mt-3 overflow-x-auto rounded-md bg-slate-950 p-2 text-[10px] leading-4 text-slate-50">
          <code>background: {gradientValue};</code>
        </pre>
      </section>
    </div>
  );
};
