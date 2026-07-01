import { PencilRuler, Ruler } from "lucide-react";

import { sendMessageToActiveTab } from "../../chrome/messaging";
import { usePanelStore } from "../store";

const formatPixels = (value: number): string => `${Math.round(value)}px`;

export const MeasurePanel = () => {
  const rulerActive = usePanelStore((state) => state.rulerActive);
  const selectedElement = usePanelStore((state) => state.selectedElement);
  const setError = usePanelStore((state) => state.setError);
  const setRulerActive = usePanelStore((state) => state.setRulerActive);

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
          <button
            className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-medium transition ${
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
            <p className="mt-1 text-lg font-semibold">{formatPixels(selectedElement.rect.height)}</p>
          </div>
        </section>
      )}
    </div>
  );
};
