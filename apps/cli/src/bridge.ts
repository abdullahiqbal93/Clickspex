import { timingSafeEqual, createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, realpath, rename, stat, unlink } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { computeCssFileEdit, createUnifiedDiff } from "@clickspex/adapters";
import { scanProjectContext } from "@clickspex/core/project";
import {
  BRIDGE_PROTOCOL_VERSION,
  bridgeApplyRequestSchema,
  bridgePairRequestSchema,
  bridgePreviewRequestSchema,
  bridgeRollbackRequestSchema,
} from "@clickspex/shared";

import type {
  BridgeApplyResponse,
  BridgeErrorCode,
  BridgeHealthResponse,
  BridgePairResponse,
  BridgePreviewResponse,
  BridgeRollbackResponse,
  BridgeStructuredError,
  ProjectContext,
  UIChangeSession,
} from "@clickspex/shared";

const CLICKSPEX_DIR = ".clickspex";
const DEFAULT_BODY_LIMIT_BYTES = 1024 * 1024;
const BACKUP_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const EXTENSION_ID_PATTERN = /^[a-p]{32}$/;
const REQUEST_TIMEOUT_MS = 15_000;
const HEADERS_TIMEOUT_MS = 5_000;
const PREVIEW_TTL_MS = 10 * 60 * 1000;
const MAX_PREVIEW_ARTIFACTS = 25;
const TRANSACTION_TEMP_PREFIX = `.clickspex-tmp-${process.pid}-`;

type BridgeLogLevel = "debug" | "info" | "warn" | "error";

type BridgeLogFields = Record<string, string | number | boolean | null | undefined>;

type BridgeLogger = {
  log: (level: BridgeLogLevel, event: string, fields?: BridgeLogFields) => void;
};

const SENSITIVE_LOG_FIELD_PATTERN = /token|authorization|content|diff|source|pairingCode/i;

const redactLogFields = (fields: BridgeLogFields = {}): BridgeLogFields =>
  Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      SENSITIVE_LOG_FIELD_PATTERN.test(key) ? "[redacted]" : value,
    ]),
  );

const createBridgeLogger = (options: { verbose?: boolean; json?: boolean } = {}): BridgeLogger => ({
  log: (level, event, fields = {}) => {
    if (level === "debug" && options.verbose !== true) {
      return;
    }

    const redactedFields = redactLogFields(fields);

    if (options.json === true) {
      const line = JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        event,
        ...redactedFields,
      });
      (level === "error" ? process.stderr : process.stdout).write(`${line}\n`);
      return;
    }

    const suffix =
      Object.keys(redactedFields).length === 0 ? "" : ` ${JSON.stringify(redactedFields)}`;
    (level === "error" ? process.stderr : process.stdout).write(
      `[clickspex] ${level} ${event}${suffix}\n`,
    );
  },
});

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
    "Source writes are disabled. Restart clickspex connect with --enable-code-sync-writes to apply or roll back source changes.",
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

const contentHash = (content: string): string => createHash("sha256").update(content).digest("hex");

const hashSession = (session: UIChangeSession): string => contentHash(JSON.stringify(session));

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

type PreviewArtifactFile = BridgePreviewResponse["files"][number] & {
  beforeContent: string;
  afterContent: string;
};

type StoredPreviewArtifact = Omit<BridgePreviewResponse, "ok" | "files"> & {
  files: PreviewArtifactFile[];
};

const previewResponseFromArtifact = (artifact: StoredPreviewArtifact): BridgePreviewResponse => ({
  ok: true,
  operationId: artifact.operationId,
  previewId: artifact.previewId,
  sessionHash: artifact.sessionHash,
  projectId: artifact.projectId,
  bridgeInstanceId: artifact.bridgeInstanceId,
  createdAt: artifact.createdAt,
  expiresAt: artifact.expiresAt,
  files: artifact.files.map(({ path, beforeHash, afterHash, diff }) => ({
    path,
    beforeHash,
    afterHash,
    diff,
  })),
  sessionId: artifact.sessionId,
  root: artifact.root,
  elements: artifact.elements,
  structuralEdits: artifact.structuralEdits,
});

