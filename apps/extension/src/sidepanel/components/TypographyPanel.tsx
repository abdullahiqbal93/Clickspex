import { Type } from "lucide-react";
import { usePanelStore } from "../store";

export const TypographyPanel = () => {
  const scan = usePanelStore((state) => state.pageScan);
  const loading = usePanelStore((state) => state.pageScanLoading);

  if (loading || !scan) {
    return (
      <div className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Type aria-hidden="true" size={16} />
          Typography
        </div>
        <p className="mt-2 text-xs text-muted">{loading ? "Scanning page fonts..." : "Idle"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Type size={16} />
              Typography
            </h2>
            <p className="mt-1 break-all text-xs text-muted">
              Fonts detected on the current page.
            </p>
          </div>
        </div>
      </section>

      {scan.fonts.length === 0 ? (
        <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card text-xs text-muted">
          No fonts found
        </section>
      ) : (
        scan.fonts.map((font, i) => (
          <section key={i} className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card space-y-3">
            <h3 className="text-lg font-semibold truncate" style={{ fontFamily: font.family }} title={font.family}>
              {font.family.split(",")[0]}
            </h3>
            <p className="text-[10px] text-muted truncate">{font.family}</p>
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
              <div className="w-full text-[10px] font-medium text-slate-400 uppercase tracking-wide">Weights</div>
              {font.weights.map(w => (
                <span key={w} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                  {w}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
              <div className="w-full text-[10px] font-medium text-slate-400 uppercase tracking-wide">Sizes</div>
              {font.sizes.map(s => (
                <span key={s} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                  {s}
                </span>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
};
