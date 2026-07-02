import {
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpToLine,
  Edit3,
  Hash,
  ImagePlus,
  LayoutPanelLeft,
  MousePointer2,
  Move,
  Pin,
  Redo2,
  RotateCcw,
  Rows3,
  Search,
  ShieldCheck,
  Trash2,
  Type,
  Undo2,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";

import { sendMessageToActiveTab } from "../../chrome/messaging";
import { usePanelStore } from "../store";

import type { DomMoveDirection, ElementSearchResult, ElementSnapshot } from "@ui-buddy/shared";

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
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const searchResults = usePanelStore((state) => state.searchResults);
  const setError = usePanelStore((state) => state.setError);

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

  const undoMovePosition = async () => {
    setError(null);
    try {
      await sendMessageToActiveTab({ type: "UNDO_MOVE_POSITION" });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to undo move position.",
      );
    }
  };

  const redoMovePosition = async () => {
    setError(null);
    try {
      await sendMessageToActiveTab({ type: "REDO_MOVE_POSITION" });
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Unable to redo move position.",
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

  if (selectedElement === null) {
    return (
      <div className="space-y-3">
        <EmptyInspector />
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
            onClick={() => void undoMovePosition()}
            type="button"
          >
            <Undo2 aria-hidden="true" size={13} />
            Undo
          </button>
          <button
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border px-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
            onClick={() => void redoMovePosition()}
            type="button"
          >
            <Redo2 aria-hidden="true" size={13} />
            Redo
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