const createPreviewArtifact = async (
  session: UIChangeSession,
  config: {
    canonicalRoot: string;
    projectId: string;
    bridgeInstanceId: string;
    scanMaxDepth?: number;
    scanMaxFiles?: number;
    scanMaxFileBytes?: number;
  },
  operationId: string,
): Promise<StoredPreviewArtifact> => {
  const scanOptions = {
    includeSource: true,
    ...(config.scanMaxDepth === undefined ? {} : { maxDepth: config.scanMaxDepth }),
    ...(config.scanMaxFiles === undefined ? {} : { maxFiles: config.scanMaxFiles }),
    ...(config.scanMaxFileBytes === undefined ? {} : { maxFileBytes: config.scanMaxFileBytes }),
  };
  const projectContext: ProjectContext = await scanProjectContext(
    config.canonicalRoot,
    scanOptions,
  );

  if (projectContext.indexStats?.truncated === true) {
    throw new BridgeHttpError(
      409,
      "SOURCE_INDEX_TRUNCATED",
      "Project source index was truncated. Automatic source preview/apply is refused until scan limits or ignore rules are adjusted.",
      {
        operationId,
        indexedFiles: String(projectContext.indexStats.indexedFiles),
        truncatedPaths: projectContext.indexStats.truncatedPaths.join(","),
      },
    );
  }
  const originalByPath = new Map<string, string>();
  for (const file of projectContext.sourceFiles ?? []) {
    originalByPath.set(file.path, file.content);
  }

  const elements: PreviewElement[] = [];
  const touchedPaths = new Set<string>();

  for (const intent of session.elements) {
    const edit = computeCssFileEdit(intent, projectContext);

    if (edit === null) {
      elements.push({
        selector: intent.target.selector,
        file: null,
        confidence: 0,
        diff: null,
        applicable: false,
        note: "No indexed stylesheet matched this element.",
      });
      continue;
    }

    const applicable = edit.previousContent !== edit.nextContent;

    elements.push({
      selector: intent.target.selector,
      file: edit.path,
      confidence: edit.confidence,
      diff: createUnifiedDiff(edit.path, edit.previousContent, edit.nextContent),
      applicable,
    });

    if (!applicable) {
      continue;
    }

    const sourceFile = projectContext.sourceFiles?.find((file) => file.path === edit.path);
    if (sourceFile !== undefined) {
      sourceFile.content = edit.nextContent;
    }
    touchedPaths.add(edit.path);
  }

  const files: PreviewArtifactFile[] = [];
  for (const relPath of touchedPaths) {
    const beforeContent = originalByPath.get(relPath);
    const afterContent = projectContext.sourceFiles?.find((file) => file.path === relPath)?.content;

    if (
      beforeContent === undefined ||
      afterContent === undefined ||
      beforeContent === afterContent
    ) {
      continue;
    }

    files.push({
      path: relPath,
      beforeHash: contentHash(beforeContent),
      afterHash: contentHash(afterContent),
      diff: createUnifiedDiff(relPath, beforeContent, afterContent),
      beforeContent,
      afterContent,
    });
  }

  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + PREVIEW_TTL_MS);

  return {
    operationId,
    previewId: randomUUID(),
    sessionHash: hashSession(session),
    projectId: config.projectId,
    bridgeInstanceId: config.bridgeInstanceId,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    files,
    sessionId: session.id,
    root: config.canonicalRoot,
    elements,
    structuralEdits: session.structuralEdits.map((edit) => ({
      kind: edit.kind,
      selector: edit.target.selector,
      summary: edit.summary,
    })),
  };
};

const previewSession = async (
  session: UIChangeSession,
  rootPath: string,
): Promise<PreviewResult> => {
  const canonicalRoot = await validateProjectRoot(rootPath);

  return previewResponseFromArtifact(
    await createPreviewArtifact(
      session,
      {
        canonicalRoot,
        projectId: stableProjectId(canonicalRoot),
        bridgeInstanceId: "direct-preview",
      },
      `preview-${randomUUID()}`,
    ),
  );
};

