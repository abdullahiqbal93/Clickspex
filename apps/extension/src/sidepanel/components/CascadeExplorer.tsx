import {
  STYLE_RESPONSIVE_TARGET_DEFINITIONS,
  SUPPORTED_STYLE_PROPERTIES,
  isCssPropertyName,
  isSupportedStyleProperty,
  type MatchedStyleDeclaration,
  type MatchedStyleRule,
  type MatchedStylesResult,
  type StyleChange,
  type StyleResponsiveTarget,
  type StyleTargetState,
  type SupportedStyleProperty,
} from "@ui-buddy/shared";
import {
  Braces,
  Check,
  CircleDot,
  Clipboard,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Variable,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { sendMessageToActiveTab } from "../../chrome/messaging";

import { CommitInput } from "./CommitInput";

type CascadeExplorerProps = {
  changes: StyleChange[];
  result: MatchedStylesResult | null;
  responsiveTarget: StyleResponsiveTarget;
  selectedSelector: string;
  scopeLabel: string;
  targetState: StyleTargetState;
  onCommit: (property: string, value: string) => Promise<void>;
  onPickProperty: (property: SupportedStyleProperty) => void;
};

type ExplorerView = "rules" | "computed" | "variables";

const VIEW_OPTIONS: Array<{
  id: ExplorerView;
  label: string;
  icon: typeof Braces;
}> = [
  { id: "rules", label: "Rules", icon: Braces },
  { id: "computed", label: "Computed", icon: CircleDot },
  { id: "variables", label: "Tokens", icon: Variable },
];

const colorPreview = (property: string, value: string): string | null => {
  if (
    !property.includes("color") &&
    property !== "fill" &&
    property !== "stroke" &&
    !value.startsWith("#") &&
    !value.startsWith("rgb") &&
    !value.startsWith("hsl")
  ) {
    return null;
  }

  return value.length > 0 ? value : null;
};

const specificityLabel = ([ids, classes, types]: [number, number, number]): string =>
  `${ids},${classes},${types}`;

const declarationMatches = (
  declaration: MatchedStyleDeclaration,
  normalizedQuery: string,
): boolean =>
  normalizedQuery.length === 0 ||
  declaration.property.toLowerCase().includes(normalizedQuery) ||
  declaration.value.toLowerCase().includes(normalizedQuery);
export const isCssDeclarationValueValid = (property: string, value: string): boolean => {
  const normalizedProperty = property.trim();

  return (
    isCssPropertyName(normalizedProperty) &&
    value.trim().length > 0 &&
    (typeof CSS === "undefined" || CSS.supports(normalizedProperty, value))
  );
};

export const getRuleResponsiveTarget = (rule: MatchedStyleRule): StyleResponsiveTarget => {
  const conditional = rule.conditional?.toLowerCase() ?? "";

  if (!conditional.includes("@media")) {
    return "all";
  }

  const minWidth = /min-width:\s*(\d+)px/.exec(conditional);
  const maxWidth = /max-width:\s*(\d+)px/.exec(conditional);
  const minimum = minWidth === null ? null : Number.parseInt(minWidth[1] ?? "", 10);
  const maximum = maxWidth === null ? null : Number.parseInt(maxWidth[1] ?? "", 10);

  if (minimum !== null && minimum >= 1024) {
    return "desktop";
  }

  if (minimum !== null && minimum >= 768 && maximum !== null && maximum <= 1023) {
    return "tablet";
  }

  if (minimum === null && maximum !== null && maximum <= 767) {
    return "mobile";
  }

  return "all";
};
export const ruleAppliesToResponsiveTarget = (
  rule: MatchedStyleRule,
  target: StyleResponsiveTarget,
): boolean => {
  const conditional = rule.conditional?.toLowerCase() ?? "";
  const hasMediaQuery = conditional.includes("@media");

  if (!hasMediaQuery) {
    return true;
  }

  if (target === "all") {
    return false;
  }

  const representativeWidth: Record<Exclude<StyleResponsiveTarget, "all">, number> = {
    mobile: 375,
    tablet: 800,
    desktop: 1280,
  };
  const width = representativeWidth[target];
  const minWidth = /min-width:\s*(\d+)px/.exec(conditional);
  const maxWidth = /max-width:\s*(\d+)px/.exec(conditional);
  const minimum = minWidth === null ? null : Number.parseInt(minWidth[1] ?? "", 10);
  const maximum = maxWidth === null ? null : Number.parseInt(maxWidth[1] ?? "", 10);

  return (minimum === null || width >= minimum) && (maximum === null || width <= maximum);
};

export const buildLiveOverrideRule = (
  changes: StyleChange[],
  selector: string,
  targetState: StyleTargetState,
  responsiveTarget: StyleResponsiveTarget,
): MatchedStyleRule | null => {
  const declarations = new Map<string, string>();

  for (const change of changes) {
    if (
      change.selector !== selector ||
      (change.state ?? "base") !== targetState ||
      (change.responsiveTarget ?? "all") !== responsiveTarget
    ) {
      continue;
    }

    if (change.afterValue.trim().length === 0) {
      declarations.delete(change.property);
    } else {
      declarations.set(change.property, change.afterValue);
    }
  }

  if (declarations.size === 0) {
    return null;
  }

  const responsiveDefinition = STYLE_RESPONSIVE_TARGET_DEFINITIONS.find(
    (definition) => definition.target === responsiveTarget,
  );

  return {
    id: `live-overrides-${targetState}-${responsiveTarget}`,
    selector: targetState === "base" ? selector : `${selector}:${targetState}`,
    specificity: [1000, 0, 0],
    origin: "inspector",
    source: { label: "UI Buddy live override", url: null },
    declarations: Array.from(declarations, ([property, value]) => ({
      property,
      value,
      important: true,
      active: true,
      overridden: false,
      inherited: false,
    })),
    active: true,
    conditional:
      responsiveDefinition?.mediaQuery === null || responsiveDefinition?.mediaQuery === undefined
        ? null
        : `@media ${responsiveDefinition.mediaQuery}`,
    inheritedFrom: null,
  };
};

const RuleDeclaration = ({
  declaration,
  rule,
  onCommit,
  onPickProperty,
}: {
  declaration: MatchedStyleDeclaration;
  rule: MatchedStyleRule;
  onCommit: CascadeExplorerProps["onCommit"];
  onPickProperty: CascadeExplorerProps["onPickProperty"];
}) => {
  const editableProperty = isCssPropertyName(declaration.property) ? declaration.property : null;
  const visualProperty = isSupportedStyleProperty(declaration.property)
    ? declaration.property
    : null;
  const muted = declaration.overridden || !declaration.active;
  const preview = colorPreview(declaration.property, declaration.value);

  return (
    <div
      className={`group grid grid-cols-[14px_minmax(92px,0.72fr)_minmax(0,1fr)] items-center gap-1.5 px-3 py-1.5 transition-colors hover:bg-accent-softer/50 ${
        muted ? "opacity-55" : ""
      }`}
    >
      <span
        aria-label={
          !declaration.active
            ? "Inactive condition"
            : declaration.overridden
              ? "Overridden"
              : "Cascade winner"
        }
        className={`mx-auto h-2 w-2 rounded-full ${
          !declaration.active
            ? "border border-slate-300 bg-transparent"
            : declaration.overridden
              ? "bg-slate-300"
              : "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.12)]"
        }`}
        title={
          !declaration.active
            ? "The selector or condition is not active right now"
            : declaration.overridden
              ? "Another declaration wins the cascade"
              : "Winning declaration"
        }
      />
      <button
        className={`truncate text-left font-mono text-[10px] font-semibold ${
          muted ? "text-slate-500 line-through" : "text-violet-700"
        }`}
        disabled={visualProperty === null}
        onClick={() => {
          if (visualProperty !== null) {
            onPickProperty(visualProperty);
          }
        }}
        title={
          visualProperty !== null
            ? `Open ${declaration.property} in the property lab`
            : `${declaration.property} is visible here but not yet supported by the visual editor`
        }
        type="button"
      >
        {declaration.property}
      </button>
      <div className="flex min-w-0 items-center gap-1">
        {preview === null ? null : (
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 rounded border border-black/10 shadow-inner"
            style={{ background: preview }}
          />
        )}
        {editableProperty !== null ? (
          <CommitInput
            aria-label={`Override ${declaration.property} from ${rule.selector}`}
            className={`min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 font-mono text-[10px] outline-none transition focus:border-accent focus:bg-white focus:ring-2 focus:ring-accent-ring/40 ${
              muted ? "line-through" : "text-slate-700"
            }`}
            onCommit={(value) => void onCommit(editableProperty, value)}
            value={declaration.value}
          />
        ) : (
          <code
            className={`min-w-0 flex-1 truncate px-1 text-[10px] ${
              muted ? "line-through" : "text-slate-700"
            }`}
            title={declaration.value}
          >
            {declaration.value}
          </code>
        )}
        {declaration.important ? (
          <span
            className="shrink-0 rounded bg-rose-50 px-1 py-0.5 font-mono text-[8px] font-bold text-rose-600"
            title="This declaration uses !important"
          >
            !important
          </span>
        ) : null}
      </div>
    </div>
  );
};

const RuleAddDeclaration = ({
  rule,
  onCommit,
}: {
  rule: MatchedStyleRule;
  onCommit: CascadeExplorerProps["onCommit"];
}) => {
  const [adding, setAdding] = useState(false);
  const [property, setProperty] = useState("");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const propertyValid = property.length === 0 || isCssPropertyName(property.trim());
  const declarationValid = isCssDeclarationValueValid(property, value);

  const close = () => {
    setAdding(false);
    setProperty("");
    setValue("");
  };

  const submit = async () => {
    if (!declarationValid || submitting) {
      return;
    }

    setSubmitting(true);

    try {
      await onCommit(property.trim(), value);
      close();
    } finally {
      setSubmitting(false);
    }
  };

  if (!adding) {
    return (
      <button
        className="group flex w-full items-center gap-1.5 border-t border-dashed border-line px-3 py-2 text-left text-[9px] font-medium text-slate-400 transition-colors hover:bg-violet-50/60 hover:text-violet-700"
        onClick={() => setAdding(true)}
        title={`Add a live override while inspecting ${rule.selector}`}
        type="button"
      >
        <Plus aria-hidden="true" size={11} />
        Add declaration
        <span className="ml-auto opacity-0 transition-opacity group-hover:opacity-100">
          creates live override
        </span>
      </button>
    );
  }

  return (
    <form
      className="border-t border-dashed border-violet-200 bg-violet-50/60 px-3 py-2"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="grid grid-cols-[14px_minmax(92px,0.72fr)_minmax(0,1fr)_52px] items-center gap-1.5">
        <span className="mx-auto h-2 w-2 rounded-full border border-violet-300 bg-white" />
        <input
          aria-label={`New CSS property for ${rule.selector}`}
          aria-autocomplete="list"
          aria-invalid={!propertyValid}
          autoFocus
          className="min-w-0 rounded-md border border-violet-200 bg-white px-1.5 py-1 font-mono text-[10px] text-violet-700 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
          list="css-property-suggestions"
          onChange={(event) => setProperty(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              close();
            }
          }}
          placeholder="property"
          spellCheck={false}
          value={property}
        />
        <input
          aria-label={`Value for new ${property || "CSS property"}`}
          aria-invalid={value.length > 0 && !declarationValid}
          className="min-w-0 rounded-md border border-violet-200 bg-white px-1.5 py-1 font-mono text-[10px] text-slate-700 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              close();
            }
          }}
          placeholder="value"
          spellCheck={false}
          value={value}
        />
        <span className="flex items-center justify-end">
          <button
            aria-label="Apply declaration"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-violet-600 text-white transition hover:bg-violet-700 disabled:opacity-35"
            disabled={!declarationValid || submitting}
            title="Apply as live override"
            type="submit"
          >
            <Check aria-hidden="true" size={11} />
          </button>
          <button
            aria-label="Cancel new declaration"
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-white hover:text-slate-700"
            onClick={close}
            title="Cancel"
            type="button"
          >
            <X aria-hidden="true" size={11} />
          </button>
        </span>
      </div>
      {!propertyValid ? (
        <p className="mt-1 pl-5 text-[9px] text-rose-600">Enter a valid CSS property name.</p>
      ) : null}
    </form>
  );
};

