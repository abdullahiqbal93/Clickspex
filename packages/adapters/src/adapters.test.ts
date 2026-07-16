import { describe, expect, it } from "vitest";

import { computeCssFileEdit, cssAdapter } from "./cssAdapter";
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

describe("CSS adapter Phase 4 source-write guardrails", () => {
  it("rejects CSS modules and non-plain stylesheet dialects for automatic source edits", async () => {
    const intent = createIntent([
      {
        selector: "#save",
        property: "color",
        beforeValue: "#000000",
        afterValue: "#ffffff",
        timestamp: "2026-07-01T00:00:00.000Z",
      },
    ]);
    const moduleOnlyContext: ProjectContext = {
      ...projectContext,
      files: [{ ...projectContext.files![0]!, path: "src/Button.module.css" }],
      sourceFiles: [
        {
          ...projectContext.sourceFiles![0]!,
          path: "src/Button.module.css",
          content: "#save {\n  color: #000000;\n}\n",
        },
      ],
    };
    const scssOnlyContext: ProjectContext = {
      ...projectContext,
      files: [{ ...projectContext.files![0]!, path: "src/styles.scss" }],
      sourceFiles: [
        {
          ...projectContext.sourceFiles![0]!,
          path: "src/styles.scss",
          content: "$brand: #000;\n#save {\n  color: $brand;\n}\n",
        },
      ],
    };

    expect(cssAdapter.generatePatch(intent, moduleOnlyContext)).toMatchObject([
      {
        filesToChange: [],
        warnings: [expect.stringContaining("Only plain .css files are writable")],
      },
    ]);
    expect(cssAdapter.generatePatch(intent, scssOnlyContext)).toMatchObject([
      {
        filesToChange: [],
        warnings: [expect.stringContaining("Only plain .css files are writable")],
      },
    ]);
  });

  it("requires exactly one plain CSS owner for automatic source edits", async () => {
    const intent = createIntent([
      {
        selector: "#save",
        property: "color",
        beforeValue: "#000000",
        afterValue: "#ffffff",
        timestamp: "2026-07-01T00:00:00.000Z",
      },
    ]);
    const ambiguousContext: ProjectContext = {
      ...projectContext,
      sourceFiles: [
        projectContext.sourceFiles![0]!,
        { ...projectContext.sourceFiles![0]!, path: "src/other.css" },
      ],
    };

    const [suggestion] = await cssAdapter.generatePatch(intent, ambiguousContext);

    expect(suggestion).toMatchObject({ filesToChange: [] });
    expect(suggestion?.warnings[0]).toContain("No exact single plain-CSS owner rule was found");
  });

  it("updates existing media rules idempotently instead of appending duplicates", async () => {
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
    const context: ProjectContext = {
      ...projectContext,
      sourceFiles: [
        {
          ...projectContext.sourceFiles![0]!,
          content:
            "#save {\n  color: #000000;\n}\n\n@media (max-width: 767px) {\n  #save {\n    width: 320px;\n  }\n}\n",
        },
      ],
    };

    const [suggestion] = await cssAdapter.generatePatch(intent, context);

    expect(suggestion?.filesToChange).toEqual(["src/styles.css"]);
    expect(suggestion?.diffPreview).toContain("-    width: 320px;");
    expect(suggestion?.diffPreview).toContain("+    width: 100%;");
    expect((suggestion?.diffPreview.match(/@media \(max-width: 767px\)/g) ?? []).length).toBe(1);
  });

  it("removes declarations through explicit empty-value operations", async () => {
    const intent = createIntent([
      {
        selector: "#save",
        property: "color",
        beforeValue: "#000000",
        afterValue: "",
        timestamp: "2026-07-01T00:00:00.000Z",
      },
    ]);

    const [suggestion] = await cssAdapter.generatePatch(intent, projectContext);

    expect(suggestion?.diffPreview).toContain("-  color: #000000;");
    expect(suggestion?.diffPreview).not.toContain("+  color:");
  });

  it("parses raw CSS containing quoted semicolons when patching source", async () => {
    const intent = {
      ...createIntent([]),
      rawCss: 'background-image: url("data:image/svg+xml;charset=utf-8;demo"); --brand: #05f;',
    };

    const [suggestion] = await cssAdapter.generatePatch(intent, projectContext);

    expect(suggestion?.diffPreview).toContain(
      '+  background-image: url("data:image/svg+xml;charset=utf-8;demo");',
    );
    expect(suggestion?.diffPreview).toContain("+  --brand: #05f;");
  });
});
describe("CSS adapter Phase 9 mutation regression suite", () => {
  const stylesheetContext = (
    content: string,
    options: { path?: string; selectors?: string[] } = {},
  ): ProjectContext => {
    const baseFile = projectContext.files?.[0];
    const baseSource = projectContext.sourceFiles?.[0];

    if (baseFile === undefined || baseSource === undefined) {
      throw new Error("Expected stylesheet fixture metadata.");
    }

    const path = options.path ?? "src/styles.css";
    const selectors = options.selectors ?? ["#save"];

    return {
      ...projectContext,
      files: [{ ...baseFile, path, selectors, size: content.length }],
      sourceFiles: [{ ...baseSource, path, selectors, size: content.length, content }],
    };
  };

  it("does not generate a source edit when no stylesheet owns the selector", () => {
    const intent = createIntent([
      {
        selector: "#save",
        property: "color",
        beforeValue: "#000000",
        afterValue: "#ffffff",
        timestamp: "2026-07-01T00:00:00.000Z",
      },
    ]);
    const context = stylesheetContext(".other {\n  color: #000000;\n}\n", {
      selectors: [".other"],
    });

    expect(computeCssFileEdit(intent, context)).toBeNull();
  });

  it("rejects malformed CSS instead of attempting a recovery write", () => {
    const intent = createIntent([
      {
        selector: "#save",
        property: "color",
        beforeValue: "#000000",
        afterValue: "#ffffff",
        timestamp: "2026-07-01T00:00:00.000Z",
      },
    ]);
    const context = stylesheetContext("/* unclosed comment\n#save {\n  color: #000000;\n}\n");

    expect(computeCssFileEdit(intent, context)).toBeNull();
  });

  it("preserves grouped selectors, comments, and strings containing braces", () => {
    const intent = createIntent([
      {
        selector: "#save",
        property: "color",
        beforeValue: "#000000",
        afterValue: "#ffffff",
        timestamp: "2026-07-01T00:00:00.000Z",
      },
    ]);
    const context = stylesheetContext(
      [
        "/* keep this owner note */",
        "#save, .btn-primary {",
        '  content: "literal { brace }";',
        "  color: #000000;",
        "}",
        "",
      ].join("\n"),
      { selectors: ["#save", ".btn-primary"] },
    );

    const edit = computeCssFileEdit(intent, context);

    expect(edit?.nextContent).toContain("/* keep this owner note */");
    expect(edit?.nextContent).toContain("#save, .btn-primary");
    expect(edit?.nextContent).toContain('content: "literal { brace }";');
    expect(edit?.nextContent).toContain("color: #ffffff;");
  });

  it("is idempotent when applying the same responsive intent to its own output", () => {
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
    const context = stylesheetContext(
      [
        "#save {",
        "  color: #000000;",
        "}",
        "",
        "@media (max-width: 767px) {",
        "  #save {",
        "    width: 320px;",
        "  }",
        "}",
        "",
      ].join("\n"),
    );

    const firstEdit = computeCssFileEdit(intent, context);
    expect(firstEdit).not.toBeNull();

    const secondEdit = computeCssFileEdit(intent, stylesheetContext(firstEdit!.nextContent));

    expect(secondEdit).toBeNull();
  });

  it("keeps unrelated rules byte-stable across a source patch", () => {
    const intent = createIntent([
      {
        selector: "#save",
        property: "background-color",
        beforeValue: "transparent",
        afterValue: "#123456",
        timestamp: "2026-07-01T00:00:00.000Z",
      },
    ]);
    const unrelatedRule = '.card::before { content: "semi; colon"; }';
    const context = stylesheetContext(
      ["#save {", "  color: #000000;", "}", unrelatedRule, ""].join("\n"),
    );

    const edit = computeCssFileEdit(intent, context);

    expect(edit?.nextContent).toContain(unrelatedRule);
    expect(edit?.nextContent).toContain("background-color: #123456;");
  });
});
