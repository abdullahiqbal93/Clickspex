import { cssAdapter, tailwindAdapter } from "@ui-buddy/adapters";
import { createUIChangeIntent, summarizeChangeIntentAsMarkdown } from "@ui-buddy/core";
import { Clipboard, Code2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { readPageContext, type PageContext } from "../../chrome/session";
import { usePanelStore } from "../store";

const fallbackPageContext = (): PageContext => ({
  pageUrl: "about:blank",
  viewport: {
    width: 0,
    height: 0,
    devicePixelRatio: 1,
  },
});

type ExportBlockProps = {
  title: string;
  content: string;
  warnings?: string[];
};

const ExportBlock = ({ title, content, warnings = [] }: ExportBlockProps) => {
  const copy = async () => {
    await navigator.clipboard.writeText(content);
  };

  return (
    <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border text-slate-700 transition hover:bg-slate-50"
          onClick={() => void copy()}
          title="Copy"
          type="button"
        >
          <Clipboard aria-hidden="true" size={14} />
        </button>
      </div>
      {warnings.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-amber-700">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-50">
        <code>{content || "No output"}</code>
      </pre>
    </section>
  );
};

export const ExportPanel = () => {
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const accessibilityNotes = usePanelStore((state) => state.accessibilityNotes);
  const changes = usePanelStore((state) => state.changes);
  const selectedElement = usePanelStore((state) => state.selectedElement);

  useEffect(() => {
    let disposed = false;

    readPageContext()
      .then((context) => {
        if (!disposed) {
          setPageContext(context);
        }
      })
      .catch(() => {
        if (!disposed) {
          setPageContext(null);
        }
      });

    return () => {
      disposed = true;
    };
  }, [selectedElement]);

  const changeIntent = useMemo(() => {
    if (selectedElement === null) {
      return null;
    }

    const context = pageContext ?? fallbackPageContext();
    return createUIChangeIntent({
      pageUrl: context.pageUrl,
      viewport: context.viewport,
      target: selectedElement,
      changes,
      accessibilityNotes,
    });
  }, [accessibilityNotes, changes, pageContext, selectedElement]);

  if (selectedElement === null || changeIntent === null) {
    return (
      <div className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Code2 aria-hidden="true" size={16} />
          Export
        </div>
        <p className="mt-2 text-xs text-muted">Idle</p>
      </div>
    );
  }

  const cssExport = cssAdapter.generateExport(changeIntent);
  const tailwindExport = tailwindAdapter.generateExport(changeIntent);
  const jsonExport = JSON.stringify(changeIntent, null, 2);
  const markdownExport = summarizeChangeIntentAsMarkdown(changeIntent);

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-border bg-panel/80 backdrop-blur-sm p-4 shadow-card">
        <h2 className="text-sm font-semibold">Export</h2>
        <p className="mt-1 text-xs leading-5 text-muted">
          Tailwind suggestions are value-based approximations. CLI and MCP tools can turn exported
          JSON into source-aware patch previews for review.
        </p>
      </section>
      <ExportBlock content={cssExport.content} title="CSS" warnings={cssExport.warnings} />
      <ExportBlock
        content={tailwindExport.content}
        title="Tailwind"
        warnings={tailwindExport.warnings}
      />
      <ExportBlock content={jsonExport} title="JSON" />
      <ExportBlock content={markdownExport} title="Markdown" />
    </div>
  );
};
