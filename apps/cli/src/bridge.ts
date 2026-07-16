import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { computeCssFileEdit, createUnifiedDiff } from "@ui-buddy/adapters";
import { scanProjectContext } from "@ui-buddy/core/project";

import type { ProjectContext, UIChangeIntent, UIChangeSession } from "@ui-buddy/shared";

const UI_BUDDY_DIR = ".ui-buddy";

const WRITE_DISABLED_ERROR = {
  ok: false,
  code: "CODE_SYNC_WRITES_DISABLED",
  error:
    "Source writes are disabled. Restart ui-buddy connect with --enable-code-sync-writes to apply or roll back source changes.",
} as const;

/** True when `target` resolves to a path inside `root` (blocks path traversal). */
const isInsideRoot = (root: string, target: string): boolean => {
  const rel = relative(root, target);
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
};

export type PreviewElement = {
  selector: string;
  file: string | null;
  confidence: number;
  diff: string | null;
  applicable: boolean;
  note?: string;
};

export type PreviewResult = {
  ok: true;
  sessionId: string;
  root: string;
  elements: PreviewElement[];
  structuralEdits: Array<{ kind: string; selector: string; summary: string }>;
};

const previewSession = async (
  session: UIChangeSession,
  rootPath: string,
): Promise<PreviewResult> => {
  const projectContext = await scanProjectContext(rootPath, { includeSource: true });

  const elements: PreviewElement[] = session.elements.map((intent) => {
    const edit = computeCssFileEdit(intent, projectContext);

    if (edit === null) {
      return {
        selector: intent.target.selector,
        file: null,
        confidence: 0,
        diff: null,
        applicable: false,
        note: "No indexed stylesheet matched this element.",
      };
    }

    return {
      selector: intent.target.selector,
      file: edit.path,
      confidence: edit.confidence,
      diff: createUnifiedDiff(edit.path, edit.previousContent, edit.nextContent),
      applicable: edit.previousContent !== edit.nextContent,
    };
  });

  return {
    ok: true,
    sessionId: session.id,
    root: rootPath,
    elements,
    structuralEdits: session.structuralEdits.map((edit) => ({
      kind: edit.kind,
      selector: edit.target.selector,
      summary: edit.summary,
    })),
  };
};

export type ApplyResult = {
  ok: true;
  backupId: string | null;
  applied: Array<{ selector: string; file: string }>;
  skipped: Array<{ selector: string; reason: string }>;
};

