import { describe, expect, it } from "vitest";

import { cssAdapter } from "./cssAdapter";
import { scaffoldAdapters } from "./scaffoldAdapters";
import { generateTailwindClassesFromChangeIntent, tailwindAdapter } from "./tailwindAdapter";

import type { ProjectContext, UIChangeIntent } from "@ui-devtools/shared";

const createIntent = (changes: UIChangeIntent["changes"]): UIChangeIntent => ({
  id: "intent-test",
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
  changes,
  accessibilityNotes: [],
});

const projectContext: ProjectContext = {
  rootPath: "/fixture",
  packageJson: {
    dependencies: { tailwindcss: "^3.4.0" },
    devDependencies: {},
  },
  configFiles: ["tailwind.config.ts", "styles.css"],
  directories: ["src"],
};

describe("CSS adapter", () => {
  it("exports changed declarations as a standalone CSS rule", () => {
    const intent = createIntent([
      {
        selector: "#save",
        property: "color",
        beforeValue: "#000000",
        afterValue: "#ffffff",
        timestamp: "2026-07-01T00:00:00.000Z",
      },
      {
        selector: "#save",
        property: "font-size",
        beforeValue: "14px",
        afterValue: "16px",
        timestamp: "2026-07-01T00:00:00.000Z",
      },
    ]);

    expect(cssAdapter.generateExport(intent).content).toBe(
      ["#save {", "  color: #ffffff;", "  font-size: 16px;", "}"].join("\n"),
    );
  });
});

describe("Tailwind adapter", () => {
  it("maps exact supported values and warns on unmapped values", () => {
    const intent = createIntent([
      {
        selector: "#save",
        property: "font-size",
        beforeValue: "14px",
        afterValue: "16px",
        timestamp: "2026-07-01T00:00:00.000Z",
      },
      {
        selector: "#save",
        property: "padding-left",
        beforeValue: "8px",
        afterValue: "16px",
        timestamp: "2026-07-01T00:00:00.000Z",
      },
      {
        selector: "#save",
        property: "line-height",
        beforeValue: "20px",
        afterValue: "21px",
        timestamp: "2026-07-01T00:00:00.000Z",
      },
    ]);

    const result = generateTailwindClassesFromChangeIntent(intent);

    expect(result.classes).toEqual(["text-base", "pl-4"]);
    expect(result.warnings).toEqual(["No conservative Tailwind mapping for line-height: 21px"]);
  });

  it("detects Tailwind from dependency and config evidence", async () => {
    await expect(Promise.resolve(tailwindAdapter.detect(projectContext))).resolves.toMatchObject({
      adapterId: "tailwind",
      detected: true,
      evidence: ["tailwindcss dependency found in package.json.", "Tailwind config file found."],
    });
  });
});

describe("framework scaffold adapters", () => {
  it("return explicit unsupported patch suggestions instead of fake source edits", async () => {
    const intent = createIntent([]);
    const [reactAdapter] = scaffoldAdapters;

    if (reactAdapter === undefined) {
      throw new Error("Expected at least one scaffold adapter.");
    }

    const [suggestion] = await reactAdapter.generatePatch(intent);

    expect(suggestion).toMatchObject({
      adapterId: "react",
      confidence: 0,
      filesToChange: [],
    });
    expect(suggestion?.warnings[0]).toContain("does not generate real patches in v1");
  });
});
