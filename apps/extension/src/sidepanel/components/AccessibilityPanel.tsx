import { contrastRatioFromCssColors } from "@ui-buddy/core";
import { AlertTriangle, CheckCircle2, Pin, ShieldCheck, Trash2 } from "lucide-react";

import { sendMessageToActiveTab } from "../../chrome/messaging";
import { usePanelStore } from "../store";

export const AccessibilityPanel = () => {
  const notes = usePanelStore((state) => state.accessibilityNotes);
  const selectedElement = usePanelStore((state) => state.selectedElement);

  const pinAudit = async () => {
    if (selectedElement === null) {
      return;
    }

    await sendMessageToActiveTab({
      type: "PIN_ELEMENT_CARD",
      payload: { snapshot: selectedElement, kind: "audit" },
    });
  };

  const clearPins = async () => {
    await sendMessageToActiveTab({ type: "CLEAR_PINNED_CARDS" });
  };

  if (selectedElement === null) {
    return (
      <div className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
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
      <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldCheck aria-hidden="true" className="mt-0.5 text-accent" size={17} />
            <div>
              <h2 className="text-sm font-semibold">Accessibility</h2>
              <p className="mt-1 text-xs leading-5 text-muted">
                Lightweight v1 checks only. This is not a full WCAG audit.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-slate-700 transition hover:bg-slate-50"
              onClick={() => void pinAudit()}
              title="Pin audit card"
              type="button"
            >
              <Pin aria-hidden="true" size={14} />
            </button>
            <button
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-slate-700 transition hover:bg-slate-50"
              onClick={() => void clearPins()}
              title="Clear pinned cards"
              type="button"
            >
              <Trash2 aria-hidden="true" size={14} />
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <h3 className="text-sm font-semibold">Contrast</h3>
        <div className="mt-3 flex items-center justify-between rounded-md bg-slate-50 p-3">
          <span className="text-xs font-medium text-slate-500">Ratio</span>
          <span className="text-lg font-semibold text-slate-950">
            {contrastRatio === null ? "Unknown" : `${contrastRatio}:1`}
          </span>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
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
