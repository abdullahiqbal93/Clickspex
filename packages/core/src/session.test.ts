import { describe, expect, it } from "vitest";

import {
  createUIChangeSession,
  summarizeSessionAsAgentPrompt,
  summarizeSessionAsMarkdown,
} from "./changeIntent";

import type { ElementSnapshot, StructuralEdit, StyleChange } from "@ui-buddy/shared";

const side = { top: "0px", right: "0px", bottom: "0px", left: "0px" };

const snapshot = (selector: string): ElementSnapshot => ({
  tagName: "div",
  id: "",
  classList: [],
  textPreview: "",
  attributes: {},
  selector,
  domPath: selector,
  rect: { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 },
  computedStyles: {},
  boxModel: {
    margin: side,
    border: side,
    padding: side,
    content: { width: "0px", height: "0px" },
  },
  parentLayout: null,
});

const change = (
  selector: string,
  property: StyleChange["property"],
  beforeValue: string,
  afterValue: string,
): StyleChange => ({
  selector,
  property,
  beforeValue,
  afterValue,
  timestamp: "2026-07-01T00:00:00.000Z",
});

describe("createUIChangeSession", () => {
  it("captures every edited element, not just the last selected one", () => {
    const session = createUIChangeSession({
      pageUrl: "https://example.com",
      viewport: { width: 1440, height: 900, devicePixelRatio: 1 },
      elements: [
        { target: snapshot("#a"), changes: [change("#a", "color", "#000000", "#ffffff")] },
        {
          target: snapshot("#b"),
          changes: [change("#b", "font-size", "14px", "16px")],
          rawCss: "display: none;",
          accessibilityNotes: [
            {
              id: "contrast-1",
              severity: "warning",
              title: "Contrast risk",
              message: "Text contrast may be below the target ratio after the color change.",
            },
          ],
        },
        // No changes and no raw CSS - should be dropped from the session.
        { target: snapshot("#c"), changes: [] },
      ],
    });

    expect(session.stats.editedElements).toBe(2);
    expect(session.elements.map((element) => element.target.selector)).toEqual(["#a", "#b"]);
    expect(session.stats.styleChanges).toBe(2);
    expect(session.elements[1]!.rawCss).toBe("display: none;");
  });

  it("keeps structural edits and includes them in the markdown summary", () => {
    const edit: StructuralEdit = {
      id: "edit-1",
      kind: "delete",
      timestamp: "2026-07-01T00:00:00.000Z",
      target: { tagName: "div", classList: [], selector: "#d", domPath: "#d" },
      summary: "Hid element",
      details: {},
    };

    const session = createUIChangeSession({
      pageUrl: "https://example.com",
      viewport: { width: 0, height: 0, devicePixelRatio: 1 },
      elements: [
        { target: snapshot("#a"), changes: [change("#a", "color", "#000000", "#ffffff")] },
      ],
      structuralEdits: [edit],
    });

    expect(session.structuralEdits).toHaveLength(1);
    expect(session.stats.structuralEdits).toBe(1);

    const markdown = summarizeSessionAsMarkdown(session);
    expect(markdown).toContain("#a");
    expect(markdown).toContain("Structural edits");
    expect(markdown).toContain("Hid element");
  });

  it("builds a rich, framework-aware agent prompt with identity, before/after, and CSS", () => {
    const edit: StructuralEdit = {
      id: "edit-1",
      kind: "delete",
      timestamp: "2026-07-01T00:00:00.000Z",
      target: { tagName: "div", classList: [], selector: "#promo", domPath: "#promo" },
      summary: "Hid element",
      details: {},
    };

    const session = createUIChangeSession({
      pageUrl: "https://example.com",
      viewport: { width: 1440, height: 900, devicePixelRatio: 1 },
      elements: [
        {
          target: snapshot("#save"),
          changes: [change("#save", "color", "#000000", "#ffffff")],
          rawCss: "display: none;",
          accessibilityNotes: [
            {
              id: "contrast-1",
              severity: "warning",
              title: "Contrast risk",
              message: "Text contrast may be below the target ratio after the color change.",
            },
          ],
        },
      ],
      structuralEdits: [edit],
      frameworkHints: ["React", "Tailwind CSS"],
    });

    const prompt = summarizeSessionAsAgentPrompt(session);
    expect(prompt).toContain("UI change request");
    expect(prompt).toContain("Detected stack: React, Tailwind CSS");
    expect(prompt).toContain("Stack guidance confidence: detected");
    expect(prompt).toContain("Tailwind CSS is in use");
    expect(prompt).toContain("Find it in source");
    expect(prompt).toContain("#save");
    // Explicit before -> after
    expect(prompt).toContain("`color`: `#000000` -> `#ffffff`");
    // Target CSS block + raw CSS
    expect(prompt).toContain("color: #ffffff");
    expect(prompt).toContain("display: none;");
    expect(prompt).toContain("Accessibility notes captured while editing");
    expect(prompt).toContain("WARNING: Contrast risk");
    // Structural edit
    expect(prompt).toContain("#promo");
  });
  it("separates runtime service hints and suggests semantic hooks for repeated text", () => {
    const cardTarget: ElementSnapshot = {
      ...snapshot("div.box:nth-of-type(4)"),
      tagName: "div",
      classList: ["box"],
      textPreview: "e-passbook",
      attributes: { class: "box" },
    };
    const labelTarget: ElementSnapshot = {
      ...snapshot("div.box:nth-of-type(4) > p:nth-of-type(1)"),
      tagName: "p",
      textPreview: "e-passbook",
    };

    const session = createUIChangeSession({
      pageUrl: "https://www.cdb.lk/",
      viewport: { width: 1363, height: 903, devicePixelRatio: 1 },
      elements: [
        {
          target: cardTarget,
          changes: [
            change(cardTarget.selector, "background-color", "rgb(220, 232, 242)", "#407db0"),
          ],
        },
        {
          target: labelTarget,
          changes: [change(labelTarget.selector, "color", "rgb(29, 29, 31)", "#ffffff")],
        },
      ],
      frameworkHints: ["jQuery", "Bootstrap", "Google Analytics / GTM"],
    });

    const prompt = summarizeSessionAsAgentPrompt(session);

    expect(prompt).toContain("Detected stack: jQuery, Bootstrap");
    expect(prompt).toContain("Observed runtime services: Google Analytics / GTM");
    expect(prompt).toContain("Stack guidance confidence: detected");
    expect(prompt).not.toContain("Unrecognized source hints: Google Analytics / GTM");
    expect(prompt).toContain(
      "Related source note: another edited element has the same visible text",
    );
    expect(prompt).toContain("add a small semantic class or data attribute");
  });

  it("collapses intermediate edits and warns about weak source selectors", () => {
    const target: ElementSnapshot = {
      ...snapshot("p.mb-4"),
      tagName: "p",
      classList: ["mb-4"],
      textPreview: "At CDB, we understand that flexible financial accessibility is essential",
      attributes: { class: "mb-4" },
    };

    const move: StructuralEdit = {
      id: "move-1",
      kind: "move",
      timestamp: "2026-07-01T00:00:00.000Z",
      target: {
        tagName: "div",
        classList: ["box"],
        selector: "div.box:nth-of-type(3)",
        domPath: "div.box:nth-of-type(3)",
      },
      summary: "Dragged to a new position",
      details: { intent: "nudge", confidence: "medium", x: "24", y: "-8" },
    };

    const session = createUIChangeSession({
      pageUrl: "https://example.com",
      viewport: { width: 1363, height: 903, devicePixelRatio: 1 },
      elements: [
        {
          target,
          changes: [
            change("p.mb-4", "width", "476.266px", "800px"),
            change("p.mb-4", "width", "800px", "700px"),
            change("p.mb-4", "width", "700px", "590px"),
            change("p.mb-4", "height", "60px", "fit-content"),
          ],
        },
      ],
      structuralEdits: [
        move,
        {
          ...move,
          id: "move-2",
          details: { intent: "nudge", confidence: "medium", x: "32", y: "-4" },
        },
      ],
      frameworkHints: ["Bootstrap"],
    });

    const prompt = summarizeSessionAsAgentPrompt(session);

    expect(prompt).toContain("Final values to apply");
    expect(prompt).toContain(
      "`width`: `476.266px` -> `590px` (final value; 3 adjustments collapsed)",
    );
    expect(prompt).toContain("width: 590px;");
    expect(prompt).not.toContain("`width`: `800px` -> `700px`");
    expect(prompt).toContain(
      'Recommended source target: visible text "At CDB, we understand that flexible financial accessibility is essential".',
    );
    expect(prompt).toContain("runtime/framework/generated classes (weak source clues): `.mb-4`");
    expect(prompt).toContain("Selector caution");
    expect(prompt).toContain("Verification selector only");
    expect(prompt).toContain("Treat drag/move records as layout observations");
    expect(prompt).toContain("Visual nudge");
    expect(prompt).toContain("confidence: medium");
    expect(prompt).toContain("2 related edits collapsed");
    expect(prompt).toContain("visual offset: x=32px, y=-4px");
    expect(prompt).toContain("do not treat it as source order/layout");
  });

  it("describes reorder and relocate structural moves as source-level intent", () => {
    const session = createUIChangeSession({
      pageUrl: "https://example.com",
      viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
      elements: [],
      structuralEdits: [
        {
          id: "move-reorder",
          kind: "move",
          timestamp: "2026-07-01T00:00:00.000Z",
          target: { tagName: "span", classList: [], selector: "#second", domPath: "#second" },
          summary: "Moved previous in the DOM",
          details: {
            intent: "reorder",
            confidence: "high",
            parentSelector: "#list",
            beforeIndex: "1",
            afterIndex: "0",
          },
        },
        {
          id: "move-relocate",
          kind: "move",
          timestamp: "2026-07-01T00:00:00.000Z",
          target: { tagName: "span", classList: [], selector: "#child", domPath: "#child" },
          summary: "Moved out-after in the DOM",
          details: {
            intent: "relocate",
            confidence: "high",
            beforeParentSelector: "#parent",
            afterParentSelector: "body",
          },
        },
      ],
    });

    const prompt = summarizeSessionAsAgentPrompt(session);

    expect(prompt).toContain("Reorder `#second` within `#list` from position 2 to 1");
    expect(prompt).toContain("Relocate `#child` from `#parent` to `body`");
    expect(prompt).toContain("confidence: high");
    expect(prompt).toContain("avoid pixel offsets");
  });

  it("avoids conflicting animation shorthand in agent prompts", () => {
    const target: ElementSnapshot = {
      ...snapshot("span.heading-4.feature-title"),
      tagName: "span",
      classList: ["heading-4", "feature-title"],
      textPreview: "Antigravity 2.0",
      attributes: { class: "heading-4 feature-title" },
    };

    const session = createUIChangeSession({
      pageUrl: "https://antigravity.google/",
      viewport: { width: 1363, height: 903, devicePixelRatio: 1 },
      elements: [
        {
          target,
          changes: [
            change(
              "span.heading-4.feature-title",
              "animation",
              "none",
              "ui-buddy-fade-in 300ms ease-out both",
            ),
            change("span.heading-4.feature-title", "animation-name", "none", "ui-buddy-slide-up"),
            change("span.heading-4.feature-title", "animation-duration", "0.3s", "150ms"),
            change(
              "span.heading-4.feature-title",
              "animation-timing-function",
              "ease-out",
              "ease-in",
            ),
          ],
        },
      ],
      frameworkHints: ["Angular"],
    });

    const prompt = summarizeSessionAsAgentPrompt(session);

    expect(prompt).toContain("Angular is in use");
    expect(prompt).not.toContain("A component framework is in use");
    expect(prompt).toContain(
      'Recommended source target: visible text "Antigravity 2.0" + stable class `.feature-title`.',
    );
    expect(prompt).toContain("unverified class clues (confirm stability in source): `.heading-4`");
    expect(prompt).not.toContain("`animation`: `none`");
    expect(prompt).not.toContain("animation: ui-buddy-fade-in");
    expect(prompt).toContain("`animation-name`: `none` -> `ui-buddy-slide-up`");
    expect(prompt).toContain("animation-name: ui-buddy-slide-up;");
    expect(prompt).toContain("animation-duration: 150ms;");
    expect(prompt).toContain("animation-timing-function: ease-in;");
    expect(prompt).toContain("Motion note: reuse existing keyframes");
    expect(prompt).toContain("prefers-reduced-motion");
  });

  it("uses project prompt context and marks unknown stack guidance as partial", () => {
    const target: ElementSnapshot = {
      ...snapshot(".u-card.tw-a1b2c3"),
      tagName: "section",
      classList: ["u-card", "tw-a1b2c3"],
      textPreview: "Internal dashboard card",
      attributes: { class: "u-card tw-a1b2c3" },
    };

    const session = createUIChangeSession({
      pageUrl: "https://example.com/internal",
      viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
      elements: [
        {
          target,
          changes: [change(".u-card.tw-a1b2c3", "background-color", "#ffffff", "#f8fafc")],
        },
      ],
      frameworkHints: ["InternalUI"],
      promptContext: {
        stackHints: [
          {
            name: "InternalUI",
            guidance: "Use the internal UI package tokens before adding raw CSS.",
            sourceModel: "internal package templates and tokenized styles",
          },
        ],
        classConventions: [
          {
            name: "InternalUI",
            stablePatterns: ["^u-[a-z0-9-]+$"],
            generatedPatterns: ["^tw-[a-f0-9]{6}$"],
            notes: ["u-* classes are source-authored; tw-* hashes are generated."],
          },
        ],
        sourceHints: ["Dashboard views live under apps/web/views."],
        designTokenHints: ["Prefer --surface-* variables for panel backgrounds."],
      },
    });

    const prompt = summarizeSessionAsAgentPrompt(session);

    expect(prompt).toContain("Detected stack: InternalUI");
    expect(prompt).toContain("Stack guidance confidence: partial");
    expect(prompt).toContain("Stack detection is partial");
    expect(prompt).toContain("Project-specific stack guidance (InternalUI)");
    expect(prompt).toContain("Project source hint: Dashboard views live under apps/web/views.");
    expect(prompt).toContain("Project design-token hint: Prefer --surface-* variables");
    expect(prompt).toContain("stable class clues: `.u-card`");
    expect(prompt).toContain(
      "runtime/framework/generated classes (weak source clues): `.tw-a1b2c3`",
    );
    expect(prompt).toContain(
      "Final style target (illustrative CSS -- translate/scope to the actual source mechanism before applying):",
    );
  });

  it("omits any shorthand when captured longhands are more specific", () => {
    const target = snapshot("#panel");
    const session = createUIChangeSession({
      pageUrl: "https://example.com",
      viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
      elements: [
        {
          target,
          changes: [
            change("#panel", "overflow", "visible", "hidden"),
            change("#panel", "overflow-x", "visible", "auto"),
          ],
        },
      ],
    });

    const prompt = summarizeSessionAsAgentPrompt(session);

    expect(prompt).toContain("Stack guidance confidence: unknown");
    expect(prompt).toContain("Stack detection is unavailable");
    expect(prompt).not.toContain("`overflow`: `visible` -> `hidden`");
    expect(prompt).not.toContain("overflow: hidden;");
    expect(prompt).toContain("`overflow-x`: `visible` -> `auto`");
    expect(prompt).toContain("overflow-x: auto;");
  });
  it("includes attribute edits in the AI agent prompt", () => {
    const edit: StructuralEdit = {
      id: "attribute-1",
      kind: "attribute",
      timestamp: "2026-07-01T00:00:00.000Z",
      target: {
        tagName: "button",
        id: "save",
        classList: ["button"],
        selector: "#save",
        domPath: "html > body > button#save",
      },
      summary: "Set aria-label",
      details: {
        name: "aria-label",
        before: "(absent)",
        after: "Save profile",
      },
    };

    const session = createUIChangeSession({
      pageUrl: "https://example.com/settings",
      viewport: { width: 1280, height: 720, devicePixelRatio: 1 },
      elements: [],
      structuralEdits: [edit],
    });

    const prompt = summarizeSessionAsAgentPrompt(session);

    expect(prompt).toContain(
      '- Add the `aria-label` attribute to `#save` with value "Save profile"',
    );
  });
});
