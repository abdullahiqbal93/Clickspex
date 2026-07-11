import { ChevronRight, EyeOff, RefreshCcw, Rows3 } from "lucide-react";
import { useEffect, useState } from "react";

import { sendMessageToActiveTab } from "../../chrome/messaging";
import { usePanelStore } from "../store";

import type { DomTreeNode } from "@ui-buddy/shared";

type DomTreePanelProps = {
  selectedSelector: string;
};

const nodeLabel = (node: DomTreeNode): string => {
  const id = node.id.length > 0 ? "#" + node.id : "";
  const classes = node.classList
    .slice(0, 2)
    .map((name) => "." + name)
    .join("");
  const more = node.classList.length > 2 ? "+" + String(node.classList.length - 2) : "";
  return node.tagName + id + classes + more;
};

const nodeAttributeHint = (node: DomTreeNode): string | null => {
  for (const name of ["role", "aria-label", "name", "type", "href", "src", "alt"]) {
    const value = node.attributes[name];
    if (value !== undefined && value.trim().length > 0) return name + '="' + value + '"';
  }
  return null;
};

export const DomTreePanel = ({ selectedSelector }: DomTreePanelProps) => {
  const context = usePanelStore((state) => state.domContext);
  const childrenBySelector = usePanelStore((state) => state.domChildrenBySelector);
  const setError = usePanelStore((state) => state.setError);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (context === null) return;

    setExpanded(new Set(context.ancestry.map((node) => node.selector)));
    const loadedChildren = usePanelStore.getState().domChildrenBySelector;

    for (const node of context.ancestry) {
      if (node.childCount > 0 && loadedChildren[node.selector] === undefined) {
        void sendMessageToActiveTab({
          type: "DOM_CHILDREN_REQUEST",
          payload: { selector: node.selector },
        });
      }
    }
  }, [context]);

  const refreshTree = async () => {
    setError(null);
    try {
      await sendMessageToActiveTab({ type: "DOM_CONTEXT_REQUEST" });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to read the page DOM.");
    }
  };

  const toggleNode = async (node: DomTreeNode) => {
    if (node.childCount === 0) return;
    const isOpening = !expanded.has(node.selector);
    setExpanded((current) => {
      const next = new Set(current);
      if (isOpening) next.add(node.selector);
      else next.delete(node.selector);
      return next;
    });
    if (isOpening && childrenBySelector[node.selector] === undefined) {
      try {
        await sendMessageToActiveTab({
          type: "DOM_CHILDREN_REQUEST",
          payload: { selector: node.selector },
        });
      } catch (caughtError) {
        setError(
          caughtError instanceof Error ? caughtError.message : "Unable to expand this DOM node.",
        );
      }
    }
  };

  const selectNode = async (selector: string) => {
    setError(null);
    try {
      await sendMessageToActiveTab({ type: "SELECT_SEARCH_RESULT", payload: { selector } });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to select this node.");
    }
  };

  const highlightNode = (selector: string | null) => {
    void sendMessageToActiveTab({
      type: "HIGHLIGHT_DOM_NODE",
      payload: { selector },
    }).catch(() => undefined);
  };

  const renderNode = (node: DomTreeNode, depth: number): React.ReactNode => {
    const isExpanded = expanded.has(node.selector);
    const isSelected =
      node.selector === context?.selectedSelector || node.selector === selectedSelector;
    const children = childrenBySelector[node.selector] ?? [];
    const attributeHint = nodeAttributeHint(node);
    const showText = node.childCount === 0 && node.textPreview.length > 0;
    const rowClassName =
      "group flex h-7 min-w-max items-center rounded-md pr-2 text-[11px] transition-colors " +
      (isSelected ? "bg-accent-soft text-accent-hover" : "text-slate-700 hover:bg-accent-softer");

    return (
      <div key={node.selector}>
        <div
          className={rowClassName}
          onMouseEnter={() => highlightNode(node.selector)}
          onMouseLeave={() => highlightNode(null)}
          style={{ paddingLeft: String(depth * 14 + 4) + "px" }}
        >
          <button
            aria-label={isExpanded ? "Collapse node" : "Expand node"}
            className={
              "mr-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-slate-400 " +
              (node.childCount === 0 ? "invisible" : "hover:bg-panel hover:text-accent")
            }
            onClick={() => void toggleNode(node)}
            type="button"
          >
            <ChevronRight
              aria-hidden="true"
              className={"transition-transform " + (isExpanded ? "rotate-90" : "")}
              size={12}
            />
          </button>
          <button
            className="flex min-w-0 flex-1 items-center gap-1 text-left font-mono"
            onClick={() => void selectNode(node.selector)}
            title={node.selector}
            type="button"
          >
            <span className="text-slate-400">&lt;</span>
            <span className="font-semibold text-fuchsia-700">{node.tagName}</span>
            {node.id.length > 0 ? <span className="text-sky-700">#{node.id}</span> : null}
            {node.classList.slice(0, 2).map((className) => (
              <span className="max-w-28 truncate text-amber-700" key={className}>
                .{className}
              </span>
            ))}
            {node.classList.length > 2 ? (
              <span className="text-slate-400">+{node.classList.length - 2}</span>
            ) : null}
            <span className="text-slate-400">&gt;</span>
            {attributeHint === null ? null : (
              <span className="max-w-40 truncate text-emerald-700">{attributeHint}</span>
            )}
            {showText ? (
              <span className="max-w-48 truncate font-sans text-slate-500">
                &quot;{node.textPreview}&quot;
              </span>
            ) : null}
          </button>
          {!node.visible ? (
            <span className="ml-2 inline-flex items-center gap-1 text-[9px] font-medium text-slate-400">
              <EyeOff aria-hidden="true" size={10} />
              hidden
            </span>
          ) : null}
        </div>
        {isExpanded ? children.map((child) => renderNode(child, depth + 1)) : null}
        {isExpanded && node.childCount > children.length ? (
          <div
            className="h-7 min-w-max py-1.5 pr-2 font-mono text-[10px] text-slate-400"
            style={{ paddingLeft: String((depth + 1) * 14 + 24) + "px" }}
          >
            ... {node.childCount - children.length} more elements
          </div>
        ) : null}
      </div>
    );
  };

  const root = context?.ancestry[0] ?? null;
  const selectedNode = context?.ancestry.at(-1);

  return (
    <section className="ub-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Rows3 aria-hidden="true" className="text-accent" size={14} />
          <h2 className="text-sm font-semibold tracking-tight">Elements</h2>
          {selectedNode === undefined ? null : (
            <span className="ub-chip max-w-48 truncate" title={context?.selectedSelector ?? ""}>
              {nodeLabel(selectedNode)}
            </span>
          )}
        </div>
        <button
          className="ub-icon-btn h-7 w-7"
          onClick={() => void refreshTree()}
          title="Refresh DOM tree"
          type="button"
        >
          <RefreshCcw aria-hidden="true" size={12} />
        </button>
      </div>
      <div className="max-h-[360px] min-h-32 overflow-auto bg-[#fbfbfd] px-1 py-1.5">
        {root === null ? (
          <div className="flex min-h-28 items-center justify-center px-4 text-center text-2xs text-muted">
            Reading the selected element&apos;s DOM context...
          </div>
        ) : (
          renderNode(root, 0)
        )}
      </div>
      <div className="flex items-center justify-between border-t border-line bg-panel-soft px-3 py-1.5 text-[10px] text-muted">
        <span>{context?.ancestry.length ?? 0} levels to selection</span>
        <span>Hover to reveal, click to select</span>
      </div>
    </section>
  );
};
