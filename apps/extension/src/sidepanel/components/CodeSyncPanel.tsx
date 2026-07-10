import { AlertTriangle, Check, FileCode2, Plug, RefreshCcw, Undo2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { UIChangeSession } from "@ui-buddy/shared";

const DEFAULT_PORT = "7317";
const PORT_STORAGE_KEY = "ubBridgePort";

type HealthResponse = { ok: boolean; name: string; root: string };

type PreviewElement = {
  selector: string;
  file: string | null;
  confidence: number;
  diff: string | null;
  applicable: boolean;
  note?: string;
};

type PreviewResponse = {
  ok: boolean;
  elements: PreviewElement[];
};

type ApplyResponse = {
  ok: boolean;
  backupId: string | null;
  applied: Array<{ selector: string; file: string }>;
  skipped: Array<{ selector: string; reason: string }>;
};

type ConnectionState = "idle" | "checking" | "connected" | "disconnected";

const fetchJson = async <T,>(url: string, options: RequestInit, timeoutMs: number): Promise<T> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
};

type CodeSyncPanelProps = {
  session: UIChangeSession;
};

export const CodeSyncPanel = ({ session }: CodeSyncPanelProps) => {
  const [port, setPort] = useState(DEFAULT_PORT);
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [projectName, setProjectName] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyResponse | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = `http://127.0.0.1:${port}`;

  const checkHealth = useCallback(async (targetPort: string) => {
    setConnection("checking");
    setError(null);

    try {
      const health = await fetchJson<HealthResponse>(
        `http://127.0.0.1:${targetPort}/health`,
        { method: "GET" },
        1500,
      );

      if (health.ok) {
        setProjectName(health.name);
        setConnection("connected");
        return;
      }

      setConnection("disconnected");
    } catch {
      setConnection("disconnected");
      setProjectName(null);
    }
  }, []);

  useEffect(() => {
    void chrome.storage.local.get(PORT_STORAGE_KEY).then((stored) => {
      const savedPort =
        typeof stored[PORT_STORAGE_KEY] === "string" ? stored[PORT_STORAGE_KEY] : DEFAULT_PORT;
      setPort(savedPort);
      void checkHealth(savedPort);
    });
  }, [checkHealth]);

  const savePort = (nextPort: string) => {
    setPort(nextPort);
    void chrome.storage.local.set({ [PORT_STORAGE_KEY]: nextPort });
  };

  const runPreview = async () => {
    setBusy(true);
    setError(null);
    setApplyResult(null);
    setConfirming(false);

    try {
      const result = await fetchJson<PreviewResponse>(
        `${baseUrl}/preview`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session }),
        },
        8000,
      );
      setPreview(result);
    } catch {
      setError("Preview failed - is `ui-buddy connect` running in your project?");
      setConnection("disconnected");
    } finally {
      setBusy(false);
    }
  };

  const runApply = async () => {
    setBusy(true);
    setError(null);
    setConfirming(false);

    try {
      const result = await fetchJson<ApplyResponse>(
        `${baseUrl}/apply`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session }),
        },
        15000,
      );
      setApplyResult(result);
    } catch {
      setError("Apply failed - check the ui-buddy connect terminal for errors.");
    } finally {
      setBusy(false);
    }
  };

  const runRollback = async () => {
    setBusy(true);
    setError(null);

    try {
      await fetchJson(`${baseUrl}/rollback`, { method: "POST", headers: {} }, 8000);
      setApplyResult(null);
      setError(null);
    } catch {
      setError("Rollback failed - check the ui-buddy connect terminal.");
    } finally {
      setBusy(false);
    }
  };

  const applicablePreviews = preview?.elements.filter((element) => element.applicable) ?? [];

  return (
    <section className="ub-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <Plug aria-hidden="true" className="text-accent" size={15} />
          Code sync
        </h3>
        <button
          className="ub-icon-btn h-7 w-7"
          disabled={connection === "checking"}
          onClick={() => void checkHealth(port)}
          title="Reconnect"
          type="button"
        >
          <RefreshCcw aria-hidden="true" size={12} />
        </button>
      </div>

      <div className="mt-2.5 flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2 text-xs">
        <span
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${
            connection === "connected"
              ? "bg-emerald-500 shadow-[0_0_0_3px_rgb(16_185_129_/_0.15)]"
              : connection === "checking"
                ? "animate-pulse bg-amber-400"
                : "bg-slate-300"
          }`}
        />
        {connection === "connected" ? (
          <span className="text-ink">
            Connected to <span className="font-semibold">{projectName}</span>
          </span>
        ) : connection === "checking" ? (
          <span className="text-muted">Checking…</span>
        ) : (
          <span className="text-muted">
            Not connected. Run <code className="ub-chip">npx ui-buddy connect</code> in your
            project.
          </span>
        )}
        <input
          aria-label="Bridge port"
          className="ub-input ml-auto h-7 w-16 text-center text-2xs"
          onBlur={() => void checkHealth(port)}
          onChange={(event) => savePort(event.target.value.replace(/[^0-9]/g, ""))}
          value={port}
        />
      </div>

      {connection === "connected" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            className="ub-btn"
            disabled={busy}
            onClick={() => void runPreview()}
            type="button"
          >
            <FileCode2 aria-hidden="true" size={13} />
            Preview diff
          </button>

          {confirming ? (
            <>
              <button
                className="ub-btn-danger"
                disabled={busy}
                onClick={() => void runApply()}
                type="button"
              >
                Confirm apply
              </button>
              <button className="ub-btn" onClick={() => setConfirming(false)} type="button">
                Cancel
              </button>
            </>
          ) : (
            <button
              className="ub-btn-primary"
              disabled={busy || applicablePreviews.length === 0}
              onClick={() => setConfirming(true)}
              title={
                applicablePreviews.length === 0
                  ? "Preview first to see applicable changes"
                  : "Write these changes to your source files"
              }
              type="button"
            >
              Apply to code
            </button>
          )}
        </div>
      ) : null}

      {error !== null ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-2xs text-amber-800">
          <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={13} />
          <span>{error}</span>
        </div>
      ) : null}

      {preview !== null && applyResult === null ? (
        <div className="mt-3 space-y-2">
          <p className="text-2xs text-muted">
            {applicablePreviews.length} of {preview.elements.length} element(s) map to a stylesheet.
          </p>
          {preview.elements.map((element) => (
            <div className="rounded-xl bg-slate-50 p-2.5 text-xs" key={element.selector}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[10px] text-slate-600">
                  {element.selector}
                </span>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {element.file ?? element.note ?? "no match"}
                </span>
              </div>
              {element.diff !== null ? (
                <pre className="mt-1.5 max-h-32 overflow-auto rounded-xl bg-[#211d3d] p-2 font-mono text-[10px] leading-4 text-slate-100">
                  <code>{element.diff}</code>
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {applyResult !== null ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800">
            <Check aria-hidden="true" size={13} />
            <span>
              Applied {applyResult.applied.length} change(s) to your source.
              {applyResult.skipped.length > 0 ? ` ${applyResult.skipped.length} skipped.` : ""}
            </span>
          </div>
          {applyResult.applied.map((item) => (
            <p className="truncate font-mono text-[10px] text-muted" key={item.selector}>
              {item.file} ← {item.selector}
            </p>
          ))}
          {applyResult.backupId !== null ? (
            <button
              className="ub-btn"
              disabled={busy}
              onClick={() => void runRollback()}
              type="button"
            >
              <Undo2 aria-hidden="true" size={13} />
              Undo apply
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