export type ApplyResult = BridgeApplyResponse;

const applySession = async (
  session: UIChangeSession,
  rootPath: string,
  selectors?: string[],
): Promise<ApplyResult> => {
  const canonicalRoot = await validateProjectRoot(rootPath);
  const projectId = stableProjectId(canonicalRoot);
  const bridgeInstanceId = "direct-apply";
  const operationId = `apply-${randomUUID()}`;
  const filteredSession =
    selectors === undefined
      ? session
      : {
          ...session,
          elements: session.elements.filter((intent) => selectors.includes(intent.target.selector)),
        };
  const artifact = await createPreviewArtifact(
    filteredSession,
    { canonicalRoot, projectId, bridgeInstanceId },
    operationId,
  );

  return applyPreviewArtifact(
    {
      canonicalRoot,
      projectId,
      bridgeInstanceId,
      previewArtifacts: new Map([[artifact.previewId, artifact]]),
    },
    artifact.previewId,
    operationId,
  );
};
const pruneExpiredPreviewArtifacts = (
  config: Pick<BridgeRuntimeConfig, "previewArtifacts">,
): void => {
  const now = Date.now();

  for (const [previewId, artifact] of config.previewArtifacts) {
    const expiresAt = Date.parse(artifact.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= now) {
      config.previewArtifacts.delete(previewId);
    }
  }
};

const storePreviewArtifact = (
  config: Pick<BridgeRuntimeConfig, "previewArtifacts">,
  artifact: StoredPreviewArtifact,
): void => {
  pruneExpiredPreviewArtifacts(config);
  config.previewArtifacts.set(artifact.previewId, artifact);

  while (config.previewArtifacts.size > MAX_PREVIEW_ARTIFACTS) {
    const oldestPreviewId = config.previewArtifacts.keys().next().value;
    if (oldestPreviewId === undefined) {
      break;
    }
    config.previewArtifacts.delete(oldestPreviewId);
  }
};

const verifiedPreviewSourceContents = async (
  config: Pick<BridgeRuntimeConfig, "canonicalRoot" | "projectId" | "bridgeInstanceId">,
  artifact: StoredPreviewArtifact,
): Promise<Map<string, string>> => {
  if (
    artifact.projectId !== config.projectId ||
    artifact.bridgeInstanceId !== config.bridgeInstanceId
  ) {
    throw new BridgeHttpError(
      409,
      "PREVIEW_STALE",
      "Preview was created for a different bridge instance. Rerun preview.",
    );
  }

  const expiresAt = Date.parse(artifact.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new BridgeHttpError(410, "PREVIEW_EXPIRED", "Preview expired. Rerun preview.");
  }

  const currentByPath = new Map<string, string>();

  for (const file of artifact.files) {
    const absPath = resolve(config.canonicalRoot, file.path);

    if (!isInsideRoot(config.canonicalRoot, absPath)) {
      throw new BridgeHttpError(
        400,
        "BAD_REQUEST",
        "Preview file resolves outside the project root.",
      );
    }

    await validateSafeExistingPath(config.canonicalRoot, absPath);
    const currentContent = await readFile(absPath, "utf8");

    if (contentHash(currentContent) !== file.beforeHash) {
      throw new BridgeHttpError(
        409,
        "PREVIEW_STALE",
        "Source changed after preview. Rerun preview before applying.",
        { path: file.path },
      );
    }

    currentByPath.set(file.path, currentContent);
  }

  return currentByPath;
};

type BackupManifestFile = {
  path: string;
  beforeHash: string;
  appliedHash: string;
  backupPath: string;
};

type BackupManifest = {
  backupId: string;
  previewId: string;
  projectId: string;
  operationId: string;
  createdAt: string;
  files: BackupManifestFile[];
};

type PreparedTransactionFile = PreviewArtifactFile & {
  absPath: string;
  backupPath: string;
  backupRelativePath: string;
  mode: number | undefined;
  originalContent: string;
};

