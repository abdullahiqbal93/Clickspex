import { SUPPORTED_STYLE_PROPERTIES } from "@clickspex/shared";
import { Check, Clipboard, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  isCssDeclarationValid,
  parseCssDeclarations,
  serializeCssDeclarations,
  type CssDeclaration,
} from "../../cssDeclarations";

type DraftDeclaration = CssDeclaration & { id: number };

type RawCssRuleEditorProps = {
  css: string;
  selector: string;
  applied: boolean;
  onChange: (css: string) => void;
  onClear: () => void;
  getValueSuggestions: (property: string) => readonly string[];
};

let nextDeclarationId = 1;

const toCssPropertyName = (property: string): string => {
  if (property === "cssFloat") return "float";

  return property
    .replace(/^webkit(?=[A-Z])/, "-webkit-")
    .replace(/^moz(?=[A-Z])/, "-moz-")
    .replace(/^ms(?=[A-Z])/, "-ms-")
    .replace(/[A-Z]/g, (character) => "-" + character.toLowerCase());
};

const getAvailableCssProperties = (): string[] => {
  const properties = new Set<string>(SUPPORTED_STYLE_PROPERTIES);

  if (typeof document === "undefined") {
    return [...properties];
  }

  const style = document.documentElement.style;
  const candidates = new Set([
    ...Object.keys(style),
    ...Object.getOwnPropertyNames(style),
    ...Object.getOwnPropertyNames(Object.getPrototypeOf(style) as object),
  ]);

  for (const candidate of candidates) {
    if (/^d+$/.test(candidate) || ["cssText", "length", "parentRule"].includes(candidate)) {
      continue;
    }

    const property = toCssPropertyName(candidate);
    if (/^-?[a-z][a-zd-]*$/i.test(property)) {
      properties.add(property);
    }
  }

  return [...properties].sort();
};

const AVAILABLE_CSS_PROPERTIES = getAvailableCssProperties();

const createDrafts = (css: string): DraftDeclaration[] => {
  const parsed = parseCssDeclarations(css);
  const declarations = parsed.length > 0 ? parsed : [{ property: "", value: "", enabled: true }];
  return declarations.map((declaration) => ({ ...declaration, id: nextDeclarationId++ }));
};

