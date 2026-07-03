import { describe, expect, it } from "vitest";

import { cssAdapter } from "./cssAdapter";
import { scaffoldAdapters } from "./scaffoldAdapters";
import { generateTailwindClassesFromChangeIntent, tailwindAdapter } from "./tailwindAdapter";

import type { ProjectContext, UIChangeIntent } from "@ui-buddy/shared";

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
    dependencies: { react: "18.3.0" },
    devDependencies: { tailwindcss: "^3.4.0" },
  },
  configFiles: ["tailwind.config.ts", "styles.css"],
  directories: ["src"],
  files: [
    {
      path: "src/styles.css",
      kind: "stylesheet",
      size: 24,
      selectors: ["#save"],
      classNames: ["btn"],
      ids: ["save"],
      imports: [],
    },
    {
      path: "src/components/Button.tsx",
      kind: "component",
      size: 86,
      selectors: [],
      classNames: ["btn", "px-2"],
      ids: ["save"],
      imports: [],
    },
  ],
  sourceFiles: [
    {
      path: "src/styles.css",
      kind: "stylesheet",
      size: 24,
      selectors: ["#save"],
      classNames: ["btn"],
      ids: ["save"],
      imports: [],
      content: "#save {\n  color: #000000;\n}\n",
    },
    {
      path: "src/components/Button.tsx",
      kind: "component",
      size: 86,
      selectors: [],
      classNames: ["btn", "px-2"],
      ids: ["save"],
      imports: [],
      content:
        'export const Button = () => <button id="save" className="btn px-2">Save</button>;\n',
    },
  ],
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
      {
        selector: "#save",
        property: "padding-left",
        beforeValue: "8px",
        afterValue: "16px",
        timestamp: "2026-07-01T00:00:00.000Z",
      },
    ]);

    expect(cssAdapter.generateExport(intent).content).toBe(
      ["#save {", "  color: #ffffff;", "  font-size: 16px;", "  padding-left: 16px;", "}"].join(
        "\n",
      ),
    );
  });

  it("exports pseudo-state declarations as pseudo-class CSS rules", () => {
    const intent = createIntent([
      {
        selector: "#save",
        property: "transition",
        beforeValue: "",
        afterValue: "all 200ms ease-out",
        timestamp: "2026-07-01T00:00:00.000Z",
      },
      {
        selector: "#save",
        property: "transform",
        beforeValue: "",
        afterValue: "scale(1.04)",
        timestamp: "2026-07-01T00:00:00.000Z",
        state: "hover",
      },
    ]);

    expect(cssAdapter.generateExport(intent).content).toBe(
      [
        "#save {",
        "  transition: all 200ms ease-out;",
        "}",
        "",
        "#save:hover {",
        "  transform: scale(1.04);",
        "}",
      ].join("\n"),
    );
  });
  it("exports responsive declarations as media-query CSS rules", () => {
    const intent = createIntent([
      {
        selector: "#save",
        property: "width",
        beforeValue: "320px",
        afterValue: "100%",
        timestamp: "2026-07-01T00:00:00.000Z",
        responsiveTarget: "mobile",
      },
    ]);

    expect(cssAdapter.generateExport(intent).content).toBe(
      ["@media (max-width: 767px) {", "  #save {", "    width: 100%;", "  }", "}"].join("\n"),
    );
  });
  it("previews source-aware stylesheet diffs when indexed source is available", async () => {
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

    const [suggestion] = await cssAdapter.generatePatch(intent, projectContext);

    expect(suggestion).toMatchObject({
      adapterId: "css",
      filesToChange: ["src/styles.css"],
    });
    expect(suggestion?.diffPreview).toContain("+++ b/src/styles.css");
    expect(suggestion?.diffPreview).toContain("+  color: #ffffff;");
    expect(suggestion?.diffPreview).toContain("+  font-size: 16px;");
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
        property: "font-size",
        beforeValue: "16px",
        afterValue: "13px",
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

    expect(result.classes).toEqual(["text-base", "pl-4", "text-[13px]", "leading-[21px]"]);
    expect(result.warnings).toEqual([]);
  });

  it("prefixes mapped Tailwind utilities with pseudo-state variants", () => {
    const intent = createIntent([
      {
        selector: "#save",
        property: "display",
        beforeValue: "block",
        afterValue: "flex",
        timestamp: "2026-07-01T00:00:00.000Z",
        state: "hover",
      },
    ]);

    const result = generateTailwindClassesFromChangeIntent(intent);

    expect(result.classes).toEqual(["hover:flex"]);
  });
  it("prefixes mapped Tailwind utilities with responsive and pseudo variants", () => {
    const intent = createIntent([
      {
        selector: "#save",
        property: "display",
        beforeValue: "block",
        afterValue: "flex",
        timestamp: "2026-07-01T00:00:00.000Z",
        state: "hover",
        responsiveTarget: "desktop",
      },
      {
        selector: "#save",
        property: "width",
        beforeValue: "320px",
        afterValue: "100%",
        timestamp: "2026-07-01T00:00:00.000Z",
        responsiveTarget: "mobile",
      },
    ]);

    const result = generateTailwindClassesFromChangeIntent(intent);

    expect(result.classes).toEqual(["lg:hover:flex", "max-md:w-full"]);
    expect(result.warnings).toEqual([
      "Responsive Tailwind prefixes assume default breakpoints: max-md, md:max-lg, and lg.",
    ]);
  });
  it("detects Tailwind from dependency, config, and source evidence", async () => {
    await expect(Promise.resolve(tailwindAdapter.detect(projectContext))).resolves.toMatchObject({
      adapterId: "tailwind",
      detected: true,
      evidence: expect.arrayContaining([
        "tailwindcss dependency found in package.json.",
        "Tailwind config file found.",
        "Utility-like classes found in indexed source files.",
      ]),
    });
  });

  it("previews source-aware class attribute diffs when indexed source is available", async () => {
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
    ]);

    const [suggestion] = await tailwindAdapter.generatePatch(intent, projectContext);

    expect(suggestion).toMatchObject({
      adapterId: "tailwind",
      filesToChange: ["src/components/Button.tsx"],
    });
    expect(suggestion?.diffPreview).toContain('className="btn px-2 text-base pl-4"');
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
      explanation: "Not yet implemented. See ROADMAP(v2) in adapter source.",
      filesToChange: [],
      diffPreview: "",
    });
    expect(suggestion?.warnings[0]).toContain("does not generate real patches in v1");
  });

  it("returns source-aware framework review hints when indexed source is available", async () => {
    const intent = createIntent([]);
    const [reactAdapter] = scaffoldAdapters;

    if (reactAdapter === undefined) {
      throw new Error("Expected at least one scaffold adapter.");
    }

    const detection = await reactAdapter.detect(projectContext);
    const [suggestion] = await reactAdapter.generatePatch(intent, projectContext);

    expect(detection).toMatchObject({ adapterId: "react", detected: true });
    expect(suggestion).toMatchObject({
      adapterId: "react",
      filesToChange: ["src/components/Button.tsx"],
      diffPreview: "",
    });
    expect(suggestion?.manualSteps[0]).toContain("src/components/Button.tsx");
  });
});