const applySession = async (
  session: UIChangeSession,
  rootPath: string,
  selectors?: string[],
): Promise<ApplyResult> => {
  const projectContext: ProjectContext = await scanProjectContext(rootPath, {
    includeSource: true,
  });
  const selectorFilter = selectors === undefined ? null : new Set(selectors);

  const originalByPath = new Map<string, string>();
  for (const file of projectContext.sourceFiles ?? []) {
    originalByPath.set(file.path, file.content);
  }

  const applied: Array<{ selector: string; file: string }> = [];
  const skipped: Array<{ selector: string; reason: string }> = [];
  const touchedPaths = new Set<string>();

  const intents: UIChangeIntent[] = session.elements.filter(
    (intent) => selectorFilter === null || selectorFilter.has(intent.target.selector),
  );

  for (const intent of intents) {
    // Recompute against the running context so multiple edits to the same file
    // stack cumulatively instead of overwriting one another.
    const edit = computeCssFileEdit(intent, projectContext);

    if (edit === null) {
      skipped.push({
        selector: intent.target.selector,
        reason: "No indexed stylesheet matched this element.",
      });
      continue;
    }

    if (edit.previousContent === edit.nextContent) {
      skipped.push({ selector: intent.target.selector, reason: "No change to write." });
      continue;
    }

    const sourceFile = projectContext.sourceFiles?.find((file) => file.path === edit.path);
    if (sourceFile !== undefined) {
      sourceFile.content = edit.nextContent;
    }

    touchedPaths.add(edit.path);
    applied.push({ selector: intent.target.selector, file: edit.path });
  }

  if (touchedPaths.size === 0) {
    return { ok: true, backupId: null, applied, skipped };
  }

  const backupId = new Date().toISOString().replace(/[:.]/g, "-");
  const backupRoot = join(rootPath, UI_BUDDY_DIR, "backups", backupId);
  const backedUp: string[] = [];

  // Keep apply backups out of version control by default.
  await mkdir(join(rootPath, UI_BUDDY_DIR), { recursive: true });
  await writeFile(
    join(rootPath, UI_BUDDY_DIR, ".gitignore"),
    "backups/\nlast-backup.json\n",
    "utf8",
  );

  for (const relPath of touchedPaths) {
    const absPath = resolve(rootPath, relPath);

    if (!isInsideRoot(rootPath, absPath)) {
      skipped.push({ selector: relPath, reason: "Resolved outside the project root." });
      continue;
    }

    const finalContent =
      projectContext.sourceFiles?.find((file) => file.path === relPath)?.content ?? null;

    if (finalContent === null) {
      continue;
    }

    const original = originalByPath.get(relPath) ?? (await readFile(absPath, "utf8"));
    const backupPath = join(backupRoot, relPath);
    await mkdir(dirname(backupPath), { recursive: true });
    await writeFile(backupPath, original, "utf8");
    await writeFile(absPath, finalContent, "utf8");
    backedUp.push(relPath);
  }

  await writeFile(
    join(backupRoot, "manifest.json"),
    `${JSON.stringify({ backupId, files: backedUp, createdAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(rootPath, UI_BUDDY_DIR, "last-backup.json"),
    `${JSON.stringify({ backupId }, null, 2)}\n`,
    "utf8",
  );

  return { ok: true, backupId, applied, skipped };
};

export type RollbackResult = {
  ok: true;
  backupId: string;
  restored: string[];
};

const rollback = async (rootPath: string, backupId?: string): Promise<RollbackResult> => {
  let id = backupId;

  if (id === undefined) {
    const raw = await readFile(join(rootPath, UI_BUDDY_DIR, "last-backup.json"), "utf8");
    id = (JSON.parse(raw) as { backupId: string }).backupId;
  }

  const backupRoot = join(rootPath, UI_BUDDY_DIR, "backups", id);
  const manifest = JSON.parse(await readFile(join(backupRoot, "manifest.json"), "utf8")) as {
    files: string[];
  };

  const restored: string[] = [];
  for (const relPath of manifest.files) {
    const absTarget = resolve(rootPath, relPath);

    if (!isInsideRoot(rootPath, absTarget)) {
      continue;
    }

    await copyFile(join(backupRoot, relPath), absTarget);
    restored.push(relPath);
  }

  return { ok: true, backupId: id, restored };
};

/**
 * Only the extension (chrome-extension://) may talk to the bridge. This blocks
 * drive-by websites: without it, any page the user has open could POST to the
 * bridge and read source (via /preview) or overwrite files (via /apply), since
 * the browser sends the page's real Origin and cannot spoof it. Requests with no
 * Origin (curl/native tooling, not a browser threat) are allowed for debugging.
 */
const isAllowedOrigin = (origin: string | undefined): boolean =>
  origin === undefined || origin.startsWith("chrome-extension://");

const setCors = (res: ServerResponse, origin: string | undefined): void => {
  res.setHeader("Access-Control-Allow-Origin", origin ?? "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
};

const sendJson = (
  res: ServerResponse,
  status: number,
  data: unknown,
  origin: string | undefined,
): void => {
  setCors(res, origin);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
};

const readJsonBody = async <T>(req: IncomingMessage): Promise<T> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return (raw.length === 0 ? {} : JSON.parse(raw)) as T;
};

const projectName = async (rootPath: string): Promise<string> => {
  try {
    const raw = await readFile(join(rootPath, "package.json"), "utf8");
    return (JSON.parse(raw) as { name?: string }).name ?? rootPath;
  } catch {
    return rootPath;
  }
};

type BridgeHandle = {
  port: number;
  close: () => void;
};

export const startBridge = async (options: {
  rootPath: string;
  port: number;
  codeSyncWriteEnabled?: boolean;
}): Promise<BridgeHandle> => {
  const { rootPath, port, codeSyncWriteEnabled = false } = options;

  const server = createServer((req, res) => {
    void (async () => {
      const origin = req.headers.origin;

      try {
        if (!isAllowedOrigin(origin)) {
          res.writeHead(403, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Forbidden origin." }));
          return;
        }

        if (req.method === "OPTIONS") {
          setCors(res, origin);
          res.writeHead(204);
          res.end();
          return;
        }

        const url = req.url ?? "/";

        if (req.method === "GET" && url.startsWith("/health")) {
          sendJson(
            res,
            200,
            {
              ok: true,
              name: await projectName(rootPath),
              root: rootPath,
              version: "0.1.0",
              codeSyncWriteEnabled,
            },
            origin,
          );
          return;
        }

        if (req.method === "POST" && url.startsWith("/preview")) {
          const body = await readJsonBody<{ session: UIChangeSession }>(req);
          sendJson(res, 200, await previewSession(body.session, rootPath), origin);
          return;
        }

        if (req.method === "POST" && url.startsWith("/apply")) {
          if (!codeSyncWriteEnabled) {
            sendJson(res, 403, WRITE_DISABLED_ERROR, origin);
            return;
          }

          const body = await readJsonBody<{ session: UIChangeSession; selectors?: string[] }>(req);
          sendJson(res, 200, await applySession(body.session, rootPath, body.selectors), origin);
          return;
        }

        if (req.method === "POST" && url.startsWith("/rollback")) {
          if (!codeSyncWriteEnabled) {
            sendJson(res, 403, WRITE_DISABLED_ERROR, origin);
            return;
          }

          const body = await readJsonBody<{ backupId?: string }>(req);
          sendJson(res, 200, await rollback(rootPath, body.backupId), origin);
          return;
        }

        sendJson(res, 404, { ok: false, error: "Unknown endpoint." }, origin);
      } catch (error) {
        sendJson(
          res,
          500,
          { ok: false, error: error instanceof Error ? error.message : "Bridge request failed." },
          origin,
        );
      }
    })();
  });

  await new Promise<void>((resolvePromise) => {
    server.listen(port, "127.0.0.1", () => resolvePromise());
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address !== null ? address.port : port;

  return { port: actualPort, close: () => server.close() };
};

export { applySession, previewSession, rollback };
