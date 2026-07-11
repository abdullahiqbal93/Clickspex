import { ChevronRight, EyeOff, LocateFixed, RefreshCcw, Rows3 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { sendMessageToActiveTab } from "../../chrome/messaging";
import { usePanelStore } from "../store";

import type { DomTreeNode } from "@ui-buddy/shared";

type DomTreePanelProps = {
  selectedDomPath: string;
};

export type VisibleDomNode = {
  node: DomTreeNode;
  depth: number;
  parentSelector: string | null;
};

export const flattenVisibleDomNodes = (
  root: DomTreeNode | null,
  expanded: ReadonlySet<string>,
  childrenBySelector: Record<string, DomTreeNode[]>,
): VisibleDomNode[] => {
  if (root === null) {
    return [];
  }

  const result: VisibleDomNode[] = [];
  const visited = new Set<string>();

  const visit = (node: DomTreeNode, depth: number, parentSelector: string | null) => {
    if (visited.has(node.selector)) {
      return;
    }

    visited.add(node.selector);
    result.push({ node, depth, parentSelector });

    if (!expanded.has(node.selector)) {
      return;
    }

    for (const child of childrenBySelector[node.selector] ?? []) {
      visit(child, depth + 1, node.selector);
    }
  };

  visit(root, 0, null);
  return result;
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

const displayedAttributes = (node: DomTreeNode): Array<[string, string]> => {
  const entries: Array<[string, string]> = [];

  if (node.id.length > 0) {
    entries.push(["id", node.id]);
  }

  if (node.classList.length > 0) {
    entries.push(["class", node.classList.join(" ")]);
  }

  for (const [name, value] of Object.entries(node.attributes)) {
    if (name !== "id" && name !== "class") {
      entries.push([name, value]);
    }
  }

  return entries;
};

export const DomTreePanel = ({ selectedDomPath }: DomTreePanelProps) => {
  const context = usePanelStore((state) => state.domContext);
  const childrenBySelector = usePanelStore((state) => state.domChildrenBySelector);
  const setError = usePanelStore((state) => state.setError);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [requestVersion, setRequestVersion] = useState(0);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const requestedChildren = useRef(new Set<string>());
  const nodeButtons = useRef(new Map<string, HTMLButtonElement>());
  const selectedRow = useRef<HTMLDivElement | null>(null);

  const activeContext = context?.ancestry.at(-1)?.domPath === selectedDomPath ? context : null;
  const root = activeContext?.ancestry[0] ?? null;
  const selectedNode = activeContext?.ancestry.at(-1);
  const visibleNodes = useMemo(
    () => flattenVisibleDomNodes(root, expanded, childrenBySelector),
    [childrenBySelector, expanded, root],
  );
  const selectedIsVisible = visibleNodes.some(
    (entry) => entry.node.selector === activeContext?.selectedSelector,
  );

  const requestChildren = useCallback(
    async (node: DomTreeNode, includeAll = false) => {
      const requestKey = node.selector + (includeAll ? ":all" : "");

      if (
        node.childCount === 0 ||
        (!includeAll && childrenBySelector[node.selector] !== undefined) ||
        requestedChildren.current.has(requestKey)
      ) {
        return;
      }

      requestedChildren.current.add(requestKey);

      try {
        await sendMessageToActiveTab({
          type: "DOM_CHILDREN_REQUEST",
          payload: { selector: node.selector, includeAll },
        });
      } catch (caughtError) {
        requestedChildren.current.delete(requestKey);
        setError(
          caughtError instanceof Error ? caughtError.message : "Unable to expand this DOM node.",
        );
      }
    },
    [childrenBySelector, setError],
  );

  useEffect(() => {
    if (activeContext !== null) {
      setExpanded(new Set(activeContext.ancestry.map((node) => node.selector)));
    }
  }, [activeContext]);

  useEffect(() => {
    if (activeContext !== null) {
      setLoadTimedOut(false);
      return;
    }

    setLoadTimedOut(false);
    const timer = window.setTimeout(() => setLoadTimedOut(true), 2500);
    return () => window.clearTimeout(timer);
  }, [activeContext, requestVersion, selectedDomPath]);

  useEffect(() => {
    if (activeContext === null || !selectedIsVisible) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      selectedRow.current?.scrollIntoView({ block: "center", inline: "nearest" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeContext, selectedIsVisible]);

  useEffect(
    () => () => {
      void sendMessageToActiveTab({
        type: "HIGHLIGHT_DOM_NODE",
        payload: { selector: null },
      }).catch(() => undefined);
    },
    [],
  );

  const refreshTree = async () => {
    setError(null);
    setLoadTimedOut(false);
    requestedChildren.current.clear();
    setRequestVersion((version) => version + 1);

    try {
      await sendMessageToActiveTab({ type: "DOM_CONTEXT_REQUEST" });
    } catch (caughtError) {
      setLoadTimedOut(true);
      setError(caughtError instanceof Error ? caughtError.message : "Unable to read the page DOM.");
    }
  };

  const toggleNode = async (node: DomTreeNode) => {
    if (node.childCount === 0) {
      return;
    }

    const isOpening = !expanded.has(node.selector);
    setExpanded((current) => {
      const next = new Set(current);

      if (isOpening) {
        next.add(node.selector);
      } else {
        next.delete(node.selector);
      }

      return next;
    });

    if (isOpening) {
      await requestChildren(node);
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

  const selectAndFocus = (selector: string) => {
    nodeButtons.current.get(selector)?.focus();
    void selectNode(selector);
  };

  const handleNodeKeyDown = (event: React.KeyboardEvent, node: DomTreeNode) => {
    const index = visibleNodes.findIndex((entry) => entry.node.selector === node.selector);

    if (index < 0) {
      return;
    }

    const currentEntry = visibleNodes[index];

    if (event.key === "ArrowDown") {
      const next = visibleNodes[index + 1];
      if (next !== undefined) {
        event.preventDefault();
        selectAndFocus(next.node.selector);
      }
      return;
    }

    if (event.key === "ArrowUp") {
      const previous = visibleNodes[index - 1];
      if (previous !== undefined) {
        event.preventDefault();
        selectAndFocus(previous.node.selector);
      }
      return;
    }

    if (event.key === "Home") {
      const first = visibleNodes[0];
      if (first !== undefined) {
        event.preventDefault();
        selectAndFocus(first.node.selector);
      }
      return;
    }

    if (event.key === "End") {
      const last = visibleNodes.at(-1);
      if (last !== undefined) {
        event.preventDefault();
        selectAndFocus(last.node.selector);
      }
      return;
    }

    if (event.key === "ArrowRight") {
      if (node.childCount === 0) {
        return;
      }

      event.preventDefault();

      if (!expanded.has(node.selector)) {
        void toggleNode(node);
        return;
      }

      const firstChild = childrenBySelector[node.selector]?.[0];
      if (firstChild !== undefined) {
        selectAndFocus(firstChild.selector);
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();

      if (expanded.has(node.selector)) {
        void toggleNode(node);
      } else if (
        currentEntry?.parentSelector !== null &&
        currentEntry?.parentSelector !== undefined
      ) {
        selectAndFocus(currentEntry.parentSelector);
      }
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      void selectNode(node.selector);
    }
  };

  const revealSelected = async () => {
    selectedRow.current?.scrollIntoView({ block: "center", inline: "nearest" });

    try {
      await sendMessageToActiveTab({ type: "SCROLL_SELECTED_INTO_VIEW" });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to reveal the selected element.",
      );
    }
  };

  const renderNode = (node: DomTreeNode, depth: number): React.ReactNode => {
    const isExpanded = expanded.has(node.selector);
    const isSelected = node.selector === activeContext?.selectedSelector;
    const children = childrenBySelector[node.selector];
    const attributes = displayedAttributes(node);
    const hasChildren = node.childCount > 0;
    const showInlineText = !hasChildren && node.textPreview.length > 0;
    const rowClassName =
      "group flex h-7 w-max min-w-full items-center pr-2 text-[11px] outline-none transition-colors " +
      (isSelected
        ? "bg-blue-100 text-blue-950 ring-1 ring-inset ring-blue-300"
        : "text-slate-700 hover:bg-blue-50");

    return (
      <div key={node.selector}>
        <div
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-selected={isSelected}
          className={rowClassName}
          onMouseEnter={() => highlightNode(node.selector)}
          onMouseLeave={() => highlightNode(null)}
          ref={(element) => {
            if (isSelected) {
              selectedRow.current = element;
            }
          }}
          role="treeitem"
          style={{ paddingLeft: String(depth * 14 + 4) + "px" }}
        >
          <button
            aria-label={isExpanded ? "Collapse node" : "Expand node"}
            className={
              "mr-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-slate-400 " +
              (hasChildren ? "hover:bg-white hover:text-blue-700" : "invisible")
            }
            onClick={() => void toggleNode(node)}
            tabIndex={-1}
            type="button"
          >
            <ChevronRight
              aria-hidden="true"
              className={"transition-transform " + (isExpanded ? "rotate-90" : "")}
              size={12}
            />
          </button>
          <button
            aria-current={isSelected ? "true" : undefined}
            className="flex h-7 min-w-0 flex-1 items-center gap-0.5 whitespace-nowrap text-left font-mono outline-none"
            onClick={() => void selectNode(node.selector)}
            onKeyDown={(event) => handleNodeKeyDown(event, node)}
            ref={(element) => {
              if (element === null) {
                nodeButtons.current.delete(node.selector);
              } else {
                nodeButtons.current.set(node.selector, element);
              }
            }}
            title={node.selector}
            type="button"
          >
            <span className="text-slate-400">&lt;</span>
            <span className="font-semibold text-fuchsia-700">{node.tagName}</span>
            {attributes.map(([name, value]) => (
              <span className="ml-1" key={name}>
                <span className="text-amber-700">{name}</span>
                <span className="text-slate-500">=</span>
                <span className="text-emerald-700">&quot;{value}&quot;</span>
              </span>
            ))}
            <span className="text-slate-400">&gt;</span>
            {showInlineText ? (
              <>
                <span className="max-w-64 truncate font-sans text-slate-600">
                  {node.textPreview}
                </span>
                <span className="text-slate-400">&lt;/</span>
                <span className="font-semibold text-fuchsia-700">{node.tagName}</span>
                <span className="text-slate-400">&gt;</span>
              </>
            ) : null}
            {hasChildren && !isExpanded ? (
              <>
                <span className="px-1 text-slate-400">...</span>
                <span className="text-slate-400">&lt;/</span>
                <span className="font-semibold text-fuchsia-700">{node.tagName}</span>
                <span className="text-slate-400">&gt;</span>
              </>
            ) : null}
          </button>
          {!node.visible ? (
            <span className="ml-2 inline-flex shrink-0 items-center gap-1 text-[9px] font-medium text-slate-400">
              <EyeOff aria-hidden="true" size={10} />
              hidden
            </span>
          ) : null}
        </div>
        {isExpanded && children === undefined ? (
          <div
            className="h-7 w-max min-w-full py-1.5 pr-2 font-mono text-[10px] text-slate-400"
            style={{ paddingLeft: String((depth + 1) * 14 + 24) + "px" }}
          >
            Loading...
          </div>
        ) : null}
        {isExpanded ? children?.map((child) => renderNode(child, depth + 1)) : null}
        {isExpanded && children !== undefined && node.childCount > children.length ? (
          <button
            className="h-7 w-max min-w-full py-1.5 pr-2 text-left font-mono text-[10px] text-blue-600 hover:bg-blue-50 hover:text-blue-800"
            onClick={() => void requestChildren(node, true)}
            style={{ paddingLeft: String((depth + 1) * 14 + 24) + "px" }}
            type="button"
          >
            Show {node.childCount - children.length} more elements
          </button>
        ) : null}
        {isExpanded && hasChildren ? (
          <div
            className="h-6 w-max min-w-full whitespace-nowrap py-1 pr-2 font-mono text-[11px]"
            style={{ paddingLeft: String(depth * 14 + 29) + "px" }}
          >
            <span className="text-slate-400">&lt;/</span>
            <span className="font-semibold text-fuchsia-700">{node.tagName}</span>
            <span className="text-slate-400">&gt;</span>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section className="ub-card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Rows3 aria-hidden="true" className="text-accent" size={14} />
          <h2 className="text-sm font-semibold tracking-tight">Elements</h2>
          {selectedNode === undefined ? null : (
            <span
              className="ub-chip max-w-48 truncate"
              title={activeContext?.selectedSelector ?? ""}
            >
              {nodeLabel(selectedNode)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            className="ub-icon-btn h-7 w-7"
            disabled={selectedNode === undefined}
            onClick={() => void revealSelected()}
            title="Reveal selected element"
            type="button"
          >
            <LocateFixed aria-hidden="true" size={12} />
          </button>
          <button
            className="ub-icon-btn h-7 w-7"
            onClick={() => void refreshTree()}
            title="Refresh DOM tree"
            type="button"
          >
            <RefreshCcw aria-hidden="true" size={12} />
          </button>
        </div>
      </div>
      <div
        aria-label="Page DOM"
        className="max-h-[420px] min-h-36 overflow-auto bg-[#fbfbfd] px-1 py-1.5"
        onMouseLeave={() => highlightNode(null)}
        role="tree"
      >
        {root === null ? (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 px-4 text-center text-2xs text-muted">
            <span>
              {loadTimedOut
                ? "The selected element tree is unavailable."
                : "Reading the selected element tree..."}
            </span>
            {loadTimedOut ? (
              <button className="ub-btn h-7" onClick={() => void refreshTree()} type="button">
                <RefreshCcw aria-hidden="true" size={11} />
                Retry
              </button>
            ) : null}
          </div>
        ) : (
          renderNode(root, 0)
        )}
      </div>
      <div className="flex items-center justify-between border-t border-line bg-panel-soft px-3 py-1.5 text-[10px] tabular-nums text-muted">
        <span>{visibleNodes.length} nodes shown</span>
        <span>{activeContext?.ancestry.length ?? 0} levels</span>
      </div>
    </section>
  );
};
