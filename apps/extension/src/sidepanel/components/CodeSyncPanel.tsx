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
      setError("Preview failed — is `ui-buddy connect` running in your project?");
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
      setError("Apply failed — check the ui-buddy connect terminal for errors.");
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
      setError("Rollback failed — check the ui-buddy connect terminal.");
    } finally {
      setBusy(false);
    }
  };

  const applicablePreviews = preview?.elements.filter((element) => element.applicable) ?? [];

  return (
    <section className="rounded-lg border border-border bg-panel/80 p-4 shadow-card backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Plug aria-hidden="true" size={15} />
          Code sync
        </h3>
        <button
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-slate-500 transition hover:bg-slate-50"
          disabled={connection === "checking"}
          onClick={() => void checkHealth(port)}
          title="Reconnect"
          type="button"
        >
          <RefreshCcw aria-hidden="true" size={12} />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            connection === "connected"
              ? "bg-emerald-500"
              : connection === "checking"
                ? "bg-amber-400"
                : "bg-slate-300"
          }`}
        />
        {connection === "connected" ? (
          <span className="text-slate-700">
            Connected to <span className="font-semibold">{projectName}</span>
          </span>
        ) : connection === "checking" ? (
          <span className="text-slate-500">Checking…</span>
        ) : (
          <span className="text-slate-500">
            Not connected. Run <code className="font-mono">npx ui-buddy connect</code> in your
            project.
          </span>
        )}
        <input
          aria-label="Bridge port"
          className="ml-auto h-7 w-16 rounded-md border border-border px-2 text-[11px] outline-none focus:border-accent"
          onBlur={() => void checkHealth(port)}
          onChange={(event) => savePort(event.target.value.replace(/[^0-9]/g, ""))}
          value={port}
        />
      </div>

      {connection === "connected" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
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
                className="inline-flex h-8 items-center gap-2 rounded-md bg-red-600 px-3 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-40"
                disabled={busy}
                onClick={() => void runApply()}
                type="button"
              >
                Confirm apply
              </button>
              <button
                className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                onClick={() => setConfirming(false)}
                type="button"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              className="inline-flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-40"
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
        <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={13} />
          <span>{error}</span>
        </div>
      ) : null}

      {preview !== null && applyResult === null ? (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-muted">
            {applicablePreviews.length} of {preview.elements.length} element(s) map to a stylesheet.
          </p>
          {preview.elements.map((element) => (
            <div
              className="rounded-md border border-slate-100 bg-slate-50 p-2 text-xs"
              key={element.selector}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[10px] text-slate-600">
                  {element.selector}
                </span>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {element.file ?? element.note ?? "no match"}
                </span>
              </div>
              {element.diff !== null ? (
                <pre className="mt-1 max-h-32 overflow-auto rounded bg-slate-950 p-2 text-[10px] leading-4 text-slate-50">
                  <code>{element.diff}</code>
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {applyResult !== null ? (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
            <Check aria-hidden="true" size={13} />
            <span>
              Applied {applyResult.applied.length} change(s) to your source.
              {applyResult.skipped.length > 0 ? ` ${applyResult.skipped.length} skipped.` : ""}
            </span>
          </div>
          {applyResult.applied.map((item) => (
            <p className="truncate font-mono text-[10px] text-slate-500" key={item.selector}>
              {item.file} ← {item.selector}
            </p>
          ))}
          {applyResult.backupId !== null ? (
            <button
              className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
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
