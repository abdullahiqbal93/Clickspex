import { Clipboard, Redo2, RotateCcw, SlidersHorizontal, Undo2 } from "lucide-react";

import { sendMessageToActiveTab } from "../../chrome/messaging";
import { getCurrentStyleRecord, usePanelStore } from "../store";

import type { SupportedStyleProperty } from "@ui-buddy/shared";

type StyleField = {
  property: SupportedStyleProperty;
  label: string;
  group: string;
  options?: string[];
};

const STYLE_FIELDS: StyleField[] = [
  { property: "width", label: "Width", group: "Size" },
  { property: "height", label: "Height", group: "Size" },
  { property: "margin-top", label: "Margin top", group: "Spacing" },
  { property: "margin-right", label: "Margin right", group: "Spacing" },
  { property: "margin-bottom", label: "Margin bottom", group: "Spacing" },
  { property: "margin-left", label: "Margin left", group: "Spacing" },
  { property: "padding-top", label: "Padding top", group: "Spacing" },
  { property: "padding-right", label: "Padding right", group: "Spacing" },
  { property: "padding-bottom", label: "Padding bottom", group: "Spacing" },
  { property: "padding-left", label: "Padding left", group: "Spacing" },
  { property: "gap", label: "Gap", group: "Spacing" },
  { property: "color", label: "Text color", group: "Color" },
  { property: "background-color", label: "Background", group: "Color" },
  { property: "font-family", label: "Font family", group: "Typography" },
  { property: "font-size", label: "Font size", group: "Typography" },
  {
    property: "font-weight",
    label: "Font weight",
    group: "Typography",
    options: ["", "300", "400", "500", "600", "700", "800"],
  },
  { property: "line-height", label: "Line height", group: "Typography" },
  { property: "border-radius", label: "Radius", group: "Shape" },
  {
    property: "display",
    label: "Display",
    group: "Layout",
    options: ["", "block", "inline", "inline-block", "flex", "inline-flex", "grid", "none"],
  },
  {
    property: "flex-direction",
    label: "Direction",
    group: "Layout",
    options: ["", "row", "row-reverse", "column", "column-reverse"],
  },
  {
    property: "justify-content",
    label: "Justify",
    group: "Layout",
    options: [
      "",
      "flex-start",
      "center",
      "flex-end",
      "space-between",
      "space-around",
      "space-evenly",
    ],
  },
  {
    property: "align-items",
    label: "Align",
    group: "Layout",
    options: ["", "stretch", "flex-start", "center", "flex-end", "baseline"],
  },
  {
    property: "position",
    label: "Position",
    group: "Position",
    options: ["", "static", "relative", "absolute", "fixed", "sticky"],
  },
  { property: "top", label: "Top", group: "Position" },
  { property: "right", label: "Right", group: "Position" },
  { property: "bottom", label: "Bottom", group: "Position" },
  { property: "left", label: "Left", group: "Position" },
  { property: "opacity", label: "Opacity", group: "Effects" },
  { property: "transform", label: "Transform", group: "Effects" },
];

const groupedFields = STYLE_FIELDS.reduce<Record<string, StyleField[]>>((groups, field) => {
  groups[field.group] = [...(groups[field.group] ?? []), field];
  return groups;
}, {});

const cssColorToHex = (value: string): string | null => {
  const match = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);

  if (match === null) {
    return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : null;
  }

  const [, red, green, blue] = match;
  const channels = [red, green, blue].map((channel) =>
    Number.parseInt(channel ?? "0", 10)
      .toString(16)
      .padStart(2, "0"),
  );
  return `#${channels.join("")}`;
};

