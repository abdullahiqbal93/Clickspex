import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applySession, previewSession, rollback, startBridge } from "./bridge.js";

import type { BridgeApplyResponse, BridgePreviewResponse, UIChangeSession } from "@ui-buddy/shared";

const roots: string[] = [];
const EXTENSION_ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`;

const side = { top: "0px", right: "0px", bottom: "0px", left: "0px" };

const makeProject = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "ui-buddy-bridge-"));
  roots.push(root);
  await mkdir(join(root, "src"));
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "demo" }), "utf8");
  await writeFile(join(root, "src", "styles.css"), "#save {\n  color: #000000;\n}\n", "utf8");
  return root;
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const pairBridge = async (base: string, pairingCode: string): Promise<string> => {
  const response = await fetch(`${base}/pair`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: EXTENSION_ORIGIN },
    body: JSON.stringify({ pairingCode }),
  });

  expect(response.status).toBe(200);
  const body = (await response.json()) as { token: string };
  expect(body.token).toEqual(expect.any(String));
  return body.token;
};

const previewViaBridge = async (base: string, token: string): Promise<BridgePreviewResponse> => {
  const response = await fetch(`${base}/preview`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      origin: EXTENSION_ORIGIN,
    },
    body: JSON.stringify({ session: session() }),
  });

  expect(response.status).toBe(200);
  return (await response.json()) as BridgePreviewResponse;
};

const applyPreviewViaBridge = async (base: string, token: string, previewId: string) =>
  fetch(`${base}/apply`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      origin: EXTENSION_ORIGIN,
    },
    body: JSON.stringify({ previewId }),
  });

const rollbackViaBridge = async (base: string, token: string, backupId: string) =>
  fetch(`${base}/rollback`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      origin: EXTENSION_ORIGIN,
    },
    body: JSON.stringify({ backupId }),
  });

const session = (): UIChangeSession => ({
  id: "session-1",
  timestamp: "2026-07-01T00:00:00.000Z",
  pageUrl: "https://example.test",
  viewport: { width: 0, height: 0, devicePixelRatio: 1 },
  elements: [
    {
      id: "intent-1",
      timestamp: "2026-07-01T00:00:00.000Z",
      pageUrl: "https://example.test",
      viewport: { width: 0, height: 0, devicePixelRatio: 1 },
      target: {
        tagName: "button",
        id: "save",
        classList: [],
        selector: "#save",
        domPath: "#save",
        attributes: {},
      },
      before: {
        styles: {},
        rect: { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 },
        boxModel: {
          margin: side,
          border: side,
          padding: side,
          content: { width: "0px", height: "0px" },
        },
      },
      after: { styles: {} },
      changes: [
        {
          selector: "#save",
          property: "color",
          beforeValue: "#000000",
          afterValue: "#ff0000",
          timestamp: "2026-07-01T00:00:00.000Z",
        },
      ],
      accessibilityNotes: [],
    },
  ],
  structuralEdits: [],
  stats: { editedElements: 1, styleChanges: 1, structuralEdits: 0 },
});

describe("bridge preview/apply/rollback", () => {
  it("previews immutable artifact metadata for a matched stylesheet", async () => {
    const root = await makeProject();

    const result = await previewSession(session(), root);

    expect(result.operationId).toEqual(expect.stringMatching(/^preview-/));
    expect(result.previewId).toEqual(expect.any(String));
    expect(result.sessionHash).toEqual(expect.any(String));
    expect(result.projectId).toEqual(expect.any(String));
    expect(result.bridgeInstanceId).toBe("direct-preview");
    expect(Date.parse(result.createdAt)).not.toBeNaN();
    expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.parse(result.createdAt));
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toMatchObject({ path: "src/styles.css" });
    expect(result.files[0]?.beforeHash).not.toBe(result.files[0]?.afterHash);
    expect(result.files[0]?.diff).toContain("color: #ff0000");
    expect(result.elements[0]?.applicable).toBe(true);
    expect(result.elements[0]?.file).toBe("src/styles.css");
    expect(result.elements[0]?.diff).toContain("color: #ff0000");
  });

  it("rejects non-configured origins and allows the configured extension origin", async () => {
    const root = await makeProject();
    const bridge = await startBridge({ rootPath: root, port: 0, allowedExtensionId: EXTENSION_ID });

    try {
      const base = `http://127.0.0.1:${bridge.port}`;

      const fromWebsite = await fetch(`${base}/health`, {
        headers: { origin: "https://evil.example" },
      });
      expect(fromWebsite.status).toBe(403);
      await expect(fromWebsite.json()).resolves.toMatchObject({
        ok: false,
        code: "FORBIDDEN_ORIGIN",
      });

      const fromExtension = await fetch(`${base}/health`, {
        headers: { origin: EXTENSION_ORIGIN },
      });
      expect(fromExtension.status).toBe(200);
      await expect(fromExtension.json()).resolves.toMatchObject({
        ok: true,
        codeSyncWriteEnabled: false,
        projectName: "demo",
        protocolVersion: 1,
      });
    } finally {
      bridge.close();
    }
  });

  it("requires pairing before preview and rejects route-prefix attacks", async () => {
    const root = await makeProject();
    const bridge = await startBridge({ rootPath: root, port: 0, allowedExtensionId: EXTENSION_ID });

    try {
      const base = `http://127.0.0.1:${bridge.port}`;
      const preview = await fetch(`${base}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: EXTENSION_ORIGIN },
        body: JSON.stringify({ session: session() }),
      });
      expect(preview.status).toBe(401);
      await expect(preview.json()).resolves.toMatchObject({ ok: false, code: "UNAUTHORIZED" });

      const token = await pairBridge(base, bridge.pairingCode);
      const prefixAttack = await fetch(`${base}/preview/anything`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          origin: EXTENSION_ORIGIN,
        },
        body: JSON.stringify({ session: session() }),
      });
      expect(prefixAttack.status).toBe(404);
      await expect(prefixAttack.json()).resolves.toMatchObject({ ok: false, code: "NOT_FOUND" });
    } finally {
      bridge.close();
    }
  });

  it("keeps HTTP source writes disabled unless explicitly enabled", async () => {
    const root = await makeProject();
    const bridge = await startBridge({ rootPath: root, port: 0, allowedExtensionId: EXTENSION_ID });

    try {
      const base = `http://127.0.0.1:${bridge.port}`;
      const token = await pairBridge(base, bridge.pairingCode);
      const preview = await previewViaBridge(base, token);
      const blocked = await applyPreviewViaBridge(base, token, preview.previewId);

      expect(blocked.status).toBe(403);
      await expect(blocked.json()).resolves.toMatchObject({
        ok: false,
        code: "CODE_SYNC_WRITES_DISABLED",
      });

      const afterBlockedApply = await readFile(join(root, "src", "styles.css"), "utf8");
      expect(afterBlockedApply).toContain("color: #000000");
    } finally {
      bridge.close();
    }

    const writeEnabledBridge = await startBridge({
      rootPath: root,
      port: 0,
      codeSyncWriteEnabled: true,
      allowedExtensionId: EXTENSION_ID,
    });

    try {
      const base = `http://127.0.0.1:${writeEnabledBridge.port}`;
      const token = await pairBridge(base, writeEnabledBridge.pairingCode);
      const preview = await previewViaBridge(base, token);
      expect(preview.operationId).toEqual(expect.stringMatching(/^preview-/));
      const applied = await applyPreviewViaBridge(base, token, preview.previewId);

      expect(applied.status).toBe(200);
      const appliedBody = (await applied.json()) as BridgeApplyResponse;
      expect(appliedBody).toMatchObject({
        ok: true,
        operationId: expect.stringMatching(/^apply-/),
      });
      expect(appliedBody.backupId).toEqual(expect.any(String));

      const afterApply = await readFile(join(root, "src", "styles.css"), "utf8");
      expect(afterApply).toContain("color: #ff0000");

      const manifest = JSON.parse(
        await readFile(
          join(root, ".ui-buddy", "backups", appliedBody.backupId!, "manifest.json"),
          "utf8",
        ),
      ) as {
        projectId: string;
        operationId: string;
        previewId: string;
        files: Array<{ path: string; beforeHash: string; appliedHash: string; backupPath: string }>;
      };
      expect(manifest).toMatchObject({
        projectId: writeEnabledBridge.projectId,
        operationId: appliedBody.operationId,
        previewId: preview.previewId,
      });
      expect(manifest.files[0]).toMatchObject({ path: "src/styles.css" });
      expect(manifest.files[0]?.beforeHash).not.toBe(manifest.files[0]?.appliedHash);
      expect(manifest.files[0]?.backupPath).toContain(
        `.ui-buddy/backups/${appliedBody.backupId}/src/styles.css`,
      );

      const rolledBack = await rollbackViaBridge(base, token, appliedBody.backupId!);
      expect(rolledBack.status).toBe(200);
      await expect(rolledBack.json()).resolves.toMatchObject({
        ok: true,
        operationId: expect.stringMatching(/^rollback-/),
        backupId: appliedBody.backupId,
        restored: ["src/styles.css"],
      });

      const afterRollback = await readFile(join(root, "src", "styles.css"), "utf8");
      expect(afterRollback).toContain("color: #000000");
    } finally {
      writeEnabledBridge.close();
    }
  });

  it("rejects legacy mutable session apply requests", async () => {
    const root = await makeProject();
    const bridge = await startBridge({
      rootPath: root,
      port: 0,
      codeSyncWriteEnabled: true,
      allowedExtensionId: EXTENSION_ID,
    });

    try {
      const base = `http://127.0.0.1:${bridge.port}`;
      const token = await pairBridge(base, bridge.pairingCode);
      const response = await fetch(`${base}/apply`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          origin: EXTENSION_ORIGIN,
        },
        body: JSON.stringify({ session: session() }),
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ ok: false, code: "BAD_REQUEST" });
      const afterApply = await readFile(join(root, "src", "styles.css"), "utf8");
      expect(afterApply).toContain("color: #000000");
    } finally {
      bridge.close();
    }
  });

  it("rejects stale preview artifacts when source changes after preview", async () => {
    const root = await makeProject();
    const bridge = await startBridge({
      rootPath: root,
      port: 0,
      codeSyncWriteEnabled: true,
      allowedExtensionId: EXTENSION_ID,
    });

    try {
      const base = `http://127.0.0.1:${bridge.port}`;
      const token = await pairBridge(base, bridge.pairingCode);
      const preview = await previewViaBridge(base, token);
      await writeFile(join(root, "src", "styles.css"), "#save {\n  color: #111111;\n}\n", "utf8");

      const response = await applyPreviewViaBridge(base, token, preview.previewId);

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ ok: false, code: "PREVIEW_STALE" });
      const afterApply = await readFile(join(root, "src", "styles.css"), "utf8");
      expect(afterApply).toContain("color: #111111");
      expect(afterApply).not.toContain("#ff0000");
    } finally {
      bridge.close();
    }
  });

  it("does not allow replaying an already applied preview artifact", async () => {
    const root = await makeProject();
    const bridge = await startBridge({
      rootPath: root,
      port: 0,
      codeSyncWriteEnabled: true,
      allowedExtensionId: EXTENSION_ID,
    });

    try {
      const base = `http://127.0.0.1:${bridge.port}`;
      const token = await pairBridge(base, bridge.pairingCode);
      const preview = await previewViaBridge(base, token);
      const applied = await applyPreviewViaBridge(base, token, preview.previewId);
      expect(applied.status).toBe(200);

      const replay = await applyPreviewViaBridge(base, token, preview.previewId);
      expect(replay.status).toBe(404);
      await expect(replay.json()).resolves.toMatchObject({ ok: false, code: "PREVIEW_NOT_FOUND" });
    } finally {
      bridge.close();
    }
  });

  it("refuses rollback when source changed after apply", async () => {
    const root = await makeProject();
    const bridge = await startBridge({
      rootPath: root,
      port: 0,
      codeSyncWriteEnabled: true,
      allowedExtensionId: EXTENSION_ID,
    });

    try {
      const base = `http://127.0.0.1:${bridge.port}`;
      const token = await pairBridge(base, bridge.pairingCode);
      const preview = await previewViaBridge(base, token);
      const applied = await applyPreviewViaBridge(base, token, preview.previewId);
      expect(applied.status).toBe(200);
      const appliedBody = (await applied.json()) as BridgeApplyResponse;
      expect(appliedBody.backupId).not.toBeNull();

      await writeFile(join(root, "src", "styles.css"), "#save {\n  color: #00ff00;\n}\n", "utf8");
      const rollbackResponse = await rollbackViaBridge(base, token, appliedBody.backupId!);

      expect(rollbackResponse.status).toBe(409);
      await expect(rollbackResponse.json()).resolves.toMatchObject({
        ok: false,
        code: "ROLLBACK_CONFLICT",
      });
      const afterRollback = await readFile(join(root, "src", "styles.css"), "utf8");
      expect(afterRollback).toContain("color: #00ff00");
    } finally {
      bridge.close();
    }
  });

  it("applies the change to source and can roll it back", async () => {
    const root = await makeProject();

    const applied = await applySession(session(), root);
    expect(applied.applied).toHaveLength(1);
    expect(applied.operationId).toEqual(expect.stringMatching(/^apply-/));
    expect(applied.backupId).not.toBeNull();

    const afterApply = await readFile(join(root, "src", "styles.css"), "utf8");
    expect(afterApply).toContain("color: #ff0000");

    const rolledBack = await rollback(root, applied.backupId ?? undefined);
    expect(rolledBack.operationId).toEqual(expect.stringMatching(/^rollback-/));

    const afterRollback = await readFile(join(root, "src", "styles.css"), "utf8");
    expect(afterRollback).toContain("color: #000000");
    expect(afterRollback).not.toContain("#ff0000");
  });
});
