import { measureRects } from "@ui-devtools/core";
import { Ruler, Target } from "lucide-react";

import { sendMessageToActiveTab } from "../../chrome/messaging";
import { usePanelStore } from "../store";

const formatPixels = (value: number): string => `${Math.round(value)}px`;

const alignmentLabels: Record<string, string> = {
  left: "Left aligned",
  right: "Right aligned",
  "center-x": "Center aligned",
  top: "Top aligned",
  bottom: "Bottom aligned",
  "center-y": "Middle aligned",
};

export const MeasurePanel = () => {
  const measurementTarget = usePanelStore((state) => state.measurementTarget);
  const pickerActive = usePanelStore((state) => state.pickerActive);
  const selectedElement = usePanelStore((state) => state.selectedElement);
  const setActiveTab = usePanelStore((state) => state.setActiveTab);
  const setError = usePanelStore((state) => state.setError);
  const setPickerActive = usePanelStore((state) => state.setPickerActive);

  const startMeasurement = async () => {
    setError(null);

    try {
      await sendMessageToActiveTab({ type: "MEASURE_START" });
      setActiveTab("measure");
      setPickerActive(true);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to start measuring.");
    }
  };

  if (selectedElement === null) {
    return (
      <div className="rounded-lg border border-slate-200 bg-panel p-4 shadow-panel">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Ruler aria-hidden="true" size={16} />
          Measure
        </div>
        <p className="mt-2 text-xs text-muted">Idle</p>
      </div>
    );
  }

  const result =
    measurementTarget === null ? null : measureRects(selectedElement.rect, measurementTarget.rect);

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-slate-200 bg-panel p-4 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Measure</h2>
            <p className="mt-1 break-all text-xs text-muted">{selectedElement.selector}</p>
          </div>
          <button
            className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md bg-measure px-3 text-xs font-medium text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pickerActive}
            onClick={() => void startMeasurement()}
            type="button"
          >
            <Target aria-hidden="true" size={14} />
            Target
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-slate-200 bg-panel p-4 shadow-panel">
          <p className="text-[10px] font-semibold uppercase tracking-normal text-slate-500">
            Width
          </p>
          <p className="mt-1 text-lg font-semibold">{formatPixels(selectedElement.rect.width)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-panel p-4 shadow-panel">
          <p className="text-[10px] font-semibold uppercase tracking-normal text-slate-500">
            Height
          </p>
          <p className="mt-1 text-lg font-semibold">{formatPixels(selectedElement.rect.height)}</p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-panel p-4 shadow-panel">
        <h3 className="text-sm font-semibold">Target</h3>
        <p className="mt-2 break-all text-xs text-muted">{measurementTarget?.selector ?? "None"}</p>
      </section>

      {result !== null ? (
        <section className="rounded-lg border border-slate-200 bg-panel p-4 shadow-panel">
          <h3 className="text-sm font-semibold">Distance</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-normal text-slate-500">
                Horizontal
              </p>
              <p className="mt-1 font-semibold">{formatPixels(result.horizontalDistance)}</p>
            </div>
            <div className="rounded-md bg-slate-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-normal text-slate-500">
                Vertical
              </p>
              <p className="mt-1 font-semibold">{formatPixels(result.verticalDistance)}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {result.alignments.length > 0 ? (
              result.alignments.map((alignment) => (
                <span
                  className="rounded bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-800"
                  key={alignment}
                >
                  {alignmentLabels[alignment] ?? alignment}
                </span>
              ))
            ) : (
              <span className="text-xs text-muted">No aligned edges</span>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
};
