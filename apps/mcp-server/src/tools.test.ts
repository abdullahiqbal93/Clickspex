import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  handleDetectFramework,
  handleGenerateExport,
  handlePreviewPatchSuggestions,
  handleScanProject,
} from "./tools.js";

import type { UIChangeIntent } from "@ui-devtools/shared";

type ScanData = { rootPath: string; files: string[] };
type ExportData = { css: { content: string }; tailwind: { content: string; warnings: string[] } };
type PatchData = Array<{ adapterId: string; warnings: string[] }>;
type DetectionData = { detections: Array<{ name: string }> };

const tempRoots: string[] = [];

const createTempProject = async (): Promise<string> => {
  const rootPath = await mkdtemp(join(tmpdir(), "ui-devtools-mcp-"));
  tempRoots.push(rootPath);
  return rootPath;
};

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((rootPath) => rm(rootPath, { recursive: true })));
});

const changeIntent: UIChangeIntent = {
  id: "mcp-intent",
  timestamp: "2026-07-01T00:00:00.000Z",
  pageUrl: "https://example.test",
  viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
  target: {
    tagName: "button",
    id: "save",
    classList: ["btn"],
    textPreview: "Save",
    selector: "#save",
    domPath: "html > body > button#save",
    attributes: { id: "save", class: "btn" },
  },
  before: {
    styles: {},
    rect: { x: 0, y: 0, top: 0, right: 120, bottom: 40, left: 0, width: 120, height: 40 },
    boxModel: {
      margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
      border: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
      padding: { top: "8px", right: "16px", bottom: "8px", left: "16px" },
      content: { width: "120px", height: "40px" },
    },
  },
  after: { styles: {} },
  changes: [
    {
      selector: "#save",
      property: "font-size",
      beforeValue: "14px",
      afterValue: "16px",
      timestamp: "2026-07-01T00:00:00.000Z",
    },
  ],
  accessibilityNotes: [],
};

const normalizePath = (path: string): string => path.replaceAll("\\", "/");

describe("MCP tool handlers", () => {
  it("scans projects without returning ignored dependency or secret-looking files", async () => {
    const rootPath = await createTempProject();
    await mkdir(join(rootPath, "src"));
    await mkdir(join(rootPath, "node_modules"));
    await writeFile(join(rootPath, "src", "index.ts"), "export {};\n", "utf8");
    await writeFile(join(rootPath, "node_modules", "package.js"), "", "utf8");
    await writeFile(join(rootPath, ".env.local"), "TOKEN=secret\n", "utf8");
    await writeFile(join(rootPath, "package.json"), "{}\n", "utf8");

    const result = await handleScanProject({ path: rootPath });
    const data = result.data as ScanData;
    const files = data.files.map(normalizePath);

    expect(result.ok).toBe(true);
    expect(files).toContain("package.json");
    expect(files).toContain("src/index.ts");
    expect(files).not.toContain(".env.local");
    expect(files.some((file) => file.startsWith("node_modules"))).toBe(false);
  });

  it("detects frameworks through the shared project detector", async () => {
    const rootPath = await createTempProject();
    await writeFile(join(rootPath, "vite.config.ts"), "export default {};\n", "utf8");
    await writeFile(
      join(rootPath, "package.json"),
      JSON.stringify({ dependencies: { react: "18.3.0" }, devDependencies: { vite: "5.0.0" } }),
      "utf8",
    );

    const result = await handleDetectFramework({ path: rootPath });
    const data = result.data as DetectionData;

    expect(result.ok).toBe(true);
    expect(data.detections.map((item) => item.name)).toEqual(
      expect.arrayContaining(["React", "Vite"]),
    );
  });

  it("generates CSS, Tailwind exports, and advisory patch suggestions from change intent", async () => {
    const exportResult = handleGenerateExport({ changeIntent });
    const exportData = exportResult.data as ExportData;

    expect(exportResult.ok).toBe(true);
    expect(exportData.css.content).toContain("font-size: 16px;");
    expect(exportData.tailwind.content).toBe("text-base");

    const patchResult = await handlePreviewPatchSuggestions({ changeIntent });
    const patchData = patchResult.data as PatchData;

    expect(patchResult.ok).toBe(true);
    expect(patchData.map((patch) => patch.adapterId)).toEqual(
      expect.arrayContaining(["css", "tailwind", "react"]),
    );
  });

  it("returns structured errors for invalid input", async () => {
    const result = await handleScanProject({ path: "" });

    expect(result).toMatchObject({ ok: false, error: { code: "scan_project_failed" } });
  });
});
