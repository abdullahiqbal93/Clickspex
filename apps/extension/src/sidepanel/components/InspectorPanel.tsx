import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpToLine,
  Camera,
  Clipboard,
  Code2,
  Edit3,
  FileCode2,
  Hash,
  ImagePlus,
  LayoutPanelLeft,
  MousePointer2,
  Move,
  Pin,
  RefreshCcw,
  RotateCcw,
  Rows3,
  Search,
  ShieldCheck,
  Trash2,
  Type,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { callBackground, sendMessageToActiveTab } from "../../chrome/messaging";
import { readPageContext } from "../../chrome/session";
import { usePanelStore } from "../store";

import { AttributeEditor } from "./AttributeEditor";

import type {
  AlignEdge,
  DomMoveDirection,
  ElementSearchResult,
  ElementSnapshot,
  PageTechInfo,
} from "@clickspex/shared";

type InspectorPanelProps = {
  selectedElement: ElementSnapshot | null;
};

const formatPixels = (value: number): string => `${Math.round(value)}px`;

const PreviewRow = ({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon: typeof Hash;
  label: string;
  value?: string;
  children?: React.ReactNode;
}) => (
  <div className="grid grid-cols-[22px_82px_minmax(0,1fr)] items-start gap-2 border-b border-line/70 py-2 last:border-b-0">
    <Icon aria-hidden="true" className="mt-0.5 text-slate-400" size={15} />
    <span className="text-xs font-medium text-muted">{label}</span>
    <span className="break-words text-xs text-ink">{children ?? value}</span>
  </div>
);

const EmptyInspector = () => (
  <div className="cs-card p-4">
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <MousePointer2 aria-hidden="true" size={16} />
      </span>
      <div>
        <h2 className="text-sm font-semibold tracking-tight">Selection</h2>
        <p className="text-2xs text-muted">Press Pick, then click any element on the page.</p>
      </div>
    </div>
  </div>
);

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("error", () => reject(new Error("Unable to read image file.")));
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Unable to read image file."));
      }
    });
    reader.readAsDataURL(file);
  });
const resultTitle = (result: ElementSearchResult): string => {
  const id = result.id.length > 0 ? `#${result.id}` : "";
  const classes = result.classList.length > 0 ? `.${result.classList.slice(0, 2).join(".")}` : "";
  return `${result.tagName.toLowerCase()}${id}${classes}`;
};

