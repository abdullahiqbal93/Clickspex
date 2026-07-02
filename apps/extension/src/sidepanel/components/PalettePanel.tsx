import { Palette } from "lucide-react";

import { usePanelStore } from "../store";

export const PalettePanel = () => {
  const scan = usePanelStore((state) => state.pageScan);
  const loading = usePanelStore((state) => state.pageScanLoading);

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
    </div>
  );
};
