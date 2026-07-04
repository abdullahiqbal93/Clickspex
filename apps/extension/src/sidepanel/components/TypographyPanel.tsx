import { Type } from "lucide-react";

import { usePanelStore } from "../store";

export const TypographyPanel = () => {
  const scan = usePanelStore((state) => state.pageScan);
  const loading = usePanelStore((state) => state.pageScanLoading);

  if (loading || !scan) {
    return (
      <div className="ub-card p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Type aria-hidden="true" size={16} />
          </span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Typography</h2>
            <p className="text-2xs text-muted">{loading ? "Scanning page fonts…" : "Idle"}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <section className="ub-card p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Type aria-hidden="true" size={16} />
          </span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Typography</h2>
            <p className="text-2xs text-muted">
              {scan.fonts.length} font {scan.fonts.length === 1 ? "family" : "families"} detected on
              this page.
            </p>
          </div>
        </div>
      </section>

      {scan.fonts.length === 0 ? (
        <section className="ub-card p-6 text-center text-xs text-muted">No fonts found</section>
      ) : (
        scan.fonts.map((font, i) => (
          <section key={i} className="ub-card space-y-3 p-4">
            <div>
              <h3
                className="truncate text-lg font-semibold leading-6"
                style={{ fontFamily: font.family }}
                title={font.family}
              >
                {font.family.split(",")[0]}
              </h3>
              <p className="mt-0.5 truncate font-mono text-[10px] text-muted">{font.family}</p>
            </div>
            <div className="border-t border-line pt-3">
              <div className="ub-heading">Weights</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {font.weights.map((w) => (
                  <span key={w} className="ub-chip">
                    {w}
                  </span>
                ))}
              </div>
            </div>
            <div className="border-t border-line pt-3">
              <div className="ub-heading">Sizes</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {font.sizes.map((s) => (
                  <span key={s} className="ub-chip">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </section>
        ))
      )}
    </div>
  );
};
