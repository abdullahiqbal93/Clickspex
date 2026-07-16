import { Link2, Minus, Plus, Unlink2 } from "lucide-react";
import { useState } from "react";

import { sendMessageToActiveTab } from "../../chrome/messaging";
import { getCurrentStyleRecord, usePanelStore } from "../store";

import { CommitInput } from "./CommitInput";

import type { StyleChange, SupportedStyleProperty } from "@clickspex/shared";

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
  const changes = usePanelStore((state) => state.changes);
  const selectedElement = usePanelStore((state) => state.selectedElement);
  const styles = getCurrentStyleRecord({ changes, selectedElement });
  const prepareStyleChange = usePanelStore((state) => state.prepareStyleChange);
  const applyLocalStyleChange = usePanelStore((state) => state.applyLocalStyleChange);
  const setError = usePanelStore((state) => state.setError);

  const applyChanges = async (changes: StyleChange[]) => {
    for (const change of changes) {
      await sendMessageToActiveTab({ type: "APPLY_STYLE_CHANGE", payload: change });
      applyLocalStyleChange(change);
    }
  };

  const parseLength = (value: string): { amount: number; unit: string } => {
    const match = value.trim().match(/^(-?\d+(?:\.\d+)?)([a-z%]*)$/i);

    if (match === null) {
      return { amount: 0, unit: "px" };
    }

    return {
      amount: Number.parseFloat(match[1] ?? "0"),
      unit: match[2]?.length ? match[2] : "px",
    };
  };

  const nudgeGroup = async (group: BoxGroup, delta: number) => {
    if (selectedElement === null) {
      return;
    }

    setError(null);
    const nextChanges = sides
      .map((side) => {
        const property = propertyFor(group, side);
        const currentValue = styles[property] ?? selectedElement.boxModel[group][side];
        const parsed = parseLength(currentValue);
        // Padding cannot be negative, but margins can.
        const nextAmount =
          group === "padding" ? Math.max(0, parsed.amount + delta) : parsed.amount + delta;
        return prepareStyleChange(property, `${nextAmount}${parsed.unit}`);
      })
      .filter((change): change is StyleChange => change !== null);

    if (nextChanges.length === 0) {
      return;
    }

    try {
      await applyChanges(nextChanges);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to nudge spacing.");
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
      <div className="cs-card p-4">
        <h2 className="text-sm font-semibold tracking-tight">Box model</h2>
        <p className="mt-1.5 text-2xs text-muted">Select an element to inspect its box model.</p>
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
    <section className="cs-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold capitalize tracking-tight">{group}</h3>
        <button
          className={`cs-icon-btn ${linked ? "cs-icon-btn-active" : ""}`}
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
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {sides.map((side) => {
          const property = propertyFor(group, side);
          const value = styles[property] ?? selectedElement.boxModel[group][side];

          return (
            <label className="space-y-1" key={property}>
              <span className="cs-heading">{side}</span>
              <CommitInput
                className="cs-input h-8 font-mono"
                onCommit={(nextValue) => void commitSide(group, side, nextValue, linked)}
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
      <section className="cs-card p-4">
        <h2 className="text-sm font-semibold tracking-tight">Box model</h2>
        <div className="mt-3.5 grid grid-cols-[44px_1fr_44px] grid-rows-[32px_32px_1fr_32px_32px] overflow-hidden rounded-xl border border-line text-center font-mono text-[10px] font-semibold tabular-nums text-slate-600">
          <div className="col-start-2 flex items-center justify-center bg-teal-50">
            {styles["margin-top"] ?? boxModel.margin.top}
          </div>
          <div className="col-start-2 row-start-2 flex items-center justify-center bg-indigo-50">
            {boxModel.border.top}
          </div>
          <div className="col-start-2 row-start-3 grid min-h-28 grid-cols-[40px_1fr_40px] grid-rows-[24px_minmax(64px,1fr)_24px] bg-amber-50">
            <div className="col-start-2 flex items-center justify-center">
              {styles["padding-top"] ?? boxModel.padding.top}
            </div>
            <div className="col-start-1 row-start-2 flex items-center justify-center">
              {sideLabel("left")} {styles["padding-left"] ?? boxModel.padding.left}
            </div>
            <div className="col-start-2 row-start-2 flex items-center justify-center rounded-xl border border-amber-200 bg-panel text-ink">
              {contentWidth} x {contentHeight}
            </div>
            <div className="col-start-3 row-start-2 flex items-center justify-center">
              {sideLabel("right")} {styles["padding-right"] ?? boxModel.padding.right}
            </div>
            <div className="col-start-2 row-start-3 flex items-center justify-center">
              {styles["padding-bottom"] ?? boxModel.padding.bottom}
            </div>
          </div>
          <div className="col-start-2 row-start-4 flex items-center justify-center bg-indigo-50">
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

      <section className="cs-card p-4">
        <h3 className="text-sm font-semibold tracking-tight">Spacing nudges</h3>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <button className="cs-btn" onClick={() => void nudgeGroup("margin", 4)} type="button">
            <Plus aria-hidden="true" size={13} />
            Margin
          </button>
          <button className="cs-btn" onClick={() => void nudgeGroup("margin", -4)} type="button">
            <Minus aria-hidden="true" size={13} />
            Margin
          </button>
          <button className="cs-btn" onClick={() => void nudgeGroup("padding", 4)} type="button">
            <Plus aria-hidden="true" size={13} />
            Padding
          </button>
          <button className="cs-btn" onClick={() => void nudgeGroup("padding", -4)} type="button">
            <Minus aria-hidden="true" size={13} />
            Padding
          </button>
        </div>
      </section>

      {renderEditableGroup("margin", linkedMargin, setLinkedMargin)}
      {renderEditableGroup("padding", linkedPadding, setLinkedPadding)}

      <section className="cs-card p-4">
        <h3 className="text-sm font-semibold tracking-tight">Border</h3>
        <div className="mt-2.5 grid grid-cols-4 gap-1.5 text-center text-xs text-ink">
          {sides.map((side) => (
            <div className="rounded-xl bg-slate-50 px-2 py-2" key={side}>
              <div className="cs-heading">{side}</div>
              <div className="mt-1 font-mono tabular-nums">{boxModel.border[side]}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
