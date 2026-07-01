import { Hash, LayoutPanelLeft, MousePointer2, Rows3, Type } from "lucide-react";

import { sendMessageToActiveTab } from "../../chrome/messaging";
import type { ElementSnapshot } from "@ui-devtools/shared";

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
    <span className="break-words text-xs text-slate-900">
      {children ?? value}
    </span>
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

export const InspectorPanel = ({ selectedElement }: InspectorPanelProps) => {
  if (selectedElement === null) {
    return <EmptyInspector />;
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
                          sendMessageToActiveTab({ type: "SELECT_ANCESTOR", payload: { depth } }).catch(console.error);
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
