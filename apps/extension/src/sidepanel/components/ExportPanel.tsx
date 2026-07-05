import { cssAdapter, tailwindAdapter } from "@ui-buddy/adapters";
import {
  createUIChangeSession,
  summarizeSessionAsAgentPrompt,
  summarizeSessionAsMarkdown,
  type SessionElementInput,
} from "@ui-buddy/core";
import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  Clipboard,
  Code2,
  Download,
  Layers,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { callBackground } from "../../chrome/messaging";
import { readPageContext, type PageContext } from "../../chrome/session";
import { usePanelStore } from "../store";

import { CodeSyncPanel } from "./CodeSyncPanel";

import type { ElementSnapshot, PageTechInfo } from "@ui-buddy/shared";

const fallbackPageContext = (): PageContext => ({
  pageUrl: "about:blank",
  viewport: {
    width: 0,
    height: 0,
    devicePixelRatio: 1,
  },
});

const EMPTY_BOX_SIDE = { top: "0px", right: "0px", bottom: "0px", left: "0px" };

/** Placeholder snapshot for a selector we never captured a baseline for. */
const minimalSnapshot = (selector: string): ElementSnapshot => ({
  tagName: selector.split(/[.#[:> ]/)[0] || "div",
  id: "",
  classList: [],
  textPreview: "",
  attributes: {},
  selector,
  domPath: selector,
  rect: { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 },
  computedStyles: {},
  boxModel: {
    margin: EMPTY_BOX_SIDE,
    border: EMPTY_BOX_SIDE,
    padding: EMPTY_BOX_SIDE,
    content: { width: "0px", height: "0px" },
  },
  parentLayout: null,
});

const formatRawCssRule = (selector: string, css: string): string => {
  const declarations = css
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration.length > 0)
    .map((declaration) => `  ${declaration};`)
    .join("\n");

  return declarations.length === 0 ? "" : `${selector} {\n${declarations}\n}`;
};

type ExportBlockProps = {
  title: string;
  content: string;
  warnings?: string[];
  filename?: string;
};

const downloadContent = (content: string, filename: string) => {
  const blob = new Blob([content], { type: "text/plain" });
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
};

const ExportBlock = ({ title, content, warnings = [], filename }: ExportBlockProps) => {
  const copy = async () => {
    await navigator.clipboard.writeText(content);
  };

  return (
    <section className="ub-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <div className="flex items-center gap-1">
          {filename !== undefined && content.length > 0 ? (
            <button
              className="ub-icon-btn"
              onClick={() => downloadContent(content, filename)}
              title={`Download ${filename}`}
              type="button"
            >
              <Download aria-hidden="true" size={14} />
            </button>
          ) : null}
          <button className="ub-icon-btn" onClick={() => void copy()} title="Copy" type="button">
            <Clipboard aria-hidden="true" size={14} />
          </button>
        </div>
      </div>
      {warnings.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-xl bg-amber-50 px-3 py-2 text-2xs text-amber-800">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-[#211d3d] p-3 font-mono text-2xs leading-5 text-slate-100 shadow-inner">
        <code>{content || "No output"}</code>
      </pre>
    </section>
  );
};

export const ExportPanel = () => {
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const accessibilityNotes = usePanelStore((state) => state.accessibilityNotes);
  const changes = usePanelStore((state) => state.changes);
  const rawCssEntries = usePanelStore((state) => state.rawCssEntries);
  const structuralEdits = usePanelStore((state) => state.structuralEdits);
  const snapshotBySelector = usePanelStore((state) => state.snapshotBySelector);
  const selectedElement = usePanelStore((state) => state.selectedElement);
  const tech = usePanelStore((state) => state.tech);
  const setTech = usePanelStore((state) => state.setTech);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Detect frameworks so Tailwind output only shows for Tailwind projects.
  useEffect(() => {
    if (tech !== null) {
      return;
    }

    callBackground<PageTechInfo[]>("detect-tech")
      .then((detected) => setTech(detected))
      .catch(() => setTech([]));
  }, [tech, setTech]);

  const tailwindDetected = tech?.some((entry) => entry.name === "Tailwind CSS") ?? false;

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
  }, [changes, rawCssEntries, structuralEdits]);

  const session = useMemo(() => {
    const context = pageContext ?? fallbackPageContext();

    const selectors = new Set<string>();
    changes.forEach((change) => selectors.add(change.selector));
    rawCssEntries.forEach((entry) => selectors.add(entry.selector));

    const elements: SessionElementInput[] = Array.from(selectors).map((selector) => {
      const snapshot =
        snapshotBySelector[selector] ??
        (selectedElement?.selector === selector ? selectedElement : undefined) ??
        minimalSnapshot(selector);
      const rawCss = rawCssEntries.find((entry) => entry.selector === selector)?.css;

      return {
        target: snapshot,
        changes: changes.filter((change) => change.selector === selector),
        accessibilityNotes: selectedElement?.selector === selector ? accessibilityNotes : [],
        ...(rawCss !== undefined && rawCss.trim().length > 0 ? { rawCss } : {}),
      };
    });

    return createUIChangeSession({
      pageUrl: context.pageUrl,
      viewport: context.viewport,
      elements,
      structuralEdits,
      ...(tech !== null ? { frameworkHints: tech.map((entry) => entry.name) } : {}),
    });
  }, [
    accessibilityNotes,
    changes,
    pageContext,
    rawCssEntries,
    selectedElement,
    snapshotBySelector,
    structuralEdits,
    tech,
  ]);

  const hasContent = session.elements.length > 0 || session.structuralEdits.length > 0;

  if (!hasContent) {
    return (
      <div className="ub-card p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Code2 aria-hidden="true" size={16} />
          </span>
          <div>
            <h2 className="text-sm font-semibold tracking-tight">Export</h2>
            <p className="text-2xs text-muted">
              Idle - edit any elements (styles, raw CSS, moves, text, images) and the whole session
              shows up here.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const sessionCss = session.elements
    .map((intent) => {
      const base = cssAdapter.generateExport(intent).content;
      const raw =
        intent.rawCss !== undefined ? formatRawCssRule(intent.target.selector, intent.rawCss) : "";
      return [base, raw].filter((part) => part.trim().length > 0).join("\n\n");
    })
    .filter((part) => part.trim().length > 0)
    .join("\n\n");

  const sessionTailwind = session.elements
    .map((intent) => {
      const classes = tailwindAdapter.generateExport(intent).content.trim();
      return classes.length === 0 ? "" : `/* ${intent.target.selector} */\n${classes}`;
    })
    .filter((part) => part.length > 0)
    .join("\n\n");

  const agentPrompt = summarizeSessionAsAgentPrompt(session);
  const jsonExport = JSON.stringify(session, null, 2);
  const markdownExport = summarizeSessionAsMarkdown(session);

  const positionalSelectors = session.elements
    .map((intent) => intent.target.selector)
    .filter((selector) => selector.includes(":nth-of-type("));

  return (
    <div className="space-y-3">
      <section className="ub-card p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Layers aria-hidden="true" size={16} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight">Export session</h2>
            <p className="text-2xs text-muted">
              Every edited element and structural change as one bundle.
            </p>
          </div>
        </div>
        <div className="mt-3.5 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-accent-softer p-2.5 ring-1 ring-inset ring-accent-soft">
            <p className="text-lg font-semibold tabular-nums text-accent">
              {session.stats.editedElements}
            </p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Elements</p>
          </div>
          <div className="rounded-xl bg-accent-softer p-2.5 ring-1 ring-inset ring-accent-soft">
            <p className="text-lg font-semibold tabular-nums text-accent">
              {session.stats.styleChanges}
            </p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
              Style edits
            </p>
          </div>
          <div className="rounded-xl bg-accent-softer p-2.5 ring-1 ring-inset ring-accent-soft">
            <p className="text-lg font-semibold tabular-nums text-accent">
              {session.stats.structuralEdits}
            </p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted">Structural</p>
          </div>
        </div>
      </section>

      <CodeSyncPanel session={session} />

      {positionalSelectors.length > 0 ? (
        <section className="flex items-start gap-2 rounded-card border border-amber-200 bg-amber-50 p-3 text-amber-900">
          <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={14} />
          <div className="text-xs leading-5">
            <p className="font-semibold">Positional selectors</p>
            <p>
              {positionalSelectors.length} element(s) rely on :nth-of-type and may break when the
              page structure changes. Prefer stable ids or class names before applying to source.
            </p>
          </div>
        </section>
      ) : null}

      {session.structuralEdits.length > 0 ? (
        <section className="ub-card p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <Boxes aria-hidden="true" className="text-accent" size={15} />
            Structural edits
          </h3>
          <ul className="mt-3 space-y-1.5">
            {session.structuralEdits.map((edit) => (
              <li className="rounded-xl bg-slate-50 px-3 py-2 text-xs" key={edit.id}>
                <div className="flex items-center gap-2">
                  <span className="rounded-xl bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
                    {edit.kind}
                  </span>
                  <span className="text-ink">{edit.summary}</span>
                </div>
                <p className="mt-1 truncate font-mono text-[10px] text-muted">
                  {edit.target.selector}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ExportBlock content={sessionCss} filename="ui-buddy-session.css" title="CSS" />

      <section className="ub-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Sparkles aria-hidden="true" className="text-accent" size={15} />
          Copy for AI agent
        </div>
        <p className="mt-1 text-2xs text-muted">
          Paste into Cursor / Claude Code / any coding agent to apply these changes to your source.
        </p>
        <div className="mt-2">
          <button
            className="ub-btn-primary"
            onClick={() => void navigator.clipboard.writeText(agentPrompt).catch(() => undefined)}
            type="button"
          >
            <Clipboard aria-hidden="true" size={13} />
            Copy prompt
          </button>
        </div>
        <pre className="mt-3 max-h-56 overflow-auto rounded-xl bg-[#211d3d] p-3 font-mono text-[10px] leading-4 text-slate-100">
          <code>{agentPrompt}</code>
        </pre>
      </section>

      {tailwindDetected ? (
        <ExportBlock
          content={sessionTailwind}
          filename="ui-buddy-session-tailwind.txt"
          title="Tailwind"
        />
      ) : null}

      <section className="ub-card p-3">
        <button
          className="flex w-full items-center gap-2 text-left text-sm font-semibold tracking-tight text-ink"
          onClick={() => setShowAdvanced((current) => !current)}
          type="button"
        >
          <ChevronDown
            aria-hidden="true"
            className={`shrink-0 transition-transform ${showAdvanced ? "" : "-rotate-90"}`}
            size={14}
          />
          Advanced — JSON &amp; Markdown
        </button>
        {showAdvanced ? (
          <div className="mt-3 space-y-3">
            <ExportBlock
              content={jsonExport}
              filename="ui-change-session.json"
              title="Session JSON (for CLI / MCP)"
            />
            <ExportBlock content={markdownExport} filename="ui-buddy-session.md" title="Markdown summary" />
          </div>
        ) : null}
      </section>
    </div>
  );
};
