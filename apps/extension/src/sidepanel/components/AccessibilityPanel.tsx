import { contrastRatioFromCssColors } from "@ui-buddy/core";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Pin,
  ScanSearch,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { sendMessageToActiveTab } from "../../chrome/messaging";
import { usePanelStore } from "../store";

import type { A11yIssue } from "@ui-buddy/shared";

const SEVERITY_STYLES: Record<A11yIssue["severity"], string> = {
  error: "border-rose-200 bg-rose-50 text-rose-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
};

const severityRank: Record<A11yIssue["severity"], number> = { error: 0, warning: 1, info: 2 };

const issuesToMarkdown = (issues: A11yIssue[]): string =>
  [
    "# ui-buddy accessibility report",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Issues found: ${issues.length}`,
    "",
    ...issues.map(
      (issue) =>
        `- **[${issue.severity}] ${issue.title}** - ${issue.message} (selector: ${issue.selector})`,
    ),
  ].join("\n");

export const AccessibilityPanel = () => {
  const notes = usePanelStore((state) => state.accessibilityNotes);
  const selectedElement = usePanelStore((state) => state.selectedElement);
  const a11yIssues = usePanelStore((state) => state.a11yIssues);
  const a11yScanLoading = usePanelStore((state) => state.a11yScanLoading);
  const setA11yScanLoading = usePanelStore((state) => state.setA11yScanLoading);
  const setError = usePanelStore((state) => state.setError);

  const runPageScan = async () => {
    setError(null);
    setA11yScanLoading(true);
    try {
      await sendMessageToActiveTab({ type: "A11Y_SCAN" });
    } catch (caughtError) {
      setA11yScanLoading(false);
      setError(caughtError instanceof Error ? caughtError.message : "Unable to scan the page.");
    }
  };

  const selectIssue = async (selector: string) => {
    try {
      await sendMessageToActiveTab({ type: "SELECT_SEARCH_RESULT", payload: { selector } });
    } catch {
      // Selection is best-effort; the element may be gone.
    }
  };

  const downloadReport = () => {
    if (a11yIssues === null) {
      return;
    }

    const blob = new Blob([issuesToMarkdown(a11yIssues)], { type: "text/markdown" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `a11y-report-${Date.now()}.md`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  const sortedIssues =
    a11yIssues === null
      ? null
      : [...a11yIssues].sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const pageAuditSection = (
    <section className="ub-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold tracking-tight">Page audit</h3>
          <p className="mt-1 text-2xs leading-4 text-muted">
            Sweep the whole page for missing alt text, unlabeled controls, low contrast, duplicate
            ids, and heading issues.
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {sortedIssues !== null && sortedIssues.length > 0 ? (
            <button
              className="ub-icon-btn"
              onClick={downloadReport}
              title="Download Markdown report"
              type="button"
            >
              <Download aria-hidden="true" size={14} />
            </button>
          ) : null}
          <button
            className="ub-btn-primary"
            disabled={a11yScanLoading}
            onClick={() => void runPageScan()}
            type="button"
          >
            <ScanSearch aria-hidden="true" size={14} />
            {a11yScanLoading ? "Scanning…" : "Scan page"}
          </button>
        </div>
      </div>
      {sortedIssues !== null ? (
        sortedIssues.length === 0 ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
            <CheckCircle2 aria-hidden="true" size={15} />
            No issues found by the lightweight sweep
          </div>
        ) : (
          <div className="mt-3 max-h-80 space-y-2 overflow-auto pr-0.5">
            {sortedIssues.map((issue) => (
              <button
                className={`block w-full rounded-lg border p-3 text-left transition hover:brightness-[0.97] ${SEVERITY_STYLES[issue.severity]}`}
                key={issue.id}
                onClick={() => void selectIssue(issue.selector)}
                title="Click to select this element on the page"
                type="button"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={14} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{issue.title}</p>
                    <p className="mt-0.5 text-[11px] leading-4">{issue.message}</p>
                    <p className="mt-1 truncate font-mono text-[10px] opacity-70">
                      {issue.selector}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )
      ) : null}
    </section>
  );

  const pinAudit = async () => {
    if (selectedElement === null) {
      return;
    }

    await sendMessageToActiveTab({
      type: "PIN_ELEMENT_CARD",
      payload: { snapshot: selectedElement, kind: "audit" },
    });
  };

  const clearPins = async () => {
    await sendMessageToActiveTab({ type: "CLEAR_PINNED_CARDS" });
  };

  if (selectedElement === null) {
    return (
      <div className="space-y-3">
        <div className="ub-card p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <ShieldCheck aria-hidden="true" size={16} />
            </span>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Accessibility</h2>
              <p className="text-2xs text-muted">
                Select an element for per-element checks, or run a page-wide audit below.
              </p>
            </div>
          </div>
        </div>
        {pageAuditSection}
      </div>
    );
  }

  const contrastRatio = contrastRatioFromCssColors(
    selectedElement.computedStyles.color ?? "",
    selectedElement.effectiveBackgroundColor ??
    selectedElement.computedStyles["background-color"] ??
    "",
  );

  return (
    <div className="space-y-3">
      <section className="ub-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <ShieldCheck aria-hidden="true" size={16} />
            </span>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Accessibility</h2>
              <p className="text-2xs text-muted">
                Lightweight v1 checks only - not a full WCAG audit.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              className="ub-icon-btn"
              onClick={() => void pinAudit()}
              title="Pin audit card"
              type="button"
            >
              <Pin aria-hidden="true" size={14} />
            </button>
            <button
              className="ub-icon-btn"
              onClick={() => void clearPins()}
              title="Clear pinned cards"
              type="button"
            >
              <Trash2 aria-hidden="true" size={14} />
            </button>
          </div>
        </div>
      </section>

      <section className="ub-card p-4">
        <h3 className="ub-heading">Contrast</h3>
        <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
          <span className="text-xs font-medium text-muted">Ratio</span>
          <span className="font-mono text-lg font-semibold tabular-nums text-ink">
            {contrastRatio === null ? "Unknown" : `${contrastRatio}:1`}
          </span>
        </div>
      </section>

      <section className="ub-card p-4">
        <h3 className="ub-heading">Warnings</h3>
        <div className="mt-2 space-y-2">
          {notes.length > 0 ? (
            notes.map((note) => (
              <div
                className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900"
                key={note.id}
              >
                <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={15} />
                <div>
                  <p className="text-xs font-semibold">{note.title}</p>
                  <p className="mt-1 text-2xs leading-4">{note.message}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
              <CheckCircle2 aria-hidden="true" size={15} />
              No v1 warnings
            </div>
          )}
        </div>
      </section>

      {pageAuditSection}
    </div>
  );
};
