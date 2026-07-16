import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applySession, previewSession, rollback, startBridge } from "./bridge.js";

import type { UIChangeSession } from "@ui-buddy/shared";

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
  it("previews a diff for a matched stylesheet", async () => {
    const root = await makeProject();

    const result = await previewSession(session(), root);

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
      const blocked = await fetch(`${base}/apply`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          origin: EXTENSION_ORIGIN,
        },
        body: JSON.stringify({ session: session() }),
      });

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
      const applied = await fetch(`${base}/apply`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          origin: EXTENSION_ORIGIN,
        },
        body: JSON.stringify({ session: session() }),
      });

      expect(applied.status).toBe(200);
      await expect(applied.json()).resolves.toMatchObject({ ok: true });

      const afterApply = await readFile(join(root, "src", "styles.css"), "utf8");
      expect(afterApply).toContain("color: #ff0000");
    } finally {
      writeEnabledBridge.close();
    }
  });

  it("applies the change to source and can roll it back", async () => {
    const root = await makeProject();

    const applied = await applySession(session(), root);
    expect(applied.applied).toHaveLength(1);
    expect(applied.backupId).not.toBeNull();

    const afterApply = await readFile(join(root, "src", "styles.css"), "utf8");
    expect(afterApply).toContain("color: #ff0000");

    await rollback(root);

    const afterRollback = await readFile(join(root, "src", "styles.css"), "utf8");
    expect(afterRollback).toContain("color: #000000");
    expect(afterRollback).not.toContain("#ff0000");
  });
});
