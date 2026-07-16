import { timingSafeEqual, createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { computeCssFileEdit, createUnifiedDiff } from "@ui-buddy/adapters";
import { scanProjectContext } from "@ui-buddy/core/project";
import {
  BRIDGE_PROTOCOL_VERSION,
  bridgeApplyRequestSchema,
  bridgePairRequestSchema,
  bridgePreviewRequestSchema,
  bridgeRollbackRequestSchema,
} from "@ui-buddy/shared";

import type {
  BridgeApplyResponse,
  BridgeErrorCode,
  BridgeHealthResponse,
  BridgePairResponse,
  BridgePreviewResponse,
  BridgeRollbackResponse,
  BridgeStructuredError,
  ProjectContext,
  UIChangeIntent,
  UIChangeSession,
} from "@ui-buddy/shared";

const UI_BUDDY_DIR = ".ui-buddy";
const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024;
const BACKUP_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const REQUEST_TIMEOUT_MS = 15_000;
const HEADERS_TIMEOUT_MS = 5_000;

class BridgeHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: BridgeErrorCode,
    message: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
  }
}

const bridgeError = (
  status: number,
  code: BridgeErrorCode,
  error: string,
  details?: Record<string, string>,
): BridgeStructuredError => ({
  ok: false,
  code,
  error,
  ...(details === undefined ? {} : { details }),
});

const writeDisabledError = (): BridgeStructuredError =>
  bridgeError(
    403,
    "CODE_SYNC_WRITES_DISABLED",
    "Source writes are disabled. Restart ui-buddy connect with --enable-code-sync-writes to apply or roll back source changes.",
  );

/** True when `target` resolves to a path inside `root` (blocks path traversal). */
const isInsideRoot = (root: string, target: string): boolean => {
  const rel = relative(root, target);
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel);
};

const safeEqual = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const bearerTokenFrom = (req: IncomingMessage): string | null => {
  const header = req.headers.authorization;

  if (typeof header !== "string") {
    return null;
  }

  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token !== undefined ? token : null;
};

const validatePort = (port: number): void => {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new BridgeHttpError(
      400,
      "BAD_REQUEST",
      "Bridge port must be between 1 and 65535, or 0 for an ephemeral test port.",
    );
  }
};

const validateExtensionId = (extensionId: string | undefined): string | undefined => {
  if (extensionId === undefined || extensionId.length === 0) {
    return undefined;
  }

  if (!EXTENSION_ID_PATTERN.test(extensionId)) {
    throw new BridgeHttpError(
      400,
      "BAD_REQUEST",
      "Extension ID must be a 32-character Chrome extension ID.",
    );
  }

  return extensionId;
};

const validateProjectRoot = async (rootPath: string): Promise<string> => {
  const canonicalRoot = await realpath(resolve(rootPath)).catch(() => {
    throw new BridgeHttpError(400, "INVALID_PROJECT_ROOT", "Project root does not exist.");
  });
  const info = await stat(canonicalRoot).catch(() => {
    throw new BridgeHttpError(400, "INVALID_PROJECT_ROOT", "Project root cannot be read.");
  });

  if (!info.isDirectory()) {
    throw new BridgeHttpError(400, "INVALID_PROJECT_ROOT", "Project root must be a directory.");
  }

  return canonicalRoot;
};

const validateBackupId = (backupId: string): void => {
  if (!BACKUP_ID_PATTERN.test(backupId)) {
    throw new BridgeHttpError(400, "INVALID_BACKUP_ID", "Backup ID is invalid.");
  }
};

const validateSafeExistingPath = async (
  canonicalRoot: string,
  absolutePath: string,
): Promise<void> => {
  const realTarget = await realpath(absolutePath).catch(async () =>
    realpath(dirname(absolutePath)),
  );

  if (!isInsideRoot(canonicalRoot, realTarget) && realTarget !== canonicalRoot) {
    throw new BridgeHttpError(400, "BAD_REQUEST", "Resolved path escapes the project root.");
  }
};

