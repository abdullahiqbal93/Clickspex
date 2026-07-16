import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { sendMessageToActiveTab } from "../../chrome/messaging";
import { usePanelStore } from "../store";

import type { ElementSnapshot } from "@ui-buddy/shared";

type AttributeEditorProps = {
  element: ElementSnapshot;
};

export const AttributeEditor = ({ element }: AttributeEditorProps) => {
  const setError = usePanelStore((state) => state.setError);
  const [drafts, setDrafts] = useState<Record<string, string>>(element.attributes);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");

  useEffect(() => {
    setDrafts(element.attributes);
  }, [element.selector, element.attributes]);

  const updateAttribute = async (name: string, value: string | null) => {
    setError(null);

    if (
      ["id", "class"].includes(name.trim().toLowerCase()) &&
      value !== element.attributes[name] &&
      !window.confirm(
        `${name} is an identity attribute. Changing it can affect selectors, styles, tests, and source mapping. Continue?`,
      )
    ) {
      setDrafts(element.attributes);
      return;
    }

    try {
      await sendMessageToActiveTab({
        type: "UPDATE_ELEMENT_ATTRIBUTE",
        payload: { selector: element.selector, name, value },
      });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to update this attribute.",
      );
      setDrafts(element.attributes);
    }
  };

  const addAttribute = async () => {
    const name = newName.trim();
    if (name.length === 0) return;
    await updateAttribute(name, newValue);
    setNewName("");
    setNewValue("");
  };

  const entries = Object.entries(element.attributes);

  return (
    <section className="ub-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Attributes</h3>
          <p className="text-[10px] text-muted">
            Edit values inline. Changes support undo and export.
          </p>
        </div>
        <span className="ub-chip">{entries.length}</span>
      </div>
      <div className="max-h-64 overflow-auto">
        {entries.length === 0 ? (
          <div className="px-3 py-4 text-center text-2xs text-muted">
            No attributes on this element.
          </div>
        ) : (
          entries.map(([name, originalValue]) => (
            <div
              className="group grid grid-cols-[92px_minmax(0,1fr)_28px] items-center gap-2 border-b border-line/70 px-3 py-1.5 last:border-b-0 hover:bg-panel-soft"
              key={name}
            >
              <label
                className="truncate font-mono text-[10px] font-semibold text-fuchsia-700"
                htmlFor={"attribute-" + name}
                title={name}
              >
                {name}
              </label>
              <input
                className="min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 font-mono text-[10px] text-slate-700 outline-none transition focus:border-accent focus:bg-panel"
                id={"attribute-" + name}
                onBlur={(event) => {
                  if (event.target.value !== originalValue) {
                    void updateAttribute(name, event.target.value);
                  }
                }}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [name]: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                  if (event.key === "Escape") {
                    setDrafts((current) => ({ ...current, [name]: originalValue }));
                    event.currentTarget.blur();
                  }
                }}
                spellCheck={false}
                value={drafts[name] ?? ""}
              />
              <button
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 opacity-0 transition hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100"
                onClick={() => void updateAttribute(name, null)}
                title={"Remove " + name}
                type="button"
              >
                <Trash2 aria-hidden="true" size={12} />
              </button>
            </div>
          ))
        )}
      </div>
      <div className="grid grid-cols-[92px_minmax(0,1fr)_32px] items-center gap-2 border-t border-line bg-panel-soft px-3 py-2">
        <input
          aria-label="New attribute name"
          className="min-w-0 rounded-md border border-line bg-panel px-2 py-1.5 font-mono text-[10px] outline-none focus:border-accent"
          onChange={(event) => setNewName(event.target.value)}
          placeholder="attribute"
          value={newName}
        />
        <input
          aria-label="New attribute value"
          className="min-w-0 rounded-md border border-line bg-panel px-2 py-1.5 font-mono text-[10px] outline-none focus:border-accent"
          onChange={(event) => setNewValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void addAttribute();
          }}
          placeholder="value"
          value={newValue}
        />
        <button
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-accent text-white transition hover:bg-accent-hover disabled:opacity-40"
          disabled={newName.trim().length === 0}
          onClick={() => void addAttribute()}
          title="Add attribute"
          type="button"
        >
          <Plus aria-hidden="true" size={13} />
        </button>
      </div>
    </section>
  );
};