export const InspectorPanel = ({ selectedElement }: InspectorPanelProps) => {
  const [moveMode, setMoveMode] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [query, setQuery] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const searchResults = usePanelStore((state) => state.searchResults);
  const tech = usePanelStore((state) => state.tech);
  const setTech = usePanelStore((state) => state.setTech);
  const elementCssResult = usePanelStore((state) => state.elementCssResult);
  const multiSelection = usePanelStore((state) => state.multiSelection);
  const setError = usePanelStore((state) => state.setError);

  useEffect(() => {
    if (tech !== null) {
      return;
    }

    callBackground<PageTechInfo[]>("detect-tech")
      .then((detected) => setTech(detected))
      .catch(() => setTech([]));
  }, [tech, setTech]);

  useEffect(() => {
    // Reset per-element results when the selection changes.
    setCopyFeedback(null);
  }, [selectedElement?.selector, selectedElement?.domPath]);

  const flashCopyFeedback = (label: string) => {
    setCopyFeedback(label);
    window.setTimeout(() => setCopyFeedback(null), 2000);
  };

  const requestElementCss = async (includeChildren: boolean) => {
    setError(null);
    try {
      await sendMessageToActiveTab({ type: "COPY_ELEMENT_CSS", payload: { includeChildren } });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to extract CSS.");
    }
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flashCopyFeedback(label);
    } catch {
      setError("Unable to write to the clipboard.");
    }
  };

  const captureElementScreenshot = async () => {
    if (selectedElement === null) {
      return;
    }

    setError(null);
    setCapturing(true);
    let overlayHidden = false;
    try {
      await sendMessageToActiveTab({ type: "SCROLL_SELECTED_INTO_VIEW" });
      await new Promise((resolve) => setTimeout(resolve, 400));

      // Hide the selection border / hover box so they don't end up in the PNG.
      await sendMessageToActiveTab({ type: "SET_CAPTURE_MODE", payload: { active: true } });
      overlayHidden = true;
      await new Promise((resolve) => setTimeout(resolve, 60));

      const dataUrl = await callBackground<string>("capture-tab");

      await sendMessageToActiveTab({ type: "SET_CAPTURE_MODE", payload: { active: false } });
      overlayHidden = false;

      const context = await readPageContext();
      const rect = usePanelStore.getState().selectedElement?.rect ?? selectedElement.rect;
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.addEventListener("load", () => resolve());
        image.addEventListener("error", () => reject(new Error("Unable to load screenshot.")));
        image.src = dataUrl;
      });

      const scale =
        context !== null && context.viewport.width > 0
          ? image.naturalWidth / context.viewport.width
          : 1;
      const canvas = document.createElement("canvas");
      const cropWidth = Math.max(1, Math.round(rect.width * scale));
      const cropHeight = Math.max(1, Math.round(rect.height * scale));
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      const drawContext = canvas.getContext("2d");

      if (drawContext === null) {
        throw new Error("Unable to create a canvas context.");
      }

      drawContext.drawImage(
        image,
        Math.max(0, Math.round(rect.left * scale)),
        Math.max(0, Math.round(rect.top * scale)),
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight,
      );

      const anchor = document.createElement("a");
      anchor.href = canvas.toDataURL("image/png");
      anchor.download = `clickspex-${selectedElement.tagName}-${Date.now()}.png`;
      anchor.click();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to capture a screenshot.",
      );
    } finally {
      if (overlayHidden) {
        // Make sure the overlay comes back even if capture failed midway.
        await sendMessageToActiveTab({
          type: "SET_CAPTURE_MODE",
          payload: { active: false },
        }).catch(() => undefined);
      }
      setCapturing(false);
    }
  };

  const alignSelected = async (alignment: AlignEdge) => {
    setError(null);
    try {
      await sendMessageToActiveTab({ type: "ALIGN_SELECTED", payload: { alignment } });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to align elements.");
    }
  };

  const runSearch = async () => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length === 0) {
      return;
    }

    setError(null);
    try {
      await sendMessageToActiveTab({ type: "SEARCH_ELEMENTS", payload: { query: trimmedQuery } });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to search elements.");
    }
  };

  const selectSearchResult = async (selector: string) => {
    setError(null);
    try {
      await sendMessageToActiveTab({ type: "SELECT_SEARCH_RESULT", payload: { selector } });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to select search result.",
      );
    }
  };

  const pinCard = async (kind: "styles" | "audit") => {
    if (selectedElement === null) {
      return;
    }

    setError(null);
    try {
      await sendMessageToActiveTab({
        type: "PIN_ELEMENT_CARD",
        payload: { snapshot: selectedElement, kind },
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to pin element card.");
    }
  };

  const clearPins = async () => {
    setError(null);
    try {
      await sendMessageToActiveTab({ type: "CLEAR_PINNED_CARDS" });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to clear pinned cards.",
      );
    }
  };

  const toggleMoveMode = async () => {
    const nextMoveMode = !moveMode;
    setError(null);
    try {
      await sendMessageToActiveTab({
        type: nextMoveMode ? "ELEMENT_MOVE_ENABLE" : "ELEMENT_MOVE_DISABLE",
      });
      setMoveMode(nextMoveMode);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to toggle move mode.");
      setMoveMode(false);
    }
  };

  const restorePosition = async () => {
    setError(null);
    try {
      await sendMessageToActiveTab({ type: "RESTORE_SELECTED_ELEMENT" });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to restore element position.",
      );
    }
  };

  const moveElement = async (direction: DomMoveDirection) => {
    setError(null);
    try {
      await sendMessageToActiveTab({ type: "MOVE_SELECTED_ELEMENT", payload: { direction } });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to move element in DOM.",
      );
    }
  };

  const startTextEdit = async () => {
    setError(null);
    try {
      await sendMessageToActiveTab({ type: "START_TEXT_EDIT" });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to edit text.");
    }
  };
  const nudgeElement = async (deltaX: number, deltaY: number) => {
    setError(null);
    try {
      await sendMessageToActiveTab({
        type: "NUDGE_SELECTED_ELEMENT",
        payload: { deltaX, deltaY },
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to nudge element.");
    }
  };

  const replaceImage = async (src: string) => {
    const trimmedSource = src.trim();

    if (trimmedSource.length === 0) {
      return;
    }

    setError(null);
    try {
      await sendMessageToActiveTab({
        type: "REPLACE_SELECTED_IMAGE",
        payload: { src: trimmedSource },
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to replace image.");
    }
  };

  const handleImageFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (file === undefined) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }

    try {
      await replaceImage(await readFileAsDataUrl(file));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to read image file.");
    }
  };

  const searchSection = (
    <section className="cs-card p-4">
      <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <Search aria-hidden="true" className="text-accent" size={15} />
        Search
      </div>
      <div className="mt-3 flex gap-2">
        <input
          className="cs-input h-8 min-w-0 flex-1"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void runSearch();
            }
          }}
          placeholder="CSS selector, text, class, id, role"
          value={query}
        />
        <button className="cs-btn shrink-0" onClick={() => void runSearch()} type="button">
          <Search aria-hidden="true" size={13} />
          Find
        </button>
      </div>
      {searchResults.length > 0 ? (
        <div className="mt-3 max-h-56 overflow-auto rounded-xl border border-line">
          {searchResults.map((result) => (
            <button
              className="block w-full border-b border-line/70 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-accent-softer"
              key={result.selector}
              onClick={() => void selectSearchResult(result.selector)}
              type="button"
            >
              <span className="block truncate text-xs font-semibold text-ink">
                {resultTitle(result)}
              </span>
              <span className="mt-0.5 block truncate font-mono text-[10px] text-muted">
                {result.selector}
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-muted">
                {formatPixels(result.rect.width)} × {formatPixels(result.rect.height)}
                {result.textPreview.length > 0 ? ` · ${result.textPreview}` : ""}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );

  const techSection = (
    <section className="cs-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <LayoutPanelLeft aria-hidden="true" className="text-accent" size={15} />
          Page tech
        </div>
        <button
          className="cs-icon-btn h-7 w-7"
          onClick={() => setTech(null)}
          title="Detect again"
          type="button"
        >
          <RefreshCcw aria-hidden="true" size={12} />
        </button>
      </div>
      {tech === null ? (
        <p className="mt-2 text-2xs text-muted">Detecting…</p>
      ) : tech.length === 0 ? (
        <p className="mt-2 text-2xs text-muted">No frameworks or platforms detected.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tech.map((entry) => (
            <span
              className="rounded-full bg-accent-soft px-2.5 py-1 text-2xs font-medium text-accent-hover"
              key={entry.name}
              title={entry.evidence}
            >
              {entry.name}
            </span>
          ))}
        </div>
      )}
    </section>
  );

  if (selectedElement === null) {
    return (
      <div className="space-y-3">
        <EmptyInspector />
        {techSection}
        {searchSection}
      </div>
    );
  }

  const rect = selectedElement.rect;

  return (
    <div className="space-y-3">
      <div className="cs-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="cs-heading">Element</p>
            <h2 className="mt-0.5 break-words font-mono text-lg font-semibold text-accent-hover">
              &lt;{selectedElement.tagName}&gt;
            </h2>
          </div>
          <span className="cs-chip shrink-0 tabular-nums">
            {formatPixels(rect.width)} × {formatPixels(rect.height)}
          </span>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-line px-3">
          <PreviewRow icon={Hash} label="Selector" value={selectedElement.selector} />
          <PreviewRow icon={Rows3} label="DOM path">
            <div className="flex flex-wrap items-center gap-1">
              {selectedElement.domPath.split(" > ").map((segment, index, array) => {
                const isLast = index === array.length - 1;
                const depth = array.length - 1 - index;
                return (
                  <span key={index} className="flex items-center gap-1">
                    <button
                      className={`font-mono text-[10px] ${
                        isLast
                          ? "font-semibold text-accent"
                          : "text-slate-500 hover:text-slate-900 hover:underline"
                      }`}
                      onClick={() => {
                        if (!isLast) {
                          sendMessageToActiveTab({
                            type: "SELECT_ANCESTOR",
                            payload: { depth },
                          }).catch(console.error);
                        }
                      }}
                      type="button"
                    >
                      {segment}
                    </button>
                    {!isLast && <span className="text-[10px] text-slate-300">/</span>}
                  </span>
                );
              })}
            </div>
          </PreviewRow>
          <PreviewRow icon={Type} label="Text" value={selectedElement.textPreview || "None"} />
          <PreviewRow
            icon={LayoutPanelLeft}
            label="Bounds"
            value={`${formatPixels(rect.left)}, ${formatPixels(rect.top)} | ${formatPixels(rect.width)} x ${formatPixels(rect.height)}`}
          />
        </div>
      </div>
      <section className="cs-card p-4">
        <h3 className="text-sm font-semibold tracking-tight">Tools</h3>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <button className="cs-btn" onClick={() => void pinCard("styles")} type="button">
            <Pin aria-hidden="true" size={13} />
            Pin styles
          </button>
          <button className="cs-btn" onClick={() => void pinCard("audit")} type="button">
            <ShieldCheck aria-hidden="true" size={13} />
            Pin audit
          </button>
          <button className="cs-btn" onClick={() => void startTextEdit()} type="button">
            <Edit3 aria-hidden="true" size={13} />
            Edit text
          </button>
          <button className="cs-btn" onClick={() => void clearPins()} type="button">
            <Trash2 aria-hidden="true" size={13} />
            Clear pins
          </button>
        </div>
      </section>

      <section className="cs-card p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold tracking-tight">Code</h3>
          {copyFeedback !== null ? (
            <span className="rounded-xl bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
              {copyFeedback} copied
            </span>
          ) : null}
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <button
            className="cs-btn"
            onClick={() => void requestElementCss(false)}
            title="Extract this element's effective CSS"
            type="button"
          >
            <Code2 aria-hidden="true" size={13} />
            Get CSS
          </button>
          <button
            className="cs-btn"
            onClick={() => void requestElementCss(true)}
            title="Extract HTML + CSS for this element and its children"
            type="button"
          >
            <FileCode2 aria-hidden="true" size={13} />
            Get component
          </button>
          <button
            className="cs-btn"
            disabled={capturing}
            onClick={() => void captureElementScreenshot()}
            title="Download a PNG of this element"
            type="button"
          >
            <Camera aria-hidden="true" size={13} />
            {capturing ? "Capturing..." : "Screenshot"}
          </button>
        </div>

        {elementCssResult !== null ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <button
                className="cs-btn px-2 py-1"
                onClick={() => void copyText(elementCssResult.css, "CSS")}
                type="button"
              >
                <Clipboard aria-hidden="true" size={12} />
                Copy CSS
              </button>
              {elementCssResult.html !== null ? (
                <>
                  <button
                    className="cs-btn px-2 py-1"
                    onClick={() => void copyText(elementCssResult.html ?? "", "HTML")}
                    type="button"
                  >
                    <Clipboard aria-hidden="true" size={12} />
                    Copy HTML
                  </button>
                  <button
                    className="cs-btn px-2 py-1"
                    onClick={() =>
                      void copyText(
                        `${elementCssResult.html ?? ""}

<style>
${elementCssResult.css}
</style>`,
                        "Component",
                      )
                    }
                    type="button"
                  >
                    <Clipboard aria-hidden="true" size={12} />
                    Copy both
                  </button>
                </>
              ) : null}
            </div>
            {elementCssResult.source === "computed" ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] leading-4 text-amber-800">
                Approximate — the page&apos;s stylesheets are cross-origin, so these are computed
                (resolved) values, not the author&apos;s source rules.
              </p>
            ) : null}
            <pre className="max-h-40 overflow-auto rounded-xl bg-[#211d3d] p-2.5 font-mono text-[10px] leading-4 text-slate-100">
              <code>{elementCssResult.css}</code>
            </pre>
          </div>
        ) : null}
      </section>

      <section className="cs-card p-4">
        <h3 className="text-sm font-semibold tracking-tight">Move &amp; Position</h3>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5">
          <button
            className={
              moveMode
                ? "inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-xs font-semibold text-white shadow-accent-glow transition-colors hover:bg-accent-hover"
                : "cs-btn"
            }
            onClick={() => void toggleMoveMode()}
            type="button"
          >
            <Move aria-hidden="true" size={13} />
            {moveMode ? "Drag on" : "Drag"}
          </button>
          <button className="cs-btn" onClick={() => void restorePosition()} type="button">
            <RotateCcw aria-hidden="true" size={13} />
            Restore
          </button>
          <button className="cs-btn" onClick={() => void moveElement("previous")} type="button">
            <ArrowLeft aria-hidden="true" size={13} />
            Previous sibling
          </button>
          <button className="cs-btn" onClick={() => void moveElement("next")} type="button">
            <ArrowRight aria-hidden="true" size={13} />
            Next sibling
          </button>
          <button className="cs-btn" onClick={() => void moveElement("out-before")} type="button">
            <ArrowUpToLine aria-hidden="true" size={13} />
            Above parent
          </button>
          <button className="cs-btn" onClick={() => void moveElement("out-after")} type="button">
            <ArrowDownToLine aria-hidden="true" size={13} />
            Under parent
          </button>
        </div>
        {multiSelection.count > 1 ? (
          <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
            <p className="text-xs font-semibold text-violet-900">
              {multiSelection.count} elements selected
            </p>
            <p className="mt-1 text-2xs leading-4 text-violet-700">
              Align the shift-clicked elements to the primary selection.
            </p>
            <div className="mt-2 grid grid-cols-6 gap-1.5">
              <button
                className="inline-flex h-8 items-center justify-center rounded-xl border border-violet-200 bg-panel text-violet-700 transition-colors hover:bg-violet-50"
                onClick={() => void alignSelected("left")}
                title="Align left edges"
                type="button"
              >
                <AlignStartVertical aria-hidden="true" size={14} />
              </button>
              <button
                className="inline-flex h-8 items-center justify-center rounded-xl border border-violet-200 bg-panel text-violet-700 transition-colors hover:bg-violet-50"
                onClick={() => void alignSelected("center-x")}
                title="Align horizontal centers"
                type="button"
              >
                <AlignCenterVertical aria-hidden="true" size={14} />
              </button>
              <button
                className="inline-flex h-8 items-center justify-center rounded-xl border border-violet-200 bg-panel text-violet-700 transition-colors hover:bg-violet-50"
                onClick={() => void alignSelected("right")}
                title="Align right edges"
                type="button"
              >
                <AlignEndVertical aria-hidden="true" size={14} />
              </button>
              <button
                className="inline-flex h-8 items-center justify-center rounded-xl border border-violet-200 bg-panel text-violet-700 transition-colors hover:bg-violet-50"
                onClick={() => void alignSelected("top")}
                title="Align top edges"
                type="button"
              >
                <AlignStartHorizontal aria-hidden="true" size={14} />
              </button>
              <button
                className="inline-flex h-8 items-center justify-center rounded-xl border border-violet-200 bg-panel text-violet-700 transition-colors hover:bg-violet-50"
                onClick={() => void alignSelected("center-y")}
                title="Align vertical centers"
                type="button"
              >
                <AlignCenterHorizontal aria-hidden="true" size={14} />
              </button>
              <button
                className="inline-flex h-8 items-center justify-center rounded-xl border border-violet-200 bg-panel text-violet-700 transition-colors hover:bg-violet-50"
                onClick={() => void alignSelected("bottom")}
                title="Align bottom edges"
                type="button"
              >
                <AlignEndHorizontal aria-hidden="true" size={14} />
              </button>
            </div>
          </div>
        ) : null}
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          <button className="cs-btn" onClick={() => void nudgeElement(0, -8)} type="button">
            <ArrowUp aria-hidden="true" size={13} />
            Up
          </button>
          <button className="cs-btn" onClick={() => void nudgeElement(-8, 0)} type="button">
            <ArrowLeft aria-hidden="true" size={13} />
            Left
          </button>
          <button className="cs-btn" onClick={() => void nudgeElement(8, 0)} type="button">
            <ArrowRight aria-hidden="true" size={13} />
            Right
          </button>
          <button className="cs-btn" onClick={() => void nudgeElement(0, 8)} type="button">
            <ArrowDown aria-hidden="true" size={13} />
            Down
          </button>
        </div>
      </section>
      <section className="cs-card p-4">
        <h3 className="text-sm font-semibold tracking-tight">Image</h3>
        <div className="mt-2.5 flex gap-2">
          <input
            className="cs-input h-8 min-w-0 flex-1"
            onChange={(event) => setImageUrl(event.target.value)}
            placeholder={selectedElement.attributes.src || "Image URL or data URL"}
            value={imageUrl}
          />
          <button
            className="cs-btn shrink-0"
            disabled={imageUrl.trim().length === 0}
            onClick={() => void replaceImage(imageUrl)}
            type="button"
          >
            <ImagePlus aria-hidden="true" size={13} />
            Apply
          </button>
        </div>
        <input
          accept="image/*"
          className="hidden"
          onChange={(event) => void handleImageFileChange(event)}
          ref={imageFileInputRef}
          type="file"
        />
        <button
          className="cs-btn mt-2 w-full"
          onClick={() => imageFileInputRef.current?.click()}
          type="button"
        >
          <Upload aria-hidden="true" size={13} />
          Upload
        </button>
      </section>

      {techSection}

      {searchSection}

      <div className="cs-card p-4">
        <h3 className="text-sm font-semibold tracking-tight">Identity</h3>
        <dl className="mt-2.5 grid grid-cols-[82px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
          <dt className="font-medium text-muted">ID</dt>
          <dd className="break-words font-mono text-ink">{selectedElement.id || "None"}</dd>
          <dt className="font-medium text-muted">Classes</dt>
          <dd className="break-words font-mono text-ink">
            {selectedElement.classList.length > 0 ? selectedElement.classList.join(" ") : "None"}
          </dd>
          <dt className="font-medium text-muted">Parent</dt>
          <dd className="break-words font-mono text-ink">
            {selectedElement.parentLayout?.selector ?? "None"}
          </dd>
        </dl>
      </div>

      <AttributeEditor element={selectedElement} />
    </div>
  );
};
