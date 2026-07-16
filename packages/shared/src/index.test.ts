import { describe, expect, it } from "vitest";

import {
  buildImportantCssDeclarations,
  isExtensionMessage,
  parseCssDeclarations,
  serializeCssDeclarations,
} from "./index";

const node = {
  selector: "#save",
  domPath: "html > body > button#save",
  tagName: "button",
  id: "save",
  classList: ["button"],
  attributes: { "aria-label": "Save" },
  textPreview: "Save",
  childCount: 0,
  visible: true,
};

describe("DOM extension messages", () => {
  it("accepts DOM context and attribute-edit messages", () => {
    expect(isExtensionMessage({ type: "DOM_CONTEXT_REQUEST" })).toBe(true);
    expect(isExtensionMessage({ type: "DOM_TREE_SUBSCRIBE" })).toBe(true);
    expect(isExtensionMessage({ type: "DOM_TREE_UNSUBSCRIBE" })).toBe(true);
    expect(
      isExtensionMessage({
        type: "APPLY_RAW_CSS",
        payload: { selector: "#save", css: "color: red;", coalesce: true },
      }),
    ).toBe(true);
    expect(
      isExtensionMessage({
        type: "DOM_CONTEXT_RESULT",
        payload: {
          ancestry: [node],
          children: [],
          childrenBySelector: {},
          selectedSelector: "#save",
        },
      }),
    ).toBe(true);
    expect(
      isExtensionMessage({
        type: "DOM_CHILDREN_REQUEST",
        payload: { selector: "#save", includeAll: true },
      }),
    ).toBe(true);
    expect(
      isExtensionMessage({
        type: "DOM_CHILDREN_RESULT",
        payload: { selector: "#save", children: [node] },
      }),
    ).toBe(true);
    expect(
      isExtensionMessage({
        type: "UPDATE_ELEMENT_ATTRIBUTE",
        payload: { selector: "#save", name: "aria-label", value: "Save profile" },
      }),
    ).toBe(true);
  });

  it("rejects malformed DOM payloads", () => {
    expect(
      isExtensionMessage({
        type: "DOM_CONTEXT_RESULT",
        payload: {
          ancestry: [{ ...node, childCount: "0" }],
          children: [],
          childrenBySelector: {},
          selectedSelector: "#save",
        },
      }),
    ).toBe(false);
    expect(
      isExtensionMessage({
        type: "UPDATE_ELEMENT_ATTRIBUTE",
        payload: { selector: "#save", name: "aria-label", value: 42 },
      }),
    ).toBe(false);
    expect(
      isExtensionMessage({
        type: "APPLY_RAW_CSS",
        payload: { selector: "#save", css: "color: red;", coalesce: "yes" },
      }),
    ).toBe(false);
  });
  it("accepts arbitrary valid CSS properties in style changes", () => {
    const baseChange = {
      type: "APPLY_STYLE_CHANGE",
      payload: {
        selector: "#save",
        property: "grid-template-columns",
        beforeValue: "none",
        afterValue: "1fr 1fr",
        timestamp: "2026-07-13T00:00:00.000Z",
      },
    };

    expect(isExtensionMessage(baseChange)).toBe(true);
    expect(
      isExtensionMessage({
        ...baseChange,
        payload: { ...baseChange.payload, property: "--brand-color", afterValue: "#7c3aed" },
      }),
    ).toBe(true);
    expect(
      isExtensionMessage({
        ...baseChange,
        payload: { ...baseChange.payload, property: "color; display" },
      }),
    ).toBe(false);
  });

  it("validates matched declaration mutation messages", () => {
    expect(
      isExtensionMessage({
        type: "MUTATE_MATCHED_STYLE_DECLARATION",
        payload: {
          ruleId: "rule-0-2-selected",
          inheritedSelector: null,
          property: "padding-left",
          nextProperty: "padding-inline-start",
        },
      }),
    ).toBe(true);
    expect(
      isExtensionMessage({
        type: "MUTATE_MATCHED_STYLE_DECLARATION",
        payload: {
          ruleId: "inline-selected",
          inheritedSelector: null,
          property: "color",
          nextProperty: null,
        },
      }),
    ).toBe(true);
    expect(
      isExtensionMessage({
        type: "MUTATE_MATCHED_STYLE_DECLARATION",
        payload: {
          ruleId: "rule-0-2-selected",
          inheritedSelector: null,
          property: "color; display",
          nextProperty: null,
        },
      }),
    ).toBe(false);
  });
});
describe("CSS declaration parser Phase 9 properties", () => {
  it("parses quoted semicolons, data URLs, comments, and important flags", () => {
    const declarations = parseCssDeclarations(
      [
        'content: "a;b";',
        "background-image: url('data:image/svg+xml;charset=utf-8;demo');",
        "/* color: red; */",
        "--brand: color-mix(in srgb, #fff 50%, #000);",
        "opacity: 0.8 !important;",
      ].join("\n"),
    );

    expect(declarations).toEqual([
      { property: "content", value: '"a;b"', enabled: true },
      {
        property: "background-image",
        value: "url('data:image/svg+xml;charset=utf-8;demo')",
        enabled: true,
      },
      { property: "color", value: "red", enabled: false },
      { property: "--brand", value: "color-mix(in srgb, #fff 50%, #000)", enabled: true },
      { property: "opacity", value: "0.8 !important", enabled: true },
    ]);
  });

  it("round-trips serialized declarations without changing parser semantics", () => {
    const samples = [
      "color: red; padding: calc(1rem + 2px);",
      '/* display: none; */\ncontent: "literal;semicolon";',
      '--token: url("https://example.test/a;b.svg");',
    ];

    for (const sample of samples) {
      const parsed = parseCssDeclarations(sample);
      expect(parseCssDeclarations(serializeCssDeclarations(parsed))).toEqual(parsed);
    }
  });

  it("never emits disabled or empty declarations into important CSS output", () => {
    const css = buildImportantCssDeclarations(
      ["/* color: red; */", "font-size: 16px;", "empty: ;", "--brand: #05f;"].join("\n"),
    );

    expect(css).toBe(["  font-size: 16px !important;", "  --brand: #05f !important;"].join("\n"));
  });

  it("handles deterministic parser fuzz cases without throwing", () => {
    const values = [
      "plain",
      'url("https://example.test/a;b.png")',
      "linear-gradient(90deg, red, blue)",
      '"quoted { value; }"',
      "calc((100% - 2rem) / 3)",
    ];

    for (const [index, value] of values.entries()) {
      const css = `--fuzz-${index}: ${value}; color: rgb(${index}, ${index}, ${index});`;
      expect(() => parseCssDeclarations(css)).not.toThrow();
      expect(parseCssDeclarations(css)).toHaveLength(2);
    }
  });
});
