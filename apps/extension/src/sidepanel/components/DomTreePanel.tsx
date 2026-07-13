import {
  Check,
  ChevronRight,
  ChevronsUp,
  Copy,
  EyeOff,
  LoaderCircle,
  LocateFixed,
  RefreshCcw,
  Rows3,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { sendMessageToActiveTab } from "../../chrome/messaging";
import { usePanelStore } from "../store";

import type { DomTreeNode } from "@ui-buddy/shared";

type DomTreePanelProps = {
  selectedDomPath: string;
};

type ChildLoadState = {
  status: "loading" | "error";
  includeAll: boolean;
};

const CHILD_LOAD_TIMEOUT_MS = 3000;

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
  const searchResults = usePanelStore((state) => state.searchResults);
  const setError = usePanelStore((state) => state.setError);
  const setSearchResults = usePanelStore((state) => state.setSearchResults);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [childLoadStates, setChildLoadStates] = useState<Record<string, ChildLoadState>>({});
  const requestedChildren = useRef(new Set<string>());
  const childRequestTimers = useRef(new Map<string, number>());
  const nodeButtons = useRef(new Map<string, HTMLButtonElement>());
  const selectedRow = useRef<HTMLDivElement | null>(null);
  const treeViewport = useRef<HTMLDivElement | null>(null);
  const selectedContextPath = useRef<string | null>(null);

  // Keep the previous tree mounted while the newly selected element context is
  // in flight. Replacing it with a loader makes the whole side panel jump.
  const activeContext = context;
  const contextIsCurrent = context?.ancestry.at(-1)?.domPath === selectedDomPath;
  const root = activeContext?.ancestry[0] ?? null;
  const selectedNode = activeContext?.ancestry.at(-1);
  const visibleNodes = useMemo(
    () => flattenVisibleDomNodes(root, expanded, childrenBySelector),
    [childrenBySelector, expanded, root],
  );
  const selectedIsVisible = visibleNodes.some(
    (entry) => entry.node.selector === activeContext?.selectedSelector,
  );

  const clearChildRequest = useCallback((selector: string) => {
    for (const requestKey of Array.from(requestedChildren.current)) {
      if (requestKey === selector || requestKey === selector + ":all") {
        requestedChildren.current.delete(requestKey);
        const timer = childRequestTimers.current.get(requestKey);

        if (timer !== undefined) {
          window.clearTimeout(timer);
          childRequestTimers.current.delete(requestKey);
        }
      }
    }

    setChildLoadStates((current) => {
      if (current[selector] === undefined) {
        return current;
      }

      const next = { ...current };
      delete next[selector];
      return next;
    });
  }, []);

  const resetChildRequests = useCallback(() => {
    for (const timer of childRequestTimers.current.values()) {
      window.clearTimeout(timer);
    }

    childRequestTimers.current.clear();
    requestedChildren.current.clear();
    setChildLoadStates({});
  }, []);

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
      setChildLoadStates((current) => ({
        ...current,
        [node.selector]: { status: "loading", includeAll },
      }));

      const markFailed = (message?: string) => {
        requestedChildren.current.delete(requestKey);
        const timer = childRequestTimers.current.get(requestKey);

        if (timer !== undefined) {
          window.clearTimeout(timer);
          childRequestTimers.current.delete(requestKey);
        }

        setChildLoadStates((current) => ({
          ...current,
          [node.selector]: { status: "error", includeAll },
        }));

        if (message !== undefined) {
          setError(message);
        }
      };

      childRequestTimers.current.set(
        requestKey,
        window.setTimeout(() => markFailed(), CHILD_LOAD_TIMEOUT_MS),
      );

      try {
        await sendMessageToActiveTab({
          type: "DOM_CHILDREN_REQUEST",
          payload: { selector: node.selector, includeAll },
        });
      } catch (caughtError) {
        markFailed(
          caughtError instanceof Error ? caughtError.message : "Unable to expand this DOM node.",
        );
      }
    },
    [childrenBySelector, setError],
  );

  useEffect(() => {
    for (const selector of Object.keys(childrenBySelector)) {
      clearChildRequest(selector);
    }
  }, [childrenBySelector, clearChildRequest]);

  useEffect(() => {
    for (const { node } of visibleNodes) {
      if (
        expanded.has(node.selector) &&
        node.childCount > 0 &&
        childrenBySelector[node.selector] === undefined &&
        childLoadStates[node.selector] === undefined
      ) {
        void requestChildren(node);
      }
    }
  }, [childLoadStates, childrenBySelector, expanded, requestChildren, visibleNodes]);
  useEffect(() => {
    const nextPath = activeContext?.ancestry.at(-1)?.domPath ?? null;

    if (nextPath !== null && selectedContextPath.current !== nextPath) {
      resetChildRequests();
      selectedContextPath.current = nextPath;
      setExpanded(new Set(activeContext?.ancestry.map((node) => node.selector) ?? []));
    }
  }, [activeContext, resetChildRequests]);

  useEffect(() => {
    const normalizedQuery = query.trim();

    if (normalizedQuery.length === 0) {
      setSearchResults([]);
      return;
    }

    setSearchResults([]);
    const timer = window.setTimeout(() => {
      void sendMessageToActiveTab({
        type: "SEARCH_ELEMENTS",
        payload: { query: normalizedQuery },
      }).catch((caughtError) => {
        setError(caughtError instanceof Error ? caughtError.message : "Unable to search the DOM.");
      });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [query, setError, setSearchResults]);

  useEffect(() => {
    if (contextIsCurrent) {
      setLoadTimedOut(false);
      return;
    }

    setLoadTimedOut(false);
    const timer = window.setTimeout(() => setLoadTimedOut(true), 2500);
    return () => window.clearTimeout(timer);
  }, [contextIsCurrent, requestVersion, selectedDomPath]);

  const scrollSelectedInsideTree = useCallback((center = false) => {
    const viewport = treeViewport.current;
    const row = selectedRow.current;

    if (viewport === null || row === null) {
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const rowAboveViewport = rowRect.top < viewportRect.top;
    const rowBelowViewport = rowRect.bottom > viewportRect.bottom;

    if (!center && !rowAboveViewport && !rowBelowViewport) {
      return;
    }

    const targetOffset = center
      ? rowRect.top - viewportRect.top - (viewport.clientHeight - rowRect.height) / 2
      : rowAboveViewport
        ? rowRect.top - viewportRect.top
        : rowRect.bottom - viewportRect.bottom;
    viewport.scrollTop += targetOffset;
  }, []);

  useEffect(() => {
    if (!contextIsCurrent || !selectedIsVisible) {
      return;
    }

    const frame = window.requestAnimationFrame(() => scrollSelectedInsideTree());
    return () => window.cancelAnimationFrame(frame);
  }, [
    activeContext?.selectedSelector,
    contextIsCurrent,
    scrollSelectedInsideTree,
    selectedIsVisible,
  ]);

  useEffect(() => {
    const requestTimers = childRequestTimers.current;
    const requested = requestedChildren.current;

    void sendMessageToActiveTab({ type: "DOM_TREE_SUBSCRIBE" }).catch((caughtError) => {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to watch the page DOM.",
      );
    });

    return () => {
      for (const timer of requestTimers.values()) {
        window.clearTimeout(timer);
      }

      requestTimers.clear();
      requested.clear();
      void sendMessageToActiveTab({ type: "DOM_TREE_UNSUBSCRIBE" }).catch(() => undefined);
      void sendMessageToActiveTab({
        type: "HIGHLIGHT_DOM_NODE",
        payload: { selector: null },
      }).catch(() => undefined);
    };
  }, [setError]);

  const refreshTree = async () => {
    setError(null);
    setLoadTimedOut(false);
    resetChildRequests();
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
    setExpanded(new Set(activeContext?.ancestry.map((node) => node.selector) ?? []));
    window.requestAnimationFrame(() => scrollSelectedInsideTree(true));

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

  const copySelectedSelector = async () => {
    if (activeContext?.selectedSelector === null || activeContext?.selectedSelector === undefined) {
      return;
    }

    try {
      await navigator.clipboard.writeText(activeContext.selectedSelector);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setError("Unable to copy the selector.");
    }
  };

  const renderNode = (node: DomTreeNode, depth: number): React.ReactNode => {
    const isExpanded = expanded.has(node.selector);
    const isSelected = node.selector === activeContext?.selectedSelector;
    const children = childrenBySelector[node.selector];
    const childLoadState = childLoadStates[node.selector];
    const attributes = displayedAttributes(node);
    const hasChildren = node.childCount > 0;
    const showInlineText = !hasChildren && node.textPreview.length > 0;
    const rowClassName =
      "group flex h-[22px] w-max min-w-full items-center pr-2 text-[11px] leading-none outline-none " +
      (isSelected ? "bg-[#cfe8ff] text-slate-950" : "text-slate-700 hover:bg-[#e8f2ff]");

    return (
      <div key={node.selector}>
        <div
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-level={depth + 1}
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
          style={{ paddingLeft: String(depth * 12 + 2) + "px" }}
        >
          <button
            aria-label={isExpanded ? "Collapse node" : "Expand node"}
            className={
              "inline-flex h-[22px] w-4 shrink-0 items-center justify-center text-slate-500 " +
              (hasChildren ? "hover:text-blue-700" : "invisible")
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
            className="flex h-[22px] min-w-0 flex-1 items-center gap-0.5 whitespace-nowrap text-left font-mono outline-none"
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
            className="flex h-7 w-max min-w-full items-center gap-1.5 pr-2 font-mono text-[10px] text-slate-500"
            style={{ paddingLeft: String((depth + 1) * 12 + 18) + "px" }}
          >
            {childLoadState?.status === "error" ? (
              <button
                className="inline-flex h-6 items-center gap-1 text-blue-700 hover:underline"
                onClick={() => void requestChildren(node)}
                type="button"
              >
                <RefreshCcw aria-hidden="true" size={10} />
                Retry loading children
              </button>
            ) : (
              <>
                <LoaderCircle aria-hidden="true" className="animate-spin" size={11} />
                Loading child nodes
              </>
            )}
          </div>
        ) : null}
        {isExpanded ? children?.map((child) => renderNode(child, depth + 1)) : null}
        {isExpanded && children !== undefined && node.childCount > children.length ? (
          <button
            className="flex h-7 w-max min-w-full items-center gap-1.5 pr-2 text-left font-mono text-[10px] text-blue-700 hover:bg-[#e8f2ff] disabled:text-slate-500"
            disabled={childLoadState?.status === "loading" && childLoadState.includeAll}
            onClick={() => void requestChildren(node, true)}
            style={{ paddingLeft: String((depth + 1) * 12 + 18) + "px" }}
            type="button"
          >
            {childLoadState?.status === "loading" && childLoadState.includeAll ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" size={11} />
            ) : childLoadState?.status === "error" && childLoadState.includeAll ? (
              <RefreshCcw aria-hidden="true" size={10} />
            ) : null}
            {childLoadState?.status === "loading" && childLoadState.includeAll
              ? "Loading remaining elements"
              : childLoadState?.status === "error" && childLoadState.includeAll
                ? "Retry loading remaining elements"
                : "Show " + String(node.childCount - children.length) + " more elements"}
          </button>
        ) : null}
        {isExpanded && hasChildren ? (
          <div
            className="h-[22px] w-max min-w-full whitespace-nowrap py-[5px] pr-2 font-mono text-[11px]"
            style={{ paddingLeft: String(depth * 12 + 18) + "px" }}
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
      <div className="border-b border-line bg-gradient-to-r from-panel via-panel to-accent-softer/60 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Rows3 aria-hidden="true" size={15} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold tracking-tight text-ink">Elements</h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      contextIsCurrent ? "bg-emerald-500" : "animate-pulse bg-amber-500"
                    }`}
                  />
                  {contextIsCurrent ? "Live" : loadTimedOut ? "Stale" : "Syncing"}
                </span>
              </div>
              <p
                className="truncate font-mono text-[10px] text-muted"
                title={activeContext?.selectedSelector ?? ""}
              >
                {selectedNode === undefined ? "Page document tree" : nodeLabel(selectedNode)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              className="ub-icon-btn h-8 w-8 rounded-xl"
              disabled={selectedNode === undefined}
              onClick={() => void copySelectedSelector()}
              title="Copy unique selector"
              type="button"
            >
              {copied ? (
                <Check aria-hidden="true" className="text-emerald-600" size={14} />
              ) : (
                <Copy aria-hidden="true" size={14} />
              )}
            </button>
            <button
              className="ub-icon-btn h-8 w-8 rounded-xl"
              onClick={() => setExpanded(new Set())}
              title="Collapse all branches"
              type="button"
            >
              <ChevronsUp aria-hidden="true" size={14} />
            </button>
            <button
              className="ub-icon-btn h-8 w-8 rounded-xl"
              disabled={selectedNode === undefined}
              onClick={() => void revealSelected()}
              title="Reveal selected element"
              type="button"
            >
              <LocateFixed aria-hidden="true" size={14} />
            </button>
            <button
              className="ub-icon-btn h-8 w-8 rounded-xl"
              onClick={() => void refreshTree()}
              title="Refresh DOM tree"
              type="button"
            >
              <RefreshCcw aria-hidden="true" size={14} />
            </button>
          </div>
        </div>

        <div className="relative mt-3">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-2.5 text-slate-400"
            size={13}
          />
          <input
            aria-label="Search DOM elements"
            className="ub-input h-8 rounded-xl py-1 pl-8 pr-8 font-mono text-[11px]"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setQuery("");
              } else if (event.key === "Enter" && searchResults[0] !== undefined) {
                void selectNode(searchResults[0].selector);
                setQuery("");
              }
            }}
            placeholder="Search selector, text, role, aria-label..."
            spellCheck={false}
            value={query}
          />
          {query.length > 0 ? (
            <button
              aria-label="Clear DOM search"
              className="absolute right-2 top-1.5 flex h-5 w-5 items-center justify-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              onClick={() => setQuery("")}
              type="button"
            >
              <X aria-hidden="true" size={12} />
            </button>
          ) : null}
          {query.trim().length > 0 ? (
            <div className="absolute inset-x-0 top-9 z-20 max-h-64 overflow-auto rounded-xl border border-line bg-panel p-1.5 shadow-pop">
              {searchResults.length === 0 ? (
                <p className="px-3 py-4 text-center text-[11px] text-muted">No matching elements</p>
              ) : (
                searchResults.map((result) => (
                  <button
                    className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-accent-softer"
                    key={result.selector}
                    onClick={() => {
                      void selectNode(result.selector);
                      setQuery("");
                    }}
                    onMouseEnter={() => highlightNode(result.selector)}
                    onMouseLeave={() => highlightNode(null)}
                    type="button"
                  >
                    <Search aria-hidden="true" className="mt-0.5 shrink-0 text-accent" size={12} />
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-[11px] font-semibold text-ink">
                        {nodeLabel({
                          ...result,
                          domPath: result.selector,
                          attributes: {},
                          childCount: 0,
                          visible: true,
                        })}
                      </span>
                      <span className="block truncate text-[10px] text-muted">
                        {result.textPreview || result.selector}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div
        aria-label="Page DOM"
        className="max-h-[560px] min-h-72 overflow-auto bg-panel py-1.5"
        onMouseLeave={() => highlightNode(null)}
        ref={treeViewport}
        role="tree"
      >
        {root === null ? (
          <div className="flex min-h-72 flex-col items-center justify-center gap-2 px-4 text-center text-[11px] text-muted">
            {loadTimedOut ? null : (
              <LoaderCircle aria-hidden="true" className="animate-spin text-accent" size={16} />
            )}
            <span>
              {loadTimedOut
                ? "The selected element tree is unavailable."
                : "Reading the live document tree..."}
            </span>
            {loadTimedOut ? (
              <button
                className="ub-btn mt-1 py-1.5"
                onClick={() => void refreshTree()}
                type="button"
              >
                <RefreshCcw aria-hidden="true" size={11} />
                Retry
              </button>
            ) : null}
          </div>
        ) : (
          renderNode(root, 0)
        )}
      </div>

      {activeContext === null ? null : (
        <div className="border-t border-line bg-panel-soft">
          <div
            aria-label="Selected element ancestry"
            className="edge-fade-x flex h-9 items-center overflow-x-auto px-2 font-mono text-[10px]"
          >
            {activeContext.ancestry.map((node, index) => {
              const isCurrent = index === activeContext.ancestry.length - 1;
              return (
                <span className="flex shrink-0 items-center" key={node.domPath}>
                  {index === 0 ? null : (
                    <ChevronRight aria-hidden="true" className="mx-0.5 text-slate-400" size={10} />
                  )}
                  <button
                    aria-current={isCurrent ? "true" : undefined}
                    className={
                      "max-w-40 truncate rounded-md px-1.5 py-1 " +
                      (isCurrent
                        ? "bg-accent-soft font-semibold text-accent-hover"
                        : "text-muted hover:bg-panel hover:text-ink")
                    }
                    onClick={() => void selectNode(node.selector)}
                    title={node.selector}
                    type="button"
                  >
                    {nodeLabel(node)}
                  </button>
                </span>
              );
            })}
          </div>
          {selectedNode === undefined ? null : (
            <div className="flex items-center justify-between border-t border-line/70 px-3 py-2 text-[10px] text-muted">
              <span>
                {selectedNode.childCount} direct{" "}
                {selectedNode.childCount === 1 ? "child" : "children"} ·{" "}
                {displayedAttributes(selectedNode).length} attributes
              </span>
              <span className={selectedNode.visible ? "text-emerald-700" : "text-slate-500"}>
                {selectedNode.visible ? "Visible" : "Hidden"}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
