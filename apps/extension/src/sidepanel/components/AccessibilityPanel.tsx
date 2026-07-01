import { contrastRatioFromCssColors } from "@ui-devtools/core";
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";

import { usePanelStore } from "../store";

export const AccessibilityPanel = () => {
  const notes = usePanelStore((state) => state.accessibilityNotes);
  const selectedElement = usePanelStore((state) => state.selectedElement);

  if (selectedElement === null) {
    return (
      <div className="rounded-lg border border-slate-200 bg-panel p-4 shadow-panel">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck aria-hidden="true" size={16} />
          Accessibility
        </div>
        <p className="mt-2 text-xs text-muted">Idle</p>
      </div>
    );
  }

  const contrastRatio = contrastRatioFromCssColors(
    selectedElement.computedStyles.color ?? "",
    selectedElement.computedStyles["background-color"] ?? "",
  );

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-slate-200 bg-panel p-4 shadow-panel">
        <div className="flex items-start gap-3">
          <ShieldCheck aria-hidden="true" className="mt-0.5 text-accent" size={17} />
          <div>
            <h2 className="text-sm font-semibold">Accessibility</h2>
            <p className="mt-1 text-xs leading-5 text-muted">
              Lightweight v1 checks only. This is not a full WCAG audit.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-panel p-4 shadow-panel">
        <h3 className="text-sm font-semibold">Contrast</h3>
        <div className="mt-3 flex items-center justify-between rounded-md bg-slate-50 p-3">
          <span className="text-xs font-medium text-slate-500">Ratio</span>
          <span className="text-lg font-semibold text-slate-950">
            {contrastRatio === null ? "Unknown" : `${contrastRatio}:1`}
          </span>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-panel p-4 shadow-panel">
        <h3 className="text-sm font-semibold">Warnings</h3>
        <div className="mt-3 space-y-2">
          {notes.length > 0 ? (
            notes.map((note) => (
              <div
                className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900"
                key={note.id}
              >
                <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={15} />
                <div>
                  <p className="text-xs font-semibold">{note.title}</p>
                  <p className="mt-1 text-xs leading-5">{note.message}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
              <CheckCircle2 aria-hidden="true" size={15} />
              No v1 warnings
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