const colorValue = (value: string): string | null => {
  const normalized = value.trim().replace(/\s*!important\s*$/i, "");
  if (/^#[\da-f]{6}$/i.test(normalized)) return normalized;
  if (/^#[\da-f]{3}$/i.test(normalized)) {
    return `#${normalized
      .slice(1)
      .split("")
      .map((channel) => channel + channel)
      .join("")}`;
  }
  return null;
};

export const RawCssRuleEditor = ({
  applied,
  css,
  getValueSuggestions,
  onChange,
  onClear,
  selector,
}: RawCssRuleEditorProps) => {
  const [declarations, setDeclarations] = useState<DraftDeclaration[]>(() => createDrafts(css));
  const lastEmittedCss = useRef(css);
  const propertyInputs = useRef(new Map<number, HTMLInputElement>());
  const valueInputs = useRef(new Map<number, HTMLInputElement>());

  useEffect(() => {
    if (css !== lastEmittedCss.current) {
      lastEmittedCss.current = css;
      setDeclarations(createDrafts(css));
    }
  }, [css]);

  const commitDeclarations = (next: DraftDeclaration[]) => {
    setDeclarations(next);
    const serialized = serializeCssDeclarations(next);
    lastEmittedCss.current = serialized;
    onChange(serialized);
  };

  const updateDeclaration = (id: number, patch: Partial<CssDeclaration>) => {
    commitDeclarations(
      declarations.map((declaration) =>
        declaration.id === id ? { ...declaration, ...patch } : declaration,
      ),
    );
  };

  const addDeclaration = (afterId?: number) => {
    const declaration: DraftDeclaration = {
      id: nextDeclarationId++,
      property: "",
      value: "",
      enabled: true,
    };
    const index =
      afterId === undefined
        ? declarations.length
        : declarations.findIndex((item) => item.id === afterId) + 1;
    const next = [...declarations];
    next.splice(Math.max(0, index), 0, declaration);
    setDeclarations(next);
    window.requestAnimationFrame(() => propertyInputs.current.get(declaration.id)?.focus());
  };

  const removeDeclaration = (id: number) => {
    const next = declarations.filter((declaration) => declaration.id !== id);
    commitDeclarations(
      next.length > 0
        ? next
        : [{ id: nextDeclarationId++, property: "", value: "", enabled: true }],
    );
  };

  const copyRule = async () => {
    const body = serializeCssDeclarations(declarations)
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => `  ${line}`)
      .join("\n");
    await navigator.clipboard.writeText(`${selector} {\n${body}\n}`);
  };

  const populatedDeclarations = declarations.filter(
    (declaration) => declaration.property.trim() || declaration.value.trim(),
  );
  const invalidCount = populatedDeclarations.filter(
    (declaration) => declaration.enabled && !isCssDeclarationValid(declaration),
  ).length;

  return (
    <div className="overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm">
      <div className="flex min-h-9 items-center justify-between gap-2 border-b border-slate-300 bg-slate-50 px-2.5">
        <code
          className="min-w-0 truncate font-mono text-[11px] font-semibold text-slate-800"
          title={selector}
        >
          {selector}
        </code>
        <div className="flex shrink-0 items-center gap-0.5">
          {applied ? (
            <span className="mr-1 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700">
              <Check aria-hidden="true" size={11} />
              Applied
            </span>
          ) : null}
          <button
            aria-label="Copy CSS rule"
            className="inline-flex h-7 w-7 items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-blue-700"
            onClick={() => void copyRule().catch(() => undefined)}
            title="Copy CSS rule"
            type="button"
          >
            <Clipboard aria-hidden="true" size={12} />
          </button>
          <button
            aria-label="Clear declarations"
            className="inline-flex h-7 w-7 items-center justify-center text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30"
            disabled={populatedDeclarations.length === 0}
            onClick={onClear}
            title="Clear declarations"
            type="button"
          >
            <Trash2 aria-hidden="true" size={12} />
          </button>
        </div>
      </div>

      <div className="font-mono text-[11px] leading-5">
        <div className="px-2.5 py-1 text-slate-700">{"{"}</div>
        {declarations.map((declaration) => {
          const hasContent = declaration.property.trim() || declaration.value.trim();
          const valid = !hasContent || isCssDeclarationValid(declaration);
          const suggestions = getValueSuggestions(declaration.property.trim());
          const suggestionId =
            suggestions.length > 0 ? `raw-css-values-${declaration.id}` : undefined;
          const swatch = colorValue(declaration.value);

          return (
            <div
              className={`group grid min-h-6 grid-cols-[18px_minmax(72px,0.8fr)_8px_minmax(90px,1.2fr)_18px] items-center px-2.5 ${
                declaration.enabled ? "" : "opacity-55"
              }`}
              key={declaration.id}
            >
              <input
                aria-label={`Toggle ${declaration.property || "declaration"}`}
                checked={declaration.enabled}
                className="h-3 w-3 cursor-pointer accent-blue-600"
                onChange={(event) =>
                  updateDeclaration(declaration.id, { enabled: event.target.checked })
                }
                type="checkbox"
              />
              <input
                aria-label="CSS property"
                className={`min-w-0 bg-transparent px-0.5 font-mono outline-none ${
                  valid ? "text-purple-700" : "text-rose-700 underline decoration-wavy"
                } ${declaration.enabled ? "" : "line-through"}`}
                list="raw-css-property-names"
                onChange={(event) =>
                  updateDeclaration(declaration.id, { property: event.target.value })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    valueInputs.current.get(declaration.id)?.focus();
                  }
                }}
                placeholder="property"
                ref={(element) => {
                  if (element === null) propertyInputs.current.delete(declaration.id);
                  else propertyInputs.current.set(declaration.id, element);
                }}
                spellCheck={false}
                value={declaration.property}
              />
              <span className="text-center text-slate-500">:</span>
              <div className="flex min-w-0 items-center gap-1">
                {swatch === null ? null : (
                  <input
                    aria-label={`${declaration.property} color`}
                    className="h-3.5 w-3.5 shrink-0 cursor-pointer border border-slate-300 bg-transparent p-0"
                    onChange={(event) =>
                      updateDeclaration(declaration.id, { value: event.target.value })
                    }
                    type="color"
                    value={swatch}
                  />
                )}
                <input
                  aria-label="CSS value"
                  className={`min-w-0 flex-1 bg-transparent px-0.5 font-mono outline-none ${
                    valid ? "text-blue-700" : "text-rose-700 underline decoration-wavy"
                  } ${declaration.enabled ? "" : "line-through"}`}
                  list={suggestionId}
                  onChange={(event) =>
                    updateDeclaration(declaration.id, { value: event.target.value })
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addDeclaration(declaration.id);
                    }
                    if (
                      event.key === "Backspace" &&
                      declaration.property.length === 0 &&
                      declaration.value.length === 0 &&
                      declarations.length > 1
                    ) {
                      event.preventDefault();
                      const index = declarations.findIndex((item) => item.id === declaration.id);
                      const previous = declarations[index - 1];
                      removeDeclaration(declaration.id);
                      window.requestAnimationFrame(() =>
                        previous === undefined
                          ? undefined
                          : valueInputs.current.get(previous.id)?.focus(),
                      );
                    }
                  }}
                  placeholder="value"
                  ref={(element) => {
                    if (element === null) valueInputs.current.delete(declaration.id);
                    else valueInputs.current.set(declaration.id, element);
                  }}
                  spellCheck={false}
                  value={declaration.value}
                />
                {suggestionId === undefined ? null : (
                  <datalist id={suggestionId}>
                    {suggestions.map((suggestion) => (
                      <option key={suggestion} value={suggestion} />
                    ))}
                  </datalist>
                )}
              </div>
              <button
                aria-label={`Delete ${declaration.property || "declaration"}`}
                className="invisible inline-flex h-[18px] w-[18px] items-center justify-center text-slate-400 hover:text-rose-700 group-hover:visible focus:visible"
                onClick={() => removeDeclaration(declaration.id)}
                title="Delete declaration"
                type="button"
              >
                <Trash2 aria-hidden="true" size={10} />
              </button>
            </div>
          );
        })}
        <datalist id="raw-css-property-names">
          {AVAILABLE_CSS_PROPERTIES.map((property) => (
            <option key={property} value={property} />
          ))}
        </datalist>
        <button
          className="flex h-7 w-full items-center gap-1.5 px-[30px] text-left font-sans text-[10px] text-slate-500 hover:bg-blue-50 hover:text-blue-700"
          onClick={() => addDeclaration()}
          type="button"
        >
          <Plus aria-hidden="true" size={11} />
          Add declaration
        </button>
        <div className="px-2.5 pb-1 text-slate-700">{"}"}</div>
      </div>

      <div className="flex h-7 items-center justify-between border-t border-slate-200 bg-slate-50 px-2.5 text-[10px] text-slate-500">
        <span>{populatedDeclarations.length} declarations</span>
        {invalidCount > 0 ? (
          <span className="font-medium text-rose-700">{invalidCount} invalid</span>
        ) : (
          <span>Live preview</span>
        )}
      </div>
    </div>
  );
};