const stableProjectId = (canonicalRoot: string): string =>
  createHash("sha256").update(canonicalRoot).digest("hex").slice(0, 32);

const generatePairingCode = (): string => randomInt(0, 1_000_000).toString().padStart(6, "0");

const generateToken = (): string => randomBytes(32).toString("base64url");

export type PreviewElement = {
  selector: string;
  file: string | null;
  confidence: number;
  diff: string | null;
  applicable: boolean;
  note?: string;
};

export type PreviewResult = BridgePreviewResponse;

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

export type ApplyResult = BridgeApplyResponse;

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

    await validateSafeExistingPath(rootPath, absPath);

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

export type RollbackResult = BridgeRollbackResponse;

const rollback = async (rootPath: string, backupId?: string): Promise<RollbackResult> => {
  let id = backupId;

  if (id === undefined) {
    const raw = await readFile(join(rootPath, UI_BUDDY_DIR, "last-backup.json"), "utf8");
    id = (JSON.parse(raw) as { backupId: string }).backupId;
  }

  validateBackupId(id);

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

    await validateSafeExistingPath(rootPath, absTarget);
    await copyFile(join(backupRoot, relPath), absTarget);
    restored.push(relPath);
  }

  return { ok: true, backupId: id, restored };
};

type BridgeRuntimeConfig = {
  canonicalRoot: string;
  projectId: string;
  projectName: string;
  bridgeInstanceId: string;
  pairingCode: string;
  sessionToken: string;
  codeSyncWriteEnabled: boolean;
  allowedExtensionId: string | undefined;
  allowAnyExtensionOrigin: boolean;
  allowUnauthenticatedLocalAccess: boolean;
  bodyLimitBytes: number;
};

const expectedOrigin = (config: BridgeRuntimeConfig): string | null =>
  config.allowedExtensionId === undefined
    ? null
    : `chrome-extension://${config.allowedExtensionId}`;

const isAllowedBrowserOrigin = (
  origin: string | undefined,
  config: BridgeRuntimeConfig,
): boolean => {
  if (origin === undefined) {
    return false;
  }

  const exactOrigin = expectedOrigin(config);

  if (exactOrigin !== null) {
    return origin === exactOrigin;
  }

  return config.allowAnyExtensionOrigin && origin.startsWith("chrome-extension://");
};

const isAuthenticated = (req: IncomingMessage, config: BridgeRuntimeConfig): boolean => {
  const token = bearerTokenFrom(req);
  return token !== null && safeEqual(token, config.sessionToken);
};

const assertRequestAllowed = (
  req: IncomingMessage,
  config: BridgeRuntimeConfig,
  options: { allowPairing?: boolean } = {},
): void => {
  const origin = req.headers.origin;

  if (isAllowedBrowserOrigin(origin, config)) {
    return;
  }

  if (origin === undefined) {
    if (config.allowUnauthenticatedLocalAccess) {
      return;
    }

    if (!options.allowPairing && isAuthenticated(req, config)) {
      return;
    }
  }

  throw new BridgeHttpError(
    403,
    "FORBIDDEN_ORIGIN",
    "Request origin is not allowed for this bridge.",
  );
};

const assertAuthenticated = (req: IncomingMessage, config: BridgeRuntimeConfig): void => {
  if (!isAuthenticated(req, config)) {
    throw new BridgeHttpError(
      401,
      "UNAUTHORIZED",
      "Pair with the bridge and send Authorization: Bearer <token>.",
    );
  }
};

