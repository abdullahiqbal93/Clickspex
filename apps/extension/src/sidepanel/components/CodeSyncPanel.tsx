import {
  parseBridgeApplyResponse,
  parseBridgeHealthResponse,
  parseBridgePairResponse,
  parseBridgePreviewResponse,
  parseBridgeRollbackResponse,
  parseBridgeStructuredError,
  type BridgeApplyResponse,
  type BridgeHealthResponse,
  type BridgePreviewResponse,
  type UIChangeSession,
} from "@ui-buddy/shared";
import { AlertTriangle, Check, FileCode2, KeyRound, Plug, RefreshCcw, Undo2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const DEFAULT_PORT = "7317";
const PORT_STORAGE_KEY = "ubBridgePort";
const TOKEN_STORAGE_PREFIX = "ubBridgeToken:";

type ConnectionState = "idle" | "checking" | "connected" | "disconnected";

const tokenStorageKey = (health: BridgeHealthResponse): string =>
  `${TOKEN_STORAGE_PREFIX}${health.projectId}:${health.bridgeInstanceId}`;

const fetchJson = async <T,>(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  parse: (value: unknown) => T,
): Promise<T> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const value = (await response.json().catch(() => null)) as unknown;

    if (!response.ok) {
      const structuredError = parseBridgeStructuredError(value);
      throw new Error(
        structuredError?.error ?? `Bridge request failed with HTTP ${response.status}`,
      );
    }

    return parse(value);
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
  const [health, setHealth] = useState<BridgeHealthResponse | null>(null);
  const [bridgeToken, setBridgeToken] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [codeSyncWriteEnabled, setCodeSyncWriteEnabled] = useState(false);
  const [preview, setPreview] = useState<BridgePreviewResponse | null>(null);
  const [applyResult, setApplyResult] = useState<BridgeApplyResponse | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = `http://127.0.0.1:${port}`;
  const sessionFingerprint = JSON.stringify(session);

  const clearBridgeState = () => {
    setHealth(null);
    setBridgeToken(null);
    setCodeSyncWriteEnabled(false);
    setPreview(null);
    setApplyResult(null);
    setConfirming(false);
  };

  const authHeaders = (): HeadersInit =>
    bridgeToken === null ? {} : { authorization: `Bearer ${bridgeToken}` };

  const checkHealth = useCallback(async (targetPort: string) => {
    setConnection("checking");
    setError(null);

    try {
      const nextHealth = await fetchJson<BridgeHealthResponse>(
        `http://127.0.0.1:${targetPort}/health`,
        { method: "GET" },
        1500,
        parseBridgeHealthResponse,
      );

      setHealth((previous) => {
        if (
          previous !== null &&
          (previous.projectId !== nextHealth.projectId ||
            previous.bridgeInstanceId !== nextHealth.bridgeInstanceId ||
            previous.protocolVersion !== nextHealth.protocolVersion)
        ) {
          setPreview(null);
          setApplyResult(null);
          setConfirming(false);
        }

        return nextHealth;
      });
      setCodeSyncWriteEnabled(nextHealth.codeSyncWriteEnabled === true);
      setConnection("connected");

      const stored = await chrome.storage.session.get(tokenStorageKey(nextHealth));
      const storedToken = stored[tokenStorageKey(nextHealth)];
      setBridgeToken(typeof storedToken === "string" ? storedToken : null);
      return;
    } catch (caughtError) {
      clearBridgeState();
      setConnection("disconnected");
      setError(caughtError instanceof Error ? caughtError.message : null);
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

  useEffect(() => {
    setPreview(null);
    setApplyResult(null);
    setConfirming(false);
  }, [sessionFingerprint]);

  const savePort = (nextPort: string) => {
    setPort(nextPort);
    clearBridgeState();
    void chrome.storage.local.set({ [PORT_STORAGE_KEY]: nextPort });
  };

  const runPair = async () => {
    if (health === null) {
      setError("Connect to the bridge before pairing.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const result = await fetchJson(
        `${baseUrl}/pair`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pairingCode }),
        },
        5000,
        parseBridgePairResponse,
      );

      await chrome.storage.session.set({ [tokenStorageKey(health)]: result.token });
      setBridgeToken(result.token);
      setPairingCode("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Pairing failed.");
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    if (bridgeToken === null) {
      setError("Enter the pairing code from the ui-buddy connect terminal before previewing.");
      return;
    }

    setBusy(true);
    setError(null);
    setApplyResult(null);
    setConfirming(false);

    try {
      const result = await fetchJson<BridgePreviewResponse>(
        `${baseUrl}/preview`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders() },
          body: JSON.stringify({ session }),
        },
        8000,
        parseBridgePreviewResponse,
      );
      setPreview(result);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Preview failed - is `ui-buddy connect` running in your project?",
      );
      setConnection("disconnected");
    } finally {
      setBusy(false);
    }
  };

  const runApply = async () => {
    if (!codeSyncWriteEnabled) {
      setError(
        "Source writes are disabled. Restart `ui-buddy connect` with --enable-code-sync-writes to apply changes.",
      );
      return;
    }

    if (bridgeToken === null) {
      setError("Pair with the bridge before applying source changes.");
      return;
    }

    if (preview === null) {
      setError("Preview the diff before applying source changes.");
      return;
    }

    const expiresAt = Date.parse(preview.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      setPreview(null);
      setConfirming(false);
      setError("Preview expired. Run Preview diff again before applying.");
      return;
    }

    setBusy(true);
    setError(null);
    setConfirming(false);

    try {
      const result = await fetchJson<BridgeApplyResponse>(
        `${baseUrl}/apply`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders() },
          body: JSON.stringify({ previewId: preview.previewId }),
        },
        15000,
        parseBridgeApplyResponse,
      );
      setPreview(null);
      setApplyResult(result);
    } catch (caughtError) {
      setPreview(null);
      setConfirming(false);
      setError(caughtError instanceof Error ? caughtError.message : "Apply failed.");
    } finally {
      setBusy(false);
    }
  };

  const runRollback = async () => {
    if (!codeSyncWriteEnabled) {
      setError("Undo apply is disabled because source writes are off for this bridge session.");
      return;
    }

    if (bridgeToken === null) {
      setError("Pair with the bridge before rolling back source changes.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await fetchJson(
        `${baseUrl}/rollback`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders() },
          body: JSON.stringify({ backupId: applyResult?.backupId ?? undefined }),
        },
        8000,
        parseBridgeRollbackResponse,
      );
      setApplyResult(null);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Rollback failed.");
    } finally {
      setBusy(false);
    }
  };

  const applicablePreviews = preview?.elements.filter((element) => element.applicable) ?? [];
  const previewExpiresAtMs = preview === null ? null : Date.parse(preview.expiresAt);
  const hasExpiredPreview =
    previewExpiresAtMs !== null &&
    (!Number.isFinite(previewExpiresAtMs) || previewExpiresAtMs <= Date.now());
  const isPaired = bridgeToken !== null;
  const canWriteToCode = connection === "connected" && codeSyncWriteEnabled && isPaired;

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
        {connection === "connected" && health !== null ? (
          <span className="min-w-0 truncate text-ink">
            Connected to <span className="font-semibold">{health.projectName}</span>
          </span>
        ) : connection === "checking" ? (
          <span className="text-muted">Checking...</span>
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

      {connection === "connected" && health !== null ? (
        <div className="mt-2 rounded-xl bg-slate-50 p-2.5 text-[10px] leading-4 text-muted">
          <p className="truncate">Project ID: {health.projectId}</p>
          <p className="truncate">Bridge: {health.bridgeInstanceId}</p>
          <p className="truncate">Root: {health.canonicalRoot}</p>
        </div>
      ) : null}

      {connection === "connected" ? (
        <div
          className={`mt-3 flex items-start gap-2 rounded-xl border p-2.5 text-2xs ${
            codeSyncWriteEnabled
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-slate-200 bg-slate-50 text-muted"
          }`}
        >
          <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={13} />
          <span>
            {codeSyncWriteEnabled
              ? "Experimental source writes are enabled for this bridge session. Preview carefully before applying."
              : "Source writes are disabled by default. Preview diff and exports remain available."}
          </span>
        </div>
      ) : null}

      {connection === "connected" && !isPaired ? (
        <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50 p-2.5">
          <label className="block text-2xs font-semibold text-indigo-900" htmlFor="ub-pair-code">
            Pairing code from terminal
          </label>
          <div className="mt-2 flex gap-2">
            <input
              autoComplete="one-time-code"
              className="ub-input h-8 flex-1 text-center font-mono text-xs tracking-[0.2em]"
              id="ub-pair-code"
              inputMode="numeric"
              maxLength={6}
              onChange={(event) => setPairingCode(event.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              value={pairingCode}
            />
            <button
              className="ub-btn-primary"
              disabled={busy || pairingCode.length !== 6}
              onClick={() => void runPair()}
              type="button"
            >
              <KeyRound aria-hidden="true" size={13} />
              Pair
            </button>
          </div>
        </div>
      ) : null}

      {connection === "connected" && isPaired ? (
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
                disabled={!canWriteToCode || busy}
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
              disabled={
                !canWriteToCode || busy || applicablePreviews.length === 0 || hasExpiredPreview
              }
              onClick={() => setConfirming(true)}
              title={
                !isPaired
                  ? "Pair with the bridge first"
                  : !canWriteToCode
                    ? "Source writes are disabled for this bridge session"
                    : applicablePreviews.length === 0
                      ? "Preview first to see applicable changes"
                      : hasExpiredPreview
                        ? "Preview expired. Run Preview diff again"
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
            {applicablePreviews.length} of {preview.elements.length} element(s) map to{" "}
            {preview.files.length} stylesheet file(s). Preview expires at{" "}
            {new Date(preview.expiresAt).toLocaleTimeString()}.
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
              {item.file}
              {" <- "}
              {item.selector}
            </p>
          ))}
          {applyResult.backupId !== null && codeSyncWriteEnabled ? (
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
