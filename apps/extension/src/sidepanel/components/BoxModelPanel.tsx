import { Link2, Unlink2 } from "lucide-react";
import { useState } from "react";

import { sendMessageToActiveTab } from "../../chrome/messaging";
import { getCurrentStyleRecord, usePanelStore } from "../store";

import type { StyleChange, SupportedStyleProperty } from "@ui-devtools/shared";

type BoxGroup = "margin" | "padding";
type Side = "top" | "right" | "bottom" | "left";

const sides: Side[] = ["top", "right", "bottom", "left"];

const propertyFor = (group: BoxGroup, side: Side): SupportedStyleProperty => `${group}-${side}`;

const sideLabel = (side: Side): string => side[0]?.toUpperCase() ?? "";

const formatContentSize = (value: string, fallback: number): string =>
  value.trim().length > 0 ? value : `${Math.round(fallback)}px`;

export const BoxModelPanel = () => {
  const [linkedMargin, setLinkedMargin] = useState(false);
  const [linkedPadding, setLinkedPadding] = useState(false);
  const selectedElement = usePanelStore((state) => state.selectedElement);
  const styles = usePanelStore((state) => getCurrentStyleRecord(state));
  const prepareStyleChange = usePanelStore((state) => state.prepareStyleChange);
  const applyLocalStyleChange = usePanelStore((state) => state.applyLocalStyleChange);
  const setError = usePanelStore((state) => state.setError);

  const applyChanges = async (changes: StyleChange[]) => {
    for (const change of changes) {
      await sendMessageToActiveTab({ type: "APPLY_STYLE_CHANGE", payload: change });
      applyLocalStyleChange(change);
    }
  };

  const commitSide = async (group: BoxGroup, side: Side, value: string, linked: boolean) => {
    setError(null);
    const targetSides = linked ? sides : [side];
    const changes = targetSides
      .map((targetSide) => prepareStyleChange(propertyFor(group, targetSide), value))
      .filter((change): change is StyleChange => change !== null);

    if (changes.length === 0) {
      return;
    }

    try {
      await applyChanges(changes);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to update box model.");
    }
  };

  if (selectedElement === null) {
    return (
      <div className="rounded-lg border border-slate-200 bg-panel p-4 shadow-panel">
        <h2 className="text-sm font-semibold">Box model</h2>
        <p className="mt-2 text-xs text-muted">Idle</p>
      </div>
    );
  }

  const boxModel = selectedElement.boxModel;
  const contentWidth = formatContentSize(boxModel.content.width, selectedElement.rect.width);
  const contentHeight = formatContentSize(boxModel.content.height, selectedElement.rect.height);

  const renderEditableGroup = (
    group: BoxGroup,
    linked: boolean,
    setLinked: (linked: boolean) => void,
  ) => (
    <section className="rounded-lg border border-slate-200 bg-panel p-4 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold capitalize">{group}</h3>
        <button
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-700 transition hover:bg-slate-50"
          onClick={() => setLinked(!linked)}
          title={linked ? "Unlink sides" : "Link sides"}
          type="button"
        >
          {linked ? (
            <Link2 aria-hidden="true" size={14} />
          ) : (
            <Unlink2 aria-hidden="true" size={14} />
          )}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {sides.map((side) => {
          const property = propertyFor(group, side);
          const value = styles[property] ?? selectedElement.boxModel[group][side];

          return (
            <label className="space-y-1" key={property}>
              <span className="text-[10px] font-semibold uppercase tracking-normal text-slate-500">
                {side}
              </span>
              <input
                className="h-8 w-full rounded-md border border-slate-200 px-2 text-xs outline-none transition focus:border-accent focus:ring-2 focus:ring-blue-100"
                onChange={(event) => void commitSide(group, side, event.target.value, linked)}
                value={value}
              />
            </label>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-slate-200 bg-panel p-4 shadow-panel">
        <h2 className="text-sm font-semibold">Box model</h2>
        <div className="mt-4 grid grid-cols-[44px_1fr_44px] grid-rows-[32px_32px_1fr_32px_32px] overflow-hidden rounded-md border border-slate-200 text-center text-[10px] font-semibold uppercase tracking-normal text-slate-600">
          <div className="col-start-2 flex items-center justify-center bg-teal-50">
            {styles["margin-top"] ?? boxModel.margin.top}
          </div>
          <div className="col-start-2 row-start-2 flex items-center justify-center bg-blue-50">
            {boxModel.border.top}
          </div>
          <div className="col-start-2 row-start-3 grid min-h-28 grid-cols-[40px_1fr_40px] grid-rows-[24px_minmax(64px,1fr)_24px] bg-amber-50">
            <div className="col-start-2 flex items-center justify-center">
              {styles["padding-top"] ?? boxModel.padding.top}
            </div>
            <div className="col-start-1 row-start-2 flex items-center justify-center">
              {sideLabel("left")} {styles["padding-left"] ?? boxModel.padding.left}
            </div>
            <div className="col-start-2 row-start-2 flex items-center justify-center rounded border border-amber-200 bg-white text-slate-900">
              {contentWidth} x {contentHeight}
            </div>
            <div className="col-start-3 row-start-2 flex items-center justify-center">
              {sideLabel("right")} {styles["padding-right"] ?? boxModel.padding.right}
            </div>
            <div className="col-start-2 row-start-3 flex items-center justify-center">
              {styles["padding-bottom"] ?? boxModel.padding.bottom}
            </div>
          </div>
          <div className="col-start-2 row-start-4 flex items-center justify-center bg-blue-50">
            {boxModel.border.bottom}
          </div>
          <div className="col-start-2 row-start-5 flex items-center justify-center bg-teal-50">
            {styles["margin-bottom"] ?? boxModel.margin.bottom}
          </div>
          <div className="col-start-1 row-start-3 flex items-center justify-center bg-teal-50">
            {sideLabel("left")} {styles["margin-left"] ?? boxModel.margin.left}
          </div>
          <div className="col-start-3 row-start-3 flex items-center justify-center bg-teal-50">
            {sideLabel("right")} {styles["margin-right"] ?? boxModel.margin.right}
          </div>
        </div>
      </section>

      {renderEditableGroup("margin", linkedMargin, setLinkedMargin)}
      {renderEditableGroup("padding", linkedPadding, setLinkedPadding)}

      <section className="rounded-lg border border-slate-200 bg-panel p-4 shadow-panel">
        <h3 className="text-sm font-semibold">Border</h3>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs text-slate-700">
          {sides.map((side) => (
            <div className="rounded-md border border-slate-100 bg-slate-50 px-2 py-2" key={side}>
              <div className="text-[10px] font-semibold uppercase tracking-normal text-slate-500">
                {side}
              </div>
              <div className="mt-1">{boxModel.border[side]}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