const setCors = (
  res: ServerResponse,
  origin: string | undefined,
  config: BridgeRuntimeConfig,
): void => {
  if (origin !== undefined && isAllowedBrowserOrigin(origin, config)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
};

const sendJson = (
  res: ServerResponse,
  status: number,
  data: unknown,
  origin: string | undefined,
  config: BridgeRuntimeConfig,
): void => {
  setCors(res, origin, config);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
};

const readJsonBody = async (
  req: IncomingMessage,
  config: BridgeRuntimeConfig,
): Promise<unknown> => {
  const contentType = req.headers["content-type"];

  if (typeof contentType !== "string" || !contentType.toLowerCase().includes("application/json")) {
    throw new BridgeHttpError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Bridge POST requests must use application/json.",
    );
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = chunk as Buffer;
    totalBytes += buffer.byteLength;

    if (totalBytes > config.bodyLimitBytes) {
      throw new BridgeHttpError(413, "PAYLOAD_TOO_LARGE", "Bridge request body is too large.");
    }

    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8");

  try {
    return raw.length === 0 ? {} : JSON.parse(raw);
  } catch {
    throw new BridgeHttpError(400, "BAD_REQUEST", "Request body must be valid JSON.");
  }
};

const parseBody = <T>(schema: { parse: (value: unknown) => T }, value: unknown): T => {
  try {
    return schema.parse(value);
  } catch {
    throw new BridgeHttpError(
      400,
      "BAD_REQUEST",
      "Request body does not match the bridge protocol.",
    );
  }
};

const projectName = async (rootPath: string): Promise<string> => {
  try {
    const raw = await readFile(join(rootPath, "package.json"), "utf8");
    return (JSON.parse(raw) as { name?: string }).name ?? rootPath;
  } catch {
    return rootPath;
  }
};

const healthResponse = (config: BridgeRuntimeConfig): BridgeHealthResponse => ({
  ok: true,
  projectId: config.projectId,
  projectName: config.projectName,
  canonicalRoot: config.canonicalRoot,
  bridgeInstanceId: config.bridgeInstanceId,
  protocolVersion: BRIDGE_PROTOCOL_VERSION,
  codeSyncWriteEnabled: config.codeSyncWriteEnabled,
  name: config.projectName,
  root: config.canonicalRoot,
  version: "0.1.0",
});

type BridgeHandle = {
  port: number;
  pairingCode: string;
  projectId: string;
  projectName: string;
  canonicalRoot: string;
  bridgeInstanceId: string;
  allowedExtensionId: string | undefined;
  close: () => void;
};

export const startBridge = async (options: {
  rootPath: string;
  port: number;
  codeSyncWriteEnabled?: boolean;
  allowedExtensionId?: string | undefined;
  allowAnyExtensionOrigin?: boolean;
  allowUnauthenticatedLocalAccess?: boolean;
  bodyLimitBytes?: number;
}): Promise<BridgeHandle> => {
  validatePort(options.port);

  const canonicalRoot = await validateProjectRoot(options.rootPath);
  const allowedExtensionId = validateExtensionId(options.allowedExtensionId);
  const config: BridgeRuntimeConfig = {
    canonicalRoot,
    projectId: stableProjectId(canonicalRoot),
    projectName: await projectName(canonicalRoot),
    bridgeInstanceId: randomUUID(),
    pairingCode: generatePairingCode(),
    sessionToken: generateToken(),
    codeSyncWriteEnabled: options.codeSyncWriteEnabled === true,
    allowedExtensionId,
    allowAnyExtensionOrigin: options.allowAnyExtensionOrigin === true,
    allowUnauthenticatedLocalAccess: options.allowUnauthenticatedLocalAccess === true,
    bodyLimitBytes: options.bodyLimitBytes ?? DEFAULT_BODY_LIMIT_BYTES,
  };

  const server = createServer((req, res) => {
    req.setTimeout(REQUEST_TIMEOUT_MS);
    void (async () => {
      const origin = req.headers.origin;

      try {
        const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
        const route = requestUrl.pathname;

        if (req.method === "OPTIONS") {
          assertRequestAllowed(req, config, { allowPairing: true });
          setCors(res, origin, config);
          res.writeHead(204);
          res.end();
          return;
        }

        if (route === "/health") {
          if (req.method !== "GET") {
            throw new BridgeHttpError(405, "METHOD_NOT_ALLOWED", "Use GET for /health.");
          }

          assertRequestAllowed(req, config);
          sendJson(res, 200, healthResponse(config), origin, config);
          return;
        }

        if (route === "/pair") {
          if (req.method !== "POST") {
            throw new BridgeHttpError(405, "METHOD_NOT_ALLOWED", "Use POST for /pair.");
          }

          assertRequestAllowed(req, config, { allowPairing: true });
          const body = parseBody(bridgePairRequestSchema, await readJsonBody(req, config));

          if (!safeEqual(body.pairingCode, config.pairingCode)) {
            throw new BridgeHttpError(401, "UNAUTHORIZED", "Pairing code is incorrect.");
          }

          const response: BridgePairResponse = {
            ok: true,
            token: config.sessionToken,
            bridgeInstanceId: config.bridgeInstanceId,
            protocolVersion: BRIDGE_PROTOCOL_VERSION,
          };
          sendJson(res, 200, response, origin, config);
          return;
        }

        if (route === "/preview") {
          if (req.method !== "POST") {
            throw new BridgeHttpError(405, "METHOD_NOT_ALLOWED", "Use POST for /preview.");
          }

          assertRequestAllowed(req, config);
          assertAuthenticated(req, config);
          const body = parseBody(bridgePreviewRequestSchema, await readJsonBody(req, config));
          sendJson(res, 200, await previewSession(body.session, canonicalRoot), origin, config);
          return;
        }

        if (route === "/apply") {
          if (req.method !== "POST") {
            throw new BridgeHttpError(405, "METHOD_NOT_ALLOWED", "Use POST for /apply.");
          }

          assertRequestAllowed(req, config);
          assertAuthenticated(req, config);

          if (!config.codeSyncWriteEnabled) {
            sendJson(res, 403, writeDisabledError(), origin, config);
            return;
          }

          const body = parseBody(bridgeApplyRequestSchema, await readJsonBody(req, config));
          sendJson(
            res,
            200,
            await applySession(body.session, canonicalRoot, body.selectors),
            origin,
            config,
          );
          return;
        }

        if (route === "/rollback") {
          if (req.method !== "POST") {
            throw new BridgeHttpError(405, "METHOD_NOT_ALLOWED", "Use POST for /rollback.");
          }

          assertRequestAllowed(req, config);
          assertAuthenticated(req, config);

          if (!config.codeSyncWriteEnabled) {
            sendJson(res, 403, writeDisabledError(), origin, config);
            return;
          }

          const body = parseBody(bridgeRollbackRequestSchema, await readJsonBody(req, config));
          sendJson(res, 200, await rollback(canonicalRoot, body.backupId), origin, config);
          return;
        }

        throw new BridgeHttpError(404, "NOT_FOUND", "Unknown bridge endpoint.");
      } catch (error) {
        const normalized =
          error instanceof BridgeHttpError
            ? bridgeError(error.status, error.code, error.message, error.details)
            : bridgeError(500, "INTERNAL_ERROR", "Bridge request failed.");
        const status = error instanceof BridgeHttpError ? error.status : 500;
        sendJson(res, status, normalized, origin, config);
      }
    })();
  });

  server.headersTimeout = HEADERS_TIMEOUT_MS;
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.timeout = REQUEST_TIMEOUT_MS;

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const onError = (error: NodeJS.ErrnoException) => {
      rejectPromise(
        new BridgeHttpError(
          409,
          "PORT_UNAVAILABLE",
          error.code === "EADDRINUSE"
            ? "Bridge port is already in use."
            : "Bridge failed to start.",
        ),
      );
    };

    server.once("error", onError);
    server.listen(options.port, "127.0.0.1", () => {
      server.off("error", onError);
      resolvePromise();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address !== null ? address.port : options.port;

  return {
    port: actualPort,
    pairingCode: config.pairingCode,
    projectId: config.projectId,
    projectName: config.projectName,
    canonicalRoot: config.canonicalRoot,
    bridgeInstanceId: config.bridgeInstanceId,
    allowedExtensionId: config.allowedExtensionId,
    close: () => server.close(),
  };
};

export { applySession, previewSession, rollback };