const skippedForPreviewElement = (
  element: BridgePreviewResponse["elements"][number],
): BridgeApplyResponse["skipped"][number] => ({
  selector: element.selector,
  reason: element.note ?? "No change to write.",
  code: element.note === undefined ? "NO_CHANGE" : "NO_STYLESHEET_MATCH",
});

const writeFileDurably = async (
  filePath: string,
  content: string,
  mode?: number,
): Promise<void> => {
  const handle = mode === undefined ? await open(filePath, "w") : await open(filePath, "w", mode);

  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }

  if (mode !== undefined) {
    await chmod(filePath, mode);
  }
};

const atomicReplaceFile = async (
  absPath: string,
  content: string,
  mode?: number,
): Promise<void> => {
  const tempPath = join(dirname(absPath), `${TRANSACTION_TEMP_PREFIX}${randomUUID()}.tmp`);

  try {
    await writeFileDurably(tempPath, content, mode);
    await rename(tempPath, absPath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
};

const manifestPathFor = (backupRoot: string): string => join(backupRoot, "manifest.json");

const writeBackupManifest = async (backupRoot: string, manifest: BackupManifest): Promise<void> => {
  await writeFileDurably(manifestPathFor(backupRoot), `${JSON.stringify(manifest, null, 2)}\n`);
};

const readBackupManifest = async (backupRoot: string): Promise<BackupManifest> => {
  const raw = await readFile(manifestPathFor(backupRoot), "utf8");
  const parsed = JSON.parse(raw) as Partial<BackupManifest>;

  if (
    typeof parsed.backupId !== "string" ||
    typeof parsed.previewId !== "string" ||
    typeof parsed.projectId !== "string" ||
    typeof parsed.createdAt !== "string" ||
    !Array.isArray(parsed.files)
  ) {
    throw new BridgeHttpError(400, "INVALID_BACKUP_ID", "Backup manifest is invalid.");
  }

  return {
    backupId: parsed.backupId,
    previewId: parsed.previewId,
    projectId: parsed.projectId,
    operationId: typeof parsed.operationId === "string" ? parsed.operationId : "unknown",
    createdAt: parsed.createdAt,
    files: parsed.files as BackupManifestFile[],
  };
};

const prepareTransactionFiles = async (
  config: Pick<BridgeRuntimeConfig, "canonicalRoot">,
  artifact: StoredPreviewArtifact,
  currentByPath: Map<string, string>,
  backupRoot: string,
  backupId: string,
): Promise<PreparedTransactionFile[]> => {
  const prepared: PreparedTransactionFile[] = [];

  for (const file of artifact.files) {
    const absPath = resolve(config.canonicalRoot, file.path);
    const info = await stat(absPath);
    const originalContent = currentByPath.get(file.path) ?? file.beforeContent;
    const backupRelativePath = `${CLICKSPEX_DIR}/backups/${backupId}/${file.path.replace(/\\/g, "/")}`;
    const backupPath = join(config.canonicalRoot, backupRelativePath);

    await mkdir(dirname(backupPath), { recursive: true });
    await writeFileDurably(backupPath, originalContent, info.mode);

    const verifiedBackup = await readFile(backupPath, "utf8");
    if (contentHash(verifiedBackup) !== file.beforeHash) {
      throw new BridgeHttpError(
        500,
        "WRITE_TRANSACTION_FAILED",
        "Backup verification failed before source files were changed.",
      );
    }

    prepared.push({
      ...file,
      absPath,
      backupPath,
      backupRelativePath,
      mode: info.mode,
      originalContent,
    });
  }

  return prepared;
};

const restoreReplacedFiles = async (files: PreparedTransactionFile[]): Promise<void> => {
  for (let index = files.length - 1; index >= 0; index -= 1) {
    const file = files[index];
    if (file !== undefined) {
      await atomicReplaceFile(file.absPath, file.originalContent, file.mode);
    }
  }
};

const applyPreviewArtifact = async (
  config: Pick<
    BridgeRuntimeConfig,
    "canonicalRoot" | "projectId" | "bridgeInstanceId" | "previewArtifacts"
  >,
  previewId: string,
  operationId: string,
): Promise<ApplyResult> => {
  const artifact = config.previewArtifacts.get(previewId);

  if (artifact === undefined) {
    pruneExpiredPreviewArtifacts(config);
    throw new BridgeHttpError(
      404,
      "PREVIEW_NOT_FOUND",
      "Preview artifact was not found. Rerun preview.",
      { operationId },
    );
  }

  try {
    const currentByPath = await verifiedPreviewSourceContents(config, artifact);
    const skipped = artifact.elements
      .filter((element) => !element.applicable)
      .map(skippedForPreviewElement);

    if (artifact.files.length === 0) {
      config.previewArtifacts.delete(previewId);
      throw new BridgeHttpError(
        409,
        "NO_CHANGES_TO_APPLY",
        "Preview contains no source file changes to apply.",
        { operationId },
      );
    }

    const backupId = new Date().toISOString().replace(/[:.]/g, "-");
    const backupRoot = join(config.canonicalRoot, CLICKSPEX_DIR, "backups", backupId);

    await mkdir(join(config.canonicalRoot, CLICKSPEX_DIR), { recursive: true });
    await writeFileDurably(
      join(config.canonicalRoot, CLICKSPEX_DIR, ".gitignore"),
      "backups/\nlast-backup.json\n",
    );
    await mkdir(backupRoot, { recursive: true });

    const preparedFiles = await prepareTransactionFiles(
      config,
      artifact,
      currentByPath,
      backupRoot,
      backupId,
    );
    const manifest: BackupManifest = {
      backupId,
      previewId,
      projectId: config.projectId,
      operationId,
      createdAt: new Date().toISOString(),
      files: preparedFiles.map((file) => ({
        path: file.path,
        beforeHash: file.beforeHash,
        appliedHash: file.afterHash,
        backupPath: file.backupRelativePath,
      })),
    };

    await writeBackupManifest(backupRoot, manifest);

    const replaced: PreparedTransactionFile[] = [];
    const applied: Array<{ selector: string; file: string }> = [];

    try {
      for (const file of preparedFiles) {
        await atomicReplaceFile(file.absPath, file.afterContent, file.mode);
        const appliedContent = await readFile(file.absPath, "utf8");

        if (contentHash(appliedContent) !== file.afterHash) {
          throw new Error(`Atomic write verification failed for ${file.path}.`);
        }

        replaced.push(file);
        applied.push(
          ...artifact.elements
            .filter((element) => element.applicable && element.file === file.path)
            .map((element) => ({ selector: element.selector, file: file.path })),
        );
      }
    } catch (error) {
      try {
        await restoreReplacedFiles(replaced);
      } catch (recoveryError) {
        throw new BridgeHttpError(
          500,
          "WRITE_TRANSACTION_FAILED",
          "Source write failed and automatic recovery did not complete. Inspect the backup manifest before retrying.",
          {
            operationId,
            recovery: recoveryError instanceof Error ? recoveryError.message : "failed",
          },
        );
      }

      throw new BridgeHttpError(
        500,
        "WRITE_TRANSACTION_FAILED",
        "Source write failed. All files already replaced by this transaction were restored.",
        { operationId, cause: error instanceof Error ? error.message : "unknown" },
      );
    }

    if (applied.length === 0) {
      throw new BridgeHttpError(
        500,
        "WRITE_TRANSACTION_FAILED",
        "No source files were written by the apply transaction.",
        { operationId },
      );
    }

    await writeFileDurably(
      join(config.canonicalRoot, CLICKSPEX_DIR, "last-backup.json"),
      `${JSON.stringify({ backupId }, null, 2)}\n`,
    );

    config.previewArtifacts.delete(previewId);
    return { ok: true, operationId, backupId, applied, skipped };
  } catch (error) {
    if (
      error instanceof BridgeHttpError &&
      (error.code === "PREVIEW_EXPIRED" || error.code === "PREVIEW_STALE")
    ) {
      config.previewArtifacts.delete(previewId);
    }

    throw error;
  }
};
export type RollbackResult = BridgeRollbackResponse;

const rollback = async (
  rootPath: string,
  backupId?: string,
  operationId = `rollback-${randomUUID()}`,
): Promise<RollbackResult> => {
  const canonicalRoot = await validateProjectRoot(rootPath);
  let id = backupId;

  if (id === undefined) {
    const raw = await readFile(join(canonicalRoot, CLICKSPEX_DIR, "last-backup.json"), "utf8");
    id = (JSON.parse(raw) as { backupId: string }).backupId;
  }

  validateBackupId(id);

  const backupRoot = join(canonicalRoot, CLICKSPEX_DIR, "backups", id);
  const manifest = await readBackupManifest(backupRoot);

  if (manifest.backupId !== id) {
    throw new BridgeHttpError(400, "INVALID_BACKUP_ID", "Backup manifest ID mismatch.", {
      operationId,
    });
  }

  if (manifest.projectId !== stableProjectId(canonicalRoot)) {
    throw new BridgeHttpError(
      409,
      "ROLLBACK_CONFLICT",
      "Backup belongs to a different project root.",
      { operationId },
    );
  }

  const prepared: Array<{
    relPath: string;
    absTarget: string;
    backupAbsPath: string;
    backupContent: string;
    mode: number | undefined;
  }> = [];

  for (const file of manifest.files) {
    const absTarget = resolve(canonicalRoot, file.path);

    if (!isInsideRoot(canonicalRoot, absTarget)) {
      throw new BridgeHttpError(400, "BAD_REQUEST", "Rollback file resolves outside root.", {
        operationId,
      });
    }

    await validateSafeExistingPath(canonicalRoot, absTarget);
    const currentContent = await readFile(absTarget, "utf8");

    if (contentHash(currentContent) !== file.appliedHash) {
      throw new BridgeHttpError(
        409,
        "ROLLBACK_CONFLICT",
        "Source changed after apply. Automatic rollback refused.",
        { operationId, path: file.path },
      );
    }

    const backupAbsPath = resolve(canonicalRoot, file.backupPath);
    if (!isInsideRoot(canonicalRoot, backupAbsPath)) {
      throw new BridgeHttpError(400, "BAD_REQUEST", "Backup path resolves outside root.", {
        operationId,
      });
    }

    const backupContent = await readFile(backupAbsPath, "utf8");
    if (contentHash(backupContent) !== file.beforeHash) {
      throw new BridgeHttpError(
        400,
        "INVALID_BACKUP_ID",
        "Backup content failed hash verification.",
        {
          operationId,
          path: file.path,
        },
      );
    }

    const info = await stat(absTarget).catch(() => undefined);
    prepared.push({
      relPath: file.path,
      absTarget,
      backupAbsPath,
      backupContent,
      mode: info?.mode,
    });
  }

  const restored: string[] = [];
  for (const file of prepared) {
    await atomicReplaceFile(file.absTarget, file.backupContent, file.mode);
    restored.push(file.relPath);
  }

  return { ok: true, operationId, backupId: id, restored };
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
  scanMaxDepth?: number;
  scanMaxFiles?: number;
  scanMaxFileBytes?: number;
  previewArtifacts: Map<string, StoredPreviewArtifact>;
  activeOperation: { id: string; name: BridgeOperationName } | null;
  logger: BridgeLogger;
};

type BridgeOperationName = "preview" | "apply" | "rollback";

const withProjectOperation = async <T>(
  config: BridgeRuntimeConfig,
  name: BridgeOperationName,
  run: (operationId: string) => Promise<T>,
): Promise<T> => {
  if (config.activeOperation !== null) {
    config.logger.log("warn", "bridge_operation_conflict", {
      operationId: config.activeOperation.id,
      operation: config.activeOperation.name,
      requestedOperation: name,
    });
    throw new BridgeHttpError(409, "WRITE_LOCKED", "Another bridge transaction is active.", {
      operationId: config.activeOperation.id,
      operation: config.activeOperation.name,
    });
  }

  const operationId = `${name}-${randomUUID()}`;
  config.activeOperation = { id: operationId, name };
  config.logger.log("info", "bridge_operation_started", { operationId, operation: name });

  try {
    const result = await run(operationId);
    config.logger.log("info", "bridge_operation_completed", { operationId, operation: name });
    return result;
  } catch (error) {
    config.logger.log(
      error instanceof BridgeHttpError && error.status < 500 ? "warn" : "error",
      "bridge_operation_failed",
      {
        operationId,
        operation: name,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    throw error;
  } finally {
    config.activeOperation = null;
  }
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
  scanMaxDepth?: number;
  scanMaxFiles?: number;
  scanMaxFileBytes?: number;
  verbose?: boolean;
  jsonLogs?: boolean;
}): Promise<BridgeHandle> => {
  validatePort(options.port);

  const canonicalRoot = await validateProjectRoot(options.rootPath);
  const allowedExtensionId = validateExtensionId(options.allowedExtensionId);
  const logger = createBridgeLogger({
    ...(options.verbose === undefined ? {} : { verbose: options.verbose }),
    ...(options.jsonLogs === undefined ? {} : { json: options.jsonLogs }),
  });
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
    ...(options.scanMaxDepth === undefined ? {} : { scanMaxDepth: options.scanMaxDepth }),
    ...(options.scanMaxFiles === undefined ? {} : { scanMaxFiles: options.scanMaxFiles }),
    ...(options.scanMaxFileBytes === undefined
      ? {}
      : { scanMaxFileBytes: options.scanMaxFileBytes }),
    previewArtifacts: new Map(),
    activeOperation: null,
    logger,
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
            config.logger.log("warn", "bridge_pairing_failed", {
              origin: typeof origin === "string" ? origin : null,
            });
            throw new BridgeHttpError(401, "UNAUTHORIZED", "Pairing code is incorrect.");
          }

          config.logger.log("info", "bridge_pairing_succeeded", {
            origin: typeof origin === "string" ? origin : null,
          });

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
          const response = await withProjectOperation(config, "preview", async (operationId) => {
            const artifact = await createPreviewArtifact(body.session, config, operationId);
            storePreviewArtifact(config, artifact);
            return previewResponseFromArtifact(artifact);
          });
          sendJson(res, 200, response, origin, config);
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
          const response = await withProjectOperation(config, "apply", (operationId) =>
            applyPreviewArtifact(config, body.previewId, operationId),
          );
          sendJson(res, 200, response, origin, config);
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
          const response = await withProjectOperation(config, "rollback", (operationId) =>
            rollback(canonicalRoot, body.backupId, operationId),
          );
          sendJson(res, 200, response, origin, config);
          return;
        }

        throw new BridgeHttpError(404, "NOT_FOUND", "Unknown bridge endpoint.");
      } catch (error) {
        const normalized =
          error instanceof BridgeHttpError
            ? bridgeError(error.status, error.code, error.message, error.details)
            : bridgeError(500, "INTERNAL_ERROR", "Bridge request failed.");
        const status = error instanceof BridgeHttpError ? error.status : 500;
        config.logger.log(status >= 500 ? "error" : "warn", "bridge_request_failed", {
          method: req.method ?? null,
          path: req.url ?? null,
          status,
          code: normalized.code,
          error: normalized.error,
        });
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
  config.logger.log("info", "bridge_started", {
    port: actualPort,
    projectId: config.projectId,
    projectName: config.projectName,
    canonicalRoot: config.canonicalRoot,
    bridgeInstanceId: config.bridgeInstanceId,
    writesEnabled: config.codeSyncWriteEnabled,
  });

  return {
    port: actualPort,
    pairingCode: config.pairingCode,
    projectId: config.projectId,
    projectName: config.projectName,
    canonicalRoot: config.canonicalRoot,
    bridgeInstanceId: config.bridgeInstanceId,
    allowedExtensionId: config.allowedExtensionId,
    close: () => {
      server.close();
      config.logger.log("info", "bridge_stopped", {
        port: actualPort,
        projectId: config.projectId,
      });
    },
  };
};

export { applySession, previewSession, rollback };
