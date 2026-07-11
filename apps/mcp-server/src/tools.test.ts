import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  handleDetectFramework,
  handleGenerateExport,
  handleGenerateSessionExport,
  handleIndexProject,
  handlePreviewPatchSuggestions,
  handleScanProject,
} from "./tools.js";

import type { UIChangeIntent, UIChangeSession } from "@ui-buddy/shared";

type ScanData = { rootPath: string; files: string[] };
type IndexData = { rootPath: string; files: Array<{ path: string; classNames: string[] }> };
type ExportData = { css: { content: string }; tailwind: { content: string; warnings: string[] } };
type PatchData = Array<{
  adapterId: string;
  filesToChange: string[];
  diffPreview: string;
  warnings: string[];
}>;
type DetectionData = { detections: Array<{ name: string }> };

const tempRoots: string[] = [];

const createTempProject = async (): Promise<string> => {
  const rootPath = await mkdtemp(join(tmpdir(), "ui-buddy-mcp-"));
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

const createSourceAwareProject = async (): Promise<string> => {
  const rootPath = await createTempProject();
  await mkdir(join(rootPath, "src"));
  await mkdir(join(rootPath, "src", "components"));
  await writeFile(
    join(rootPath, "package.json"),
    JSON.stringify({
      dependencies: { react: "18.3.0" },
      devDependencies: { tailwindcss: "3.4.0" },
    }),
    "utf8",
  );
  await writeFile(join(rootPath, "tailwind.config.ts"), "export default {};\n", "utf8");
  await writeFile(join(rootPath, "src", "styles.css"), "#save {\n  color: #000000;\n}\n", "utf8");
  await writeFile(
    join(rootPath, "src", "components", "Button.tsx"),
    'export const Button = () => <button id="save" className="btn px-2">Save</button>;\n',
    "utf8",
  );
  return rootPath;
};

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

  it("indexes source metadata without returning source content", async () => {
    const rootPath = await createSourceAwareProject();

    const result = await handleIndexProject({ path: rootPath });
    const data = result.data as IndexData;

    expect(result.ok).toBe(true);
    expect(data.files.map((file) => file.path)).toEqual(
      expect.arrayContaining(["src/components/Button.tsx", "src/styles.css"]),
    );
    expect(
      data.files.find((file) => file.path === "src/components/Button.tsx")?.classNames,
    ).toEqual(expect.arrayContaining(["btn", "px-2"]));
    expect(JSON.stringify(data)).not.toContain("export const Button");
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

  it("generates CSS, Tailwind exports, and source-aware patch suggestions from change intent", async () => {
    const rootPath = await createSourceAwareProject();
    const exportResult = handleGenerateExport({ changeIntent });
    const exportData = exportResult.data as ExportData;

    expect(exportResult.ok).toBe(true);
    expect(exportData.css.content).toContain("font-size: 16px;");
    expect(exportData.tailwind.content).toBe("text-base");

    const patchResult = await handlePreviewPatchSuggestions({
      changeIntent,
      projectPath: rootPath,
    });
    const patchData = patchResult.data as PatchData;

    expect(patchResult.ok).toBe(true);
    expect(patchData.map((patch) => patch.adapterId)).toEqual(
      expect.arrayContaining(["css", "tailwind", "react"]),
    );
    expect(patchData.find((patch) => patch.adapterId === "css")?.filesToChange).toEqual([
      "src/styles.css",
    ]);
    expect(patchData.find((patch) => patch.adapterId === "tailwind")?.diffPreview).toContain(
      'className="btn px-2 text-base"',
    );
  });

  it("generates exports for every element in a change session", () => {
    const session: UIChangeSession = {
      id: "mcp-session",
      timestamp: "2026-07-01T00:00:00.000Z",
      pageUrl: "https://example.test",
      viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
      elements: [
        changeIntent,
        {
          ...changeIntent,
          id: "mcp-intent-2",
          target: { ...changeIntent.target, id: "cancel", selector: "#cancel" },
          changes: [
            {
              selector: "#cancel",
              property: "color",
              beforeValue: "#000000",
              afterValue: "#ffffff",
              timestamp: "2026-07-01T00:00:00.000Z",
            },
          ],
        },
      ],
      structuralEdits: [
        {
          id: "edit-1",
          kind: "delete",
          timestamp: "2026-07-01T00:00:00.000Z",
          target: { tagName: "div", classList: [], selector: "#gone", domPath: "#gone" },
          summary: "Hid element",
          details: {},
        },
        {
          id: "edit-2",
          kind: "attribute",
          timestamp: "2026-07-01T00:00:01.000Z",
          target: { tagName: "button", classList: [], selector: "#save", domPath: "#save" },
          summary: "Set aria-label",
          details: { name: "aria-label", before: "(absent)", after: "Save profile" },
        },
      ],
      stats: { editedElements: 2, styleChanges: 2, structuralEdits: 2 },
    };

    const result = handleGenerateSessionExport({ session });
    const data = result.data as {
      stats: { editedElements: number };
      elements: Array<{ selector: string; css: { content: string } }>;
      structuralEdits: Array<{ kind: string; selector: string }>;
    };

    expect(result.ok).toBe(true);
    expect(data.stats.editedElements).toBe(2);
    expect(data.elements.map((element) => element.selector)).toEqual(["#save", "#cancel"]);
    expect(data.elements[0]?.css.content).toContain("font-size: 16px;");
    expect(data.structuralEdits[0]?.selector).toBe("#gone");
    expect(data.structuralEdits[1]).toMatchObject({ kind: "attribute", selector: "#save" });
  });

  it("returns structured errors for invalid input", async () => {
    const result = await handleScanProject({ path: "" });

    expect(result).toMatchObject({ ok: false, error: { code: "scan_project_failed" } });
  });
});