export const StylePanel = () => {
  const changes = usePanelStore((state) => state.changes);
  const redoStack = usePanelStore((state) => state.redoStack);
  const selectedElement = usePanelStore((state) => state.selectedElement);
  const styles = getCurrentStyleRecord({ changes, selectedElement });
  const prepareStyleChange = usePanelStore((state) => state.prepareStyleChange);
  const applyLocalStyleChange = usePanelStore((state) => state.applyLocalStyleChange);
  const resetElementChanges = usePanelStore((state) => state.resetElementChanges);
  const undoLocalChange = usePanelStore((state) => state.undoLocalChange);
  const redoLocalChange = usePanelStore((state) => state.redoLocalChange);
  const setError = usePanelStore((state) => state.setError);

  const commitChange = async (property: SupportedStyleProperty, afterValue: string) => {
    setError(null);
    const change = prepareStyleChange(property, afterValue);

    if (change === null) {
      return;
    }

    try {
      await sendMessageToActiveTab({ type: "APPLY_STYLE_CHANGE", payload: change });
      applyLocalStyleChange(change);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to apply style change.",
      );
    }
  };

  const undoChange = async () => {
    setError(null);

    if (changes.length === 0) {
      return;
    }

    try {
      await sendMessageToActiveTab({ type: "UNDO_CHANGE" });
      undoLocalChange();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to undo visual change.",
      );
    }
  };

  const redoChange = async () => {
    setError(null);

    if (redoStack.length === 0) {
      return;
    }

    try {
      await sendMessageToActiveTab({ type: "REDO_CHANGE" });
      redoLocalChange();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to redo visual change.",
      );
    }
  };
  const resetChanges = async () => {
    setError(null);

    try {
      await sendMessageToActiveTab({ type: "RESET_ELEMENT_CHANGES" });
      resetElementChanges();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to reset visual changes.",
      );
    }
  };

  if (selectedElement === null) {
    return (
      <div className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal aria-hidden="true" size={16} />
          Styles
        </div>
        <p className="mt-2 text-xs text-muted">Idle</p>
      </div>
    );
  }

  const copyGroupCss = async (group: string, fields: StyleField[]) => {
    const cssLines = fields
      .map((field) => {
        const val = styles[field.property];
        return val ? `  ${field.property}: ${val};` : null;
      })
      .filter(Boolean);

    if (cssLines.length === 0) return;

    const css = `${selectedElement.selector} {\n${cssLines.join("\n")}\n}`;
    try {
      await navigator.clipboard.writeText(css);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-3 shadow-card">
        <div>
          <h2 className="text-sm font-semibold">Styles</h2>
          <p className="mt-1 text-xs text-muted">{changes.length} changes</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={changes.length === 0}
            onClick={() => void undoChange()}
            title="Undo"
            type="button"
          >
            <Undo2 aria-hidden="true" size={14} />
          </button>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={redoStack.length === 0}
            onClick={() => void redoChange()}
            title="Redo"
            type="button"
          >
            <Redo2 aria-hidden="true" size={14} />
          </button>
          <button
            className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => void copyGroupCss("All", STYLE_FIELDS)}
            title="Copy all modified styles"
            type="button"
          >
            <Clipboard aria-hidden="true" size={14} />
            Copy All
          </button>
          <button
            className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => void resetChanges()}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={14} />
            Reset
          </button>
        </div>
      </div>

      {Object.entries(groupedFields).map(([group, fields]) => (
        <section
          className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card"
          key={group}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{group}</h3>
            <button
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              onClick={() => void copyGroupCss(group, fields)}
              title={`Copy ${group} CSS`}
              type="button"
            >
              <Clipboard aria-hidden="true" size={12} />
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {fields.map((field) => {
              const value = styles[field.property] ?? "";
              const hexColor =
                field.property === "color" || field.property === "background-color"
                  ? cssColorToHex(value)
                  : null;

              return (
                <label
                  className="grid grid-cols-[96px_minmax(0,1fr)] items-center gap-3"
                  key={field.property}
                >
                  <span className="text-xs font-medium text-slate-500">{field.label}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    {hexColor !== null ? (
                      <input
                        aria-label={`${field.label} swatch`}
                        className="h-8 w-9 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0"
                        onChange={(event) => void commitChange(field.property, event.target.value)}
                        type="color"
                        value={hexColor}
                      />
                    ) : null}
                    {field.options === undefined ? (
                      <input
                        className="h-8 min-w-0 flex-1 rounded-md border border-border px-2 text-xs outline-none transition focus:border-accent focus:ring-2 focus:ring-blue-100"
                        onChange={(event) => void commitChange(field.property, event.target.value)}
                        value={value}
                      />
                    ) : (
                      <select
                        className="h-8 min-w-0 flex-1 rounded-md border border-border bg-white px-2 text-xs outline-none transition focus:border-accent focus:ring-2 focus:ring-blue-100"
                        onChange={(event) => void commitChange(field.property, event.target.value)}
                        value={value}
                      >
                        {field.options.map((option) => (
                          <option key={option || "initial"} value={option}>
                            {option || "Initial"}
                          </option>
                        ))}
                      </select>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};
