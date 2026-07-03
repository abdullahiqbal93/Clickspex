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

import type {
  AlignEdge,
  ComponentSourceInfo,
  DomMoveDirection,
  ElementSearchResult,
  ElementSnapshot,
  PageTechInfo,
} from "@ui-buddy/shared";

const EDITOR_TEMPLATES: Array<{ id: string; label: string; template: string }> = [
  { id: "vscode", label: "VS Code", template: "vscode://file/{file}:{line}:{column}" },
  { id: "cursor", label: "Cursor", template: "cursor://file/{file}:{line}:{column}" },
  {
    id: "webstorm",
    label: "WebStorm",
    template: "jetbrains://web-storm/navigate/reference?path={file}:{line}",
  },
];

const buildEditorUrl = (template: string, source: ComponentSourceInfo): string =>
  template
    .replaceAll("{file}", source.file ?? "")
    .replaceAll("{line}", String(source.line ?? 1))
    .replaceAll("{column}", String(source.column ?? 1));

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
  <div className="grid grid-cols-[22px_82px_minmax(0,1fr)] items-start gap-2 border-b border-slate-100 py-2 last:border-b-0">
    <Icon aria-hidden="true" className="mt-0.5 text-slate-400" size={15} />
    <span className="text-xs font-medium text-slate-500">{label}</span>
    <span className="break-words text-xs text-slate-900">{children ?? value}</span>
  </div>
);