const RuleCard = ({
  rule,
  declarations,
  onCommit,
  onPickProperty,
}: {
  rule: MatchedStyleRule;
  declarations: MatchedStyleDeclaration[];
  onCommit: CascadeExplorerProps["onCommit"];
  onPickProperty: CascadeExplorerProps["onPickProperty"];
}) => (
  <article
    className={`border-b border-line/80 last:border-b-0 ${rule.active ? "" : "bg-slate-50/60"}`}
  >
    <div className="flex items-start justify-between gap-2 px-3 py-2">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          {rule.origin === "inspector" ? (
            <span
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-violet-100 text-violet-600"
              title="Live override created in UI Buddy"
            >
              <Sparkles aria-hidden="true" size={9} />
            </span>
          ) : null}
          <code
            className={`min-w-0 break-all font-mono text-[10px] font-bold leading-4 ${
              rule.active ? "text-slate-800" : "text-slate-400"
            }`}
          >
            {rule.selector}
          </code>
        </div>
        {rule.conditional === null ? null : (
          <div className="mt-1 inline-flex max-w-full items-center rounded-md bg-sky-50 px-1.5 py-0.5 font-mono text-[9px] text-sky-700">
            <span className="truncate">{rule.conditional}</span>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
        <span
          className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[8px] font-semibold text-slate-500"
          title="Selector specificity (IDs, classes, elements)"
        >
          {specificityLabel(rule.specificity)}
        </span>
        <span
          className="max-w-24 truncate text-right font-mono text-[9px] text-slate-400"
          title={rule.source.url ?? rule.source.label}
        >
          {rule.source.label}
        </span>
      </div>
    </div>
    <div className="pb-1">
      {declarations.map((declaration, index) => (
        <RuleDeclaration
          declaration={declaration}
          key={`${declaration.property}-${index}`}
          onCommit={onCommit}
          onPickProperty={onPickProperty}
          rule={rule}
        />
      ))}
      <RuleAddDeclaration onCommit={onCommit} rule={rule} />
    </div>
  </article>
);

const ValueTable = ({
  entries,
  emptyLabel,
}: {
  entries: Array<[string, string]>;
  emptyLabel: string;
}) => {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (property: string, value: string) => {
    try {
      await navigator.clipboard.writeText(`${property}: ${value};`);
      setCopied(property);
      window.setTimeout(() => setCopied(null), 900);
    } catch {
      // Clipboard permissions can be unavailable on restricted pages.
    }
  };

  if (entries.length === 0) {
    return <p className="px-4 py-8 text-center text-xs text-muted">{emptyLabel}</p>;
  }

  return (
    <div className="divide-y divide-line/70">
      {entries.map(([property, value]) => {
        const preview = colorPreview(property, value);

        return (
          <button
            className="group grid w-full grid-cols-[minmax(105px,0.78fr)_minmax(0,1fr)_22px] items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent-softer/60"
            key={property}
            onClick={() => void copy(property, value)}
            title="Copy declaration"
            type="button"
          >
            <span className="truncate font-mono text-[10px] font-semibold text-violet-700">
              {property}
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              {preview === null ? null : (
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded border border-black/10 shadow-inner"
                  style={{ background: preview }}
                />
              )}
              <code className="truncate text-[10px] text-slate-600" title={value}>
                {value || "-"}
              </code>
            </span>
            {copied === property ? (
              <Check aria-hidden="true" className="text-emerald-500" size={12} />
            ) : (
              <Clipboard
                aria-hidden="true"
                className="text-slate-300 opacity-0 transition-opacity group-hover:opacity-100"
                size={11}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};

export const CascadeExplorer = ({
  changes,
  result,
  responsiveTarget,
  selectedSelector,
  scopeLabel,
  targetState,
  onCommit,
  onPickProperty,
}: CascadeExplorerProps) => {
  const [view, setView] = useState<ExplorerView>("rules");
  const [query, setQuery] = useState("");
  const [newProperty, setNewProperty] = useState("");
  const [newValue, setNewValue] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (refreshTimer.current !== null) {
        window.clearTimeout(refreshTimer.current);
      }
    },
    [],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const displayRules = useMemo(() => {
    const baseLiveRule = buildLiveOverrideRule(changes, selectedSelector, targetState, "all");
    const responsiveLiveRule =
      responsiveTarget === "all"
        ? null
        : buildLiveOverrideRule(changes, selectedSelector, targetState, responsiveTarget);
    const responsiveProperties = new Set(
      responsiveLiveRule?.declarations.map((declaration) => declaration.property) ?? [],
    );
    const visibleBaseLiveRule =
      baseLiveRule === null
        ? null
        : {
            ...baseLiveRule,
            declarations: baseLiveRule.declarations.map((declaration) =>
              responsiveProperties.has(declaration.property)
                ? { ...declaration, overridden: true }
                : declaration,
            ),
          };
    const liveRules = [responsiveLiveRule, visibleBaseLiveRule].filter(
      (rule): rule is MatchedStyleRule => rule !== null,
    );
    const liveProperties = new Set(
      liveRules.flatMap((rule) =>
        rule.declarations
          .filter((declaration) => !declaration.overridden)
          .map((declaration) => declaration.property),
      ),
    );
    const authoredRules = (result?.rules ?? [])
      .filter(
        (rule) =>
          rule.origin !== "inspector" && ruleAppliesToResponsiveTarget(rule, responsiveTarget),
      )
      .map((rule) => ({
        ...rule,
        declarations: rule.declarations.map((declaration) =>
          liveProperties.has(declaration.property)
            ? { ...declaration, overridden: true }
            : declaration,
        ),
      }));

    return [...liveRules, ...authoredRules];
  }, [changes, responsiveTarget, result, selectedSelector, targetState]);

  const propertySuggestions = useMemo(
    () =>
      [
        ...new Set([
          ...SUPPORTED_STYLE_PROPERTIES,
          ...Object.keys(result?.computed ?? {}),
          ...(result?.rules ?? []).flatMap((rule) =>
            rule.declarations.map((declaration) => declaration.property),
          ),
        ]),
      ].sort((left, right) => left.localeCompare(right)),
    [result],
  );

  const normalizedNewProperty = newProperty.trim();
  const newPropertyValid = isCssPropertyName(normalizedNewProperty);
  const newValueValid = isCssDeclarationValueValid(normalizedNewProperty, newValue);

  const filteredRules = useMemo(() => {
    return displayRules.flatMap((rule) => {
      const ruleMatches =
        normalizedQuery.length === 0 ||
        rule.selector.toLowerCase().includes(normalizedQuery) ||
        rule.source.label.toLowerCase().includes(normalizedQuery) ||
        rule.conditional?.toLowerCase().includes(normalizedQuery) === true;
      const declarations = ruleMatches
        ? rule.declarations
        : rule.declarations.filter((declaration) =>
            declarationMatches(declaration, normalizedQuery),
          );

      return declarations.length === 0 ? [] : [{ rule, declarations }];
    });
  }, [displayRules, normalizedQuery]);

  const valueEntries = useMemo(() => {
    const record = view === "variables" ? (result?.variables ?? {}) : (result?.computed ?? {});

    return Object.entries(record)
      .filter(
        ([property, value]) =>
          normalizedQuery.length === 0 ||
          property.toLowerCase().includes(normalizedQuery) ||
          value.toLowerCase().includes(normalizedQuery),
      )
      .sort(([left], [right]) => left.localeCompare(right));
  }, [normalizedQuery, result, view]);

  const refresh = async () => {
    setRefreshing(true);

    try {
      await sendMessageToActiveTab({ type: "GET_MATCHED_STYLES" });
    } finally {
      window.setTimeout(() => setRefreshing(false), 350);
    }
  };

  const scheduleRefresh = () => {
    if (refreshTimer.current !== null) {
      window.clearTimeout(refreshTimer.current);
    }

    refreshTimer.current = window.setTimeout(() => void refresh(), 300);
  };

  const addDeclaration = async () => {
    if (!newPropertyValid || !newValueValid) {
      return;
    }

    await onCommit(normalizedNewProperty, newValue);
    setNewValue("");
    scheduleRefresh();
  };

  let previousInheritedSelector: string | null = null;

  return (
    <section className="ub-card overflow-hidden">
      <div className="border-b border-line bg-gradient-to-b from-white to-panel-soft/70 px-3 pt-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                <Braces aria-hidden="true" size={14} />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold tracking-tight text-ink">Cascade studio</h3>
                <p
                  className="truncate font-mono text-[9px] text-slate-400"
                  title={selectedSelector}
                >
                  {scopeLabel}
                </p>
              </div>
            </div>
          </div>
          <button
            className="ub-icon-btn h-7 w-7"
            onClick={() => void refresh()}
            title="Re-read matched styles from the page"
            type="button"
          >
            <RefreshCw aria-hidden="true" className={refreshing ? "animate-spin" : ""} size={12} />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-0.5">
            {VIEW_OPTIONS.map((option) => {
              const Icon = option.icon;

              return (
                <button
                  className={`relative flex h-8 items-center gap-1.5 px-2.5 text-[10px] font-semibold transition-colors ${
                    view === option.id ? "text-violet-700" : "text-muted hover:text-ink"
                  }`}
                  key={option.id}
                  onClick={() => setView(option.id)}
                  type="button"
                >
                  <Icon aria-hidden="true" size={11} />
                  {option.label}
                  {view === option.id ? (
                    <span className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-violet-500" />
                  ) : null}
                </button>
              );
            })}
          </div>
          <span className="text-[9px] text-slate-400">
            {view === "rules" ? `${displayRules.length} matched` : `${valueEntries.length} values`}
          </span>
        </div>
      </div>

      <div className="border-b border-line bg-white p-2">
        <label className="relative block" htmlFor="cascade-search">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
            size={12}
          />
          <input
            className="ub-input h-8 rounded-xl bg-panel-soft py-1.5 pl-7 pr-2 text-[10px]"
            id="cascade-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              view === "rules"
                ? "Filter selectors, sources, properties, values..."
                : "Filter properties and values..."
            }
            type="search"
            value={query}
          />
        </label>
      </div>

      {view === "rules" ? (
        <>
          <div className="grid grid-cols-[minmax(105px,0.75fr)_minmax(0,1fr)_30px] items-center gap-1.5 border-b border-line bg-violet-50/60 p-2">
            <input
              aria-label="CSS property to add"
              aria-autocomplete="list"
              aria-invalid={newProperty.length > 0 && !newPropertyValid}
              className="min-w-0 rounded-lg border border-violet-100 bg-white px-2 py-1.5 font-mono text-[9px] text-violet-700 outline-none focus:border-accent"
              list="css-property-suggestions"
              onChange={(event) => setNewProperty(event.target.value)}
              placeholder="Search property..."
              spellCheck={false}
              value={newProperty}
            />
            <datalist id="css-property-suggestions">
              {propertySuggestions.map((property) => (
                <option key={property} value={property} />
              ))}
            </datalist>
            <input
              aria-label="New CSS value"
              aria-invalid={newValue.length > 0 && !newValueValid}
              className="min-w-0 rounded-lg border border-violet-100 bg-white px-2 py-1.5 font-mono text-[9px] outline-none placeholder:text-slate-300 focus:border-accent"
              onChange={(event) => setNewValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void addDeclaration();
                }
              }}
              placeholder="value"
              spellCheck={false}
              value={newValue}
            />
            <button
              aria-label="Add declaration"
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-40"
              disabled={!newValueValid}
              onClick={() => void addDeclaration()}
              title="Add live override"
              type="button"
            >
              <Plus aria-hidden="true" size={13} />
            </button>
          </div>
          {normalizedNewProperty.length > 0 && !newPropertyValid ? (
            <p className="border-b border-rose-100 bg-rose-50 px-3 py-1.5 text-[9px] text-rose-600">
              Enter a valid CSS property name, for example grid-template-columns or --brand-color.
            </p>
          ) : newValue.trim().length > 0 && !newValueValid ? (
            <p className="border-b border-amber-100 bg-amber-50 px-3 py-1.5 text-[9px] text-amber-700">
              This value is not valid for {normalizedNewProperty}.
            </p>
          ) : null}

          {result === null && displayRules.length === 0 ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map((item) => (
                <div className="h-20 animate-pulse rounded-xl bg-slate-100" key={item} />
              ))}
            </div>
          ) : filteredRules.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs font-medium text-slate-600">No matching declarations</p>
              <p className="mt-1 text-[10px] text-muted">
                Try a property, value, selector, or source filename.
              </p>
            </div>
          ) : (
            <div>
              {filteredRules.map(({ rule, declarations }) => {
                const inheritedSelector = rule.inheritedFrom?.selector ?? null;
                const showInheritedHeader =
                  inheritedSelector !== null && inheritedSelector !== previousInheritedSelector;
                previousInheritedSelector = inheritedSelector;

                return (
                  <div key={rule.id}>
                    {showInheritedHeader ? (
                      <div className="border-b border-line bg-slate-50 px-3 py-1.5 text-[9px] text-slate-500">
                        Inherited from{" "}
                        <code className="font-semibold text-slate-700">
                          {rule.inheritedFrom?.tagName}
                          {inheritedSelector === null ? "" : ` / ${inheritedSelector}`}
                        </code>
                      </div>
                    ) : null}
                    <RuleCard
                      declarations={declarations}
                      onCommit={async (property, value) => {
                        await onCommit(property, value);
                        scheduleRefresh();
                      }}
                      onPickProperty={onPickProperty}
                      rule={rule}
                    />
                  </div>
                );
              })}
            </div>
          )}

          {result !== null && result.unreadableStylesheets > 0 ? (
            <div className="border-t border-amber-100 bg-amber-50 px-3 py-2 text-[9px] leading-4 text-amber-700">
              {result.unreadableStylesheets} cross-origin stylesheet
              {result.unreadableStylesheets === 1 ? "" : "s"} could not be read. Computed values
              still include their effects.
            </div>
          ) : null}

          <div className="flex items-center gap-3 border-t border-line bg-panel-soft px-3 py-2 text-[9px] text-slate-400">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> winner
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-slate-300" /> overridden
            </span>
            <span>Click a value to create a safe live override</span>
          </div>
        </>
      ) : (
        <ValueTable
          emptyLabel={
            view === "variables"
              ? "No custom properties were found for this element."
              : "No computed values match this filter."
          }
          entries={valueEntries}
        />
      )}
    </section>
  );
};