const EmptyInspector = () => (
  <div className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
    <div className="flex items-center gap-2 text-sm font-semibold">
      <MousePointer2 aria-hidden="true" size={16} />
      Selection
    </div>
    <p className="mt-2 text-xs text-muted">Idle</p>
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
  const [sourceInfo, setSourceInfo] = useState<ComponentSourceInfo | null>(null);
  const [sourceLookupState, setSourceLookupState] = useState<"idle" | "loading" | "done">("idle");
  const [editorId, setEditorId] = useState("vscode");
  const [capturing, setCapturing] = useState(false);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const searchResults = usePanelStore((state) => state.searchResults);
  const tech = usePanelStore((state) => state.tech);
  const setTech = usePanelStore((state) => state.setTech);
  const elementCssResult = usePanelStore((state) => state.elementCssResult);
  const multiSelection = usePanelStore((state) => state.multiSelection);
  const setError = usePanelStore((state) => state.setError);

  useEffect(() => {
    void chrome.storage.local.get("ubEditorId").then((stored) => {
      if (typeof stored.ubEditorId === "string") {
        setEditorId(stored.ubEditorId);
      }
    });
  }, []);

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
    setSourceInfo(null);
    setSourceLookupState("idle");
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

  const findSource = async () => {
    setError(null);
    setSourceLookupState("loading");
    try {
      await sendMessageToActiveTab({ type: "MARK_SELECTED_FOR_SOURCE" });
      const result = await callBackground<ComponentSourceInfo | null>("lookup-source");
      setSourceInfo(result);
      setSourceLookupState("done");
    } catch (caughtError) {
      setSourceLookupState("done");
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to look up the source.",
      );
    }
  };

  const openInEditor = async () => {
    if (sourceInfo?.file == null) {
      return;
    }

    const editor = EDITOR_TEMPLATES.find((entry) => entry.id === editorId) ?? EDITOR_TEMPLATES[0]!;
    await chrome.storage.local.set({ ubEditorId: editor.id });

    try {
      await chrome.tabs.create({ url: buildEditorUrl(editor.template, sourceInfo), active: false });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to open the editor.");
    }
  };

  const captureElementScreenshot = async () => {
    if (selectedElement === null) {
      return;
    }

    setError(null);
    setCapturing(true);
    try {
      await sendMessageToActiveTab({ type: "SCROLL_SELECTED_INTO_VIEW" });
      await new Promise((resolve) => setTimeout(resolve, 400));

      const dataUrl = await callBackground<string>("capture-tab");
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
      anchor.download = `ui-buddy-${selectedElement.tagName}-${Date.now()}.png`;
      anchor.click();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to capture a screenshot.",
      );
    } finally {
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
    <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Search aria-hidden="true" size={16} />
        Search
      </div>
      <div className="mt-3 flex gap-2">
        <input
          className="h-8 min-w-0 flex-1 rounded-md border border-border px-2 text-xs outline-none transition focus:border-accent focus:ring-2 focus:ring-blue-100"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void runSearch();
            }
          }}
          placeholder="CSS selector, text, class, id, role"
          value={query}
        />
        <button
          className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          onClick={() => void runSearch()}
          type="button"
        >
          <Search aria-hidden="true" size={13} />
          Find
        </button>
      </div>
      {searchResults.length > 0 ? (
        <div className="mt-3 max-h-56 overflow-auto rounded-md border border-slate-100">
          {searchResults.map((result) => (
            <button
              className="block w-full border-b border-slate-100 px-3 py-2 text-left transition last:border-b-0 hover:bg-slate-50"
              key={result.selector}
              onClick={() => void selectSearchResult(result.selector)}
              type="button"
            >
              <span className="block truncate text-xs font-semibold text-slate-900">
                {resultTitle(result)}
              </span>
              <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-500">
                {result.selector}
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                {formatPixels(result.rect.width)} x {formatPixels(result.rect.height)}
                {result.textPreview.length > 0 ? ` | ${result.textPreview}` : ""}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );

  const techSection = (
    <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <LayoutPanelLeft aria-hidden="true" size={16} />
          Page tech
        </div>
        <button
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-slate-500 transition hover:bg-slate-50"
          onClick={() => setTech(null)}
          title="Detect again"
          type="button"
        >
          <RefreshCcw aria-hidden="true" size={12} />
        </button>
      </div>
      {tech === null ? (
        <p className="mt-2 text-xs text-muted">Detecting...</p>
      ) : tech.length === 0 ? (
        <p className="mt-2 text-xs text-muted">No frameworks or platforms detected.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tech.map((entry) => (
            <span
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700"
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
  const attributes = Object.entries(selectedElement.attributes);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-normal text-slate-500">
              Element
            </p>
            <h2 className="mt-1 break-words text-lg font-semibold text-slate-950">
              {selectedElement.tagName}
            </h2>
          </div>
          <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
            {formatPixels(rect.width)} x {formatPixels(rect.height)}
          </span>
        </div>

        <div className="mt-3 overflow-hidden rounded-md border border-slate-100">
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

      <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <h3 className="text-sm font-semibold">Tools</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => void pinCard("styles")}
            type="button"
          >
            <Pin aria-hidden="true" size={13} />
            Pin styles
          </button>
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => void pinCard("audit")}
            type="button"
          >
            <ShieldCheck aria-hidden="true" size={13} />
            Pin audit
          </button>
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => void startTextEdit()}
            type="button"
          >
            <Edit3 aria-hidden="true" size={13} />
            Edit text
          </button>
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => void clearPins()}
            type="button"
          >
            <Trash2 aria-hidden="true" size={13} />
            Clear pins
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Code &amp; Source</h3>
          {copyFeedback !== null ? (
            <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              {copyFeedback} copied
            </span>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => void requestElementCss(false)}
            title="Extract this element's effective CSS"
            type="button"
          >
            <Code2 aria-hidden="true" size={13} />
            Get CSS
          </button>
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => void requestElementCss(true)}
            title="Extract HTML + CSS for this element and its children"
            type="button"
          >
            <FileCode2 aria-hidden="true" size={13} />
            Get component
          </button>
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={sourceLookupState === "loading"}
            onClick={() => void findSource()}
            title="Resolve the source component (works best in dev builds)"
            type="button"
          >
            <Search aria-hidden="true" size={13} />
            {sourceLookupState === "loading" ? "Finding..." : "Find source"}
          </button>
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
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
                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
                onClick={() => void copyText(elementCssResult.css, "CSS")}
                type="button"
              >
                <Clipboard aria-hidden="true" size={12} />
                Copy CSS
              </button>
              {elementCssResult.html !== null ? (
                <>
                  <button
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
                    onClick={() => void copyText(elementCssResult.html ?? "", "HTML")}
                    type="button"
                  >
                    <Clipboard aria-hidden="true" size={12} />
                    Copy HTML
                  </button>
                  <button
                    className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
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
            <pre className="max-h-40 overflow-auto rounded-md bg-slate-950 p-2 text-[10px] leading-4 text-slate-50">
              <code>{elementCssResult.css}</code>
            </pre>
          </div>
        ) : null}

        {sourceLookupState === "done" ? (
          <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-3">
            {sourceInfo === null ? (
              <p className="text-xs leading-5 text-muted">
                No component metadata on this page. Source lookup works on React/Vue{" "}
                <span className="font-semibold">development builds</span>. Server-rendered sites
                (Laravel Blade, WordPress, plain HTML) don&apos;t expose component sources — for
                those, use the ui-buddy CLI (<code className="font-mono">ui-buddy index</code>) to
                map selectors to source files.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-900">
                  {sourceInfo.componentName ?? "Unnamed component"}
                </p>
                {sourceInfo.file !== null ? (
                  <>
                    <p className="break-all font-mono text-[10px] text-slate-600">
                      {sourceInfo.file}
                      {sourceInfo.line !== null ? `:${sourceInfo.line}` : ""}
                    </p>
                    <div className="flex items-center gap-2">
                      <select
                        aria-label="Editor"
                        className="h-7 rounded-md border border-border bg-white px-1.5 text-[11px] text-slate-700 outline-none"
                        onChange={(event) => setEditorId(event.target.value)}
                        value={editorId}
                      >
                        {EDITOR_TEMPLATES.map((editor) => (
                          <option key={editor.id} value={editor.id}>
                            {editor.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[11px] font-medium text-white transition hover:bg-blue-700"
                        onClick={() => void openInEditor()}
                        type="button"
                      >
                        Open in editor
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] leading-4 text-muted">
                    Component name found, but no file location (production build).
                  </p>
                )}
              </div>
            )}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <h3 className="text-sm font-semibold">Move & Position</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            className={`inline-flex h-8 items-center justify-center gap-2 rounded-md px-2 text-xs font-medium transition ${
              moveMode
                ? "bg-accent text-white hover:bg-blue-700"
                : "border border-border text-slate-700 hover:bg-slate-50"
            }`}
            onClick={() => void toggleMoveMode()}
            type="button"
          >
            <Move aria-hidden="true" size={13} />
            {moveMode ? "Drag on" : "Drag"}
          </button>
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => void restorePosition()}
            type="button"
          >
            <RotateCcw aria-hidden="true" size={13} />
            Restore
          </button>
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => void moveElement("previous")}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={13} />
            Previous sibling
          </button>
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => void moveElement("next")}
            type="button"
          >
            <ArrowRight aria-hidden="true" size={13} />
            Next sibling
          </button>
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => void moveElement("out-before")}
            type="button"
          >
            <ArrowUpToLine aria-hidden="true" size={13} />
            Above parent
          </button>
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => void moveElement("out-after")}
            type="button"
          >
            <ArrowDownToLine aria-hidden="true" size={13} />
            Under parent
          </button>
        </div>
        {multiSelection.count > 1 ? (
          <div className="mt-3 rounded-md border border-purple-200 bg-purple-50 p-3">
            <p className="text-xs font-semibold text-purple-900">
              {multiSelection.count} elements selected
            </p>
            <p className="mt-1 text-[11px] leading-4 text-purple-700">
              Align the shift-clicked elements to the primary selection.
            </p>
            <div className="mt-2 grid grid-cols-6 gap-1.5">
              <button
                className="inline-flex h-8 items-center justify-center rounded-md border border-purple-200 bg-white text-purple-800 transition hover:bg-purple-100"
                onClick={() => void alignSelected("left")}
                title="Align left edges"
                type="button"
              >
                <AlignStartVertical aria-hidden="true" size={14} />
              </button>
              <button
                className="inline-flex h-8 items-center justify-center rounded-md border border-purple-200 bg-white text-purple-800 transition hover:bg-purple-100"
                onClick={() => void alignSelected("center-x")}
                title="Align horizontal centers"
                type="button"
              >
                <AlignCenterVertical aria-hidden="true" size={14} />
              </button>
              <button
                className="inline-flex h-8 items-center justify-center rounded-md border border-purple-200 bg-white text-purple-800 transition hover:bg-purple-100"
                onClick={() => void alignSelected("right")}
                title="Align right edges"
                type="button"
              >
                <AlignEndVertical aria-hidden="true" size={14} />
              </button>
              <button
                className="inline-flex h-8 items-center justify-center rounded-md border border-purple-200 bg-white text-purple-800 transition hover:bg-purple-100"
                onClick={() => void alignSelected("top")}
                title="Align top edges"
                type="button"
              >
                <AlignStartHorizontal aria-hidden="true" size={14} />
              </button>
              <button
                className="inline-flex h-8 items-center justify-center rounded-md border border-purple-200 bg-white text-purple-800 transition hover:bg-purple-100"
                onClick={() => void alignSelected("center-y")}
                title="Align vertical centers"
                type="button"
              >
                <AlignCenterHorizontal aria-hidden="true" size={14} />
              </button>
              <button
                className="inline-flex h-8 items-center justify-center rounded-md border border-purple-200 bg-white text-purple-800 transition hover:bg-purple-100"
                onClick={() => void alignSelected("bottom")}
                title="Align bottom edges"
                type="button"
              >
                <AlignEndHorizontal aria-hidden="true" size={14} />
              </button>
            </div>
          </div>
        ) : null}
        <div className="mt-3 grid grid-cols-4 gap-2">
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => void nudgeElement(0, -8)}
            type="button"
          >
            <ArrowUp aria-hidden="true" size={13} />
            Up
          </button>
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => void nudgeElement(-8, 0)}
            type="button"
          >
            <ArrowLeft aria-hidden="true" size={13} />
            Left
          </button>
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => void nudgeElement(8, 0)}
            type="button"
          >
            <ArrowRight aria-hidden="true" size={13} />
            Right
          </button>
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => void nudgeElement(0, 8)}
            type="button"
          >
            <ArrowDown aria-hidden="true" size={13} />
            Down
          </button>
        </div>
      </section>
      <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <h3 className="text-sm font-semibold">Image</h3>
        <div className="mt-3 flex gap-2">
          <input
            className="h-8 min-w-0 flex-1 rounded-md border border-border px-2 text-xs outline-none transition focus:border-accent focus:ring-2 focus:ring-blue-100"
            onChange={(event) => setImageUrl(event.target.value)}
            placeholder={selectedElement.attributes.src || "Image URL or data URL"}
            value={imageUrl}
          />
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
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
          className="mt-2 inline-flex h-8 w-full items-center justify-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          onClick={() => imageFileInputRef.current?.click()}
          type="button"
        >
          <Upload aria-hidden="true" size={13} />
          Upload
        </button>
      </section>

      {techSection}

      {searchSection}

      <div className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <h3 className="text-sm font-semibold">Identity</h3>
        <dl className="mt-3 grid grid-cols-[82px_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
          <dt className="font-medium text-slate-500">ID</dt>
          <dd className="break-words text-slate-900">{selectedElement.id || "None"}</dd>
          <dt className="font-medium text-slate-500">Classes</dt>
          <dd className="break-words text-slate-900">
            {selectedElement.classList.length > 0 ? selectedElement.classList.join(" ") : "None"}
          </dd>
          <dt className="font-medium text-slate-500">Parent</dt>
          <dd className="break-words text-slate-900">
            {selectedElement.parentLayout?.selector ?? "None"}
          </dd>
        </dl>
      </div>

      <div className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <h3 className="text-sm font-semibold">Attributes</h3>
        <div className="mt-3 max-h-48 overflow-auto rounded-md border border-slate-100">
          {attributes.length > 0 ? (
            attributes.map(([name, value]) => (
              <div
                className="grid grid-cols-[86px_minmax(0,1fr)] gap-2 border-b border-slate-100 px-3 py-2 text-xs last:border-b-0"
                key={name}
              >
                <span className="font-medium text-slate-500">{name}</span>
                <span className="break-words text-slate-900">{value}</span>
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-muted">None</div>
          )}
        </div>
      </div>
    </div>
  );
};
