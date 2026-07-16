import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendMessageToActiveTab } from "../../chrome/messaging";

import {
  CascadeExplorer,
  buildLiveOverrideRule,
  getRuleResponsiveTarget,
  ruleAppliesToResponsiveTarget,
  isCssDeclarationValueValid,
} from "./CascadeExplorer";

import type { MatchedStyleRule, MatchedStylesResult, StyleChange } from "@clickspex/shared";

vi.mock("../../chrome/messaging", () => ({
  sendMessageToActiveTab: vi.fn().mockResolvedValue(undefined),
}));

const mockedSendMessageToActiveTab = vi.mocked(sendMessageToActiveTab);

const rule = (conditional: string | null): MatchedStyleRule => ({
  id: conditional ?? "base",
  selector: ".card",
  specificity: [0, 1, 0],
  origin: "author",
  source: { label: "app.css", url: null },
  declarations: [],
  active: true,
  conditional,
  inheritedFrom: null,
});

describe("CascadeExplorer responsive rules", () => {
  it("classifies rules into the matching responsive workspace", () => {
    expect(getRuleResponsiveTarget(rule(null))).toBe("all");
    expect(getRuleResponsiveTarget(rule("@media (max-width: 767px)"))).toBe("mobile");
    expect(getRuleResponsiveTarget(rule("@media (min-width: 768px) and (max-width: 1023px)"))).toBe(
      "tablet",
    );
    expect(getRuleResponsiveTarget(rule("@media (min-width: 1024px)"))).toBe("desktop");
    const sharedSmallScreenRule = rule("@media (max-width: 1023px)");
    expect(ruleAppliesToResponsiveTarget(rule(null), "mobile")).toBe(true);
    expect(ruleAppliesToResponsiveTarget(sharedSmallScreenRule, "all")).toBe(false);
    expect(ruleAppliesToResponsiveTarget(sharedSmallScreenRule, "mobile")).toBe(true);
    expect(ruleAppliesToResponsiveTarget(sharedSmallScreenRule, "tablet")).toBe(true);
    expect(ruleAppliesToResponsiveTarget(sharedSmallScreenRule, "desktop")).toBe(false);
  });

  it("builds an immediate live rule only for the selected responsive target", () => {
    const changes: StyleChange[] = [
      {
        selector: "#layout",
        property: "color",
        beforeValue: "black",
        afterValue: "red",
        timestamp: "2026-07-13T00:00:00.000Z",
      },
      {
        selector: "#layout",
        property: "grid-template-columns",
        beforeValue: "none",
        afterValue: "1fr 2fr",
        timestamp: "2026-07-13T00:00:01.000Z",
        responsiveTarget: "desktop",
      },
    ];

    const desktopRule = buildLiveOverrideRule(changes, "#layout", "base", "desktop");

    expect(desktopRule?.conditional).toContain("min-width: 1024px");
    expect(desktopRule?.declarations).toEqual([
      expect.objectContaining({
        property: "grid-template-columns",
        value: "1fr 2fr",
      }),
    ]);
    expect(buildLiveOverrideRule(changes, "#layout", "base", "mobile")).toBeNull();
  });
  it("validates declarations created inside a matched rule", () => {
    expect(isCssDeclarationValueValid("grid-template-columns", "1fr 2fr")).toBe(true);
    expect(isCssDeclarationValueValid("--brand-color", "#7c3aed")).toBe(true);
    expect(isCssDeclarationValueValid("color; display", "red")).toBe(false);
    expect(isCssDeclarationValueValid("color", "")).toBe(false);
  });
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const matchedResult: MatchedStylesResult = {
  selector: ".card",
  rules: [
    {
      ...rule(null),
      declarations: [
        {
          property: "color",
          value: "rgb(15, 23, 42)",
          important: false,
          active: true,
          overridden: false,
          inherited: false,
        },
        {
          property: "opacity",
          value: "0.5",
          important: false,
          active: true,
          overridden: true,
          inherited: false,
        },
      ],
    },
  ],
  computed: { color: "rgb(15, 23, 42)", opacity: "1" },
  variables: { "--brand-color": "#7c3aed" },
  unreadableStylesheets: 0,
};

const findButton = (container: HTMLElement, label: string): HTMLButtonElement | undefined =>
  Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(label),
  );

const setInputValue = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

describe("CascadeExplorer interactions", () => {
  let container: HTMLDivElement;
  let reactRoot: Root;
  type CommitHandler = (property: string, value: string) => Promise<void>;
  let onCommit: ReturnType<typeof vi.fn<CommitHandler>>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    reactRoot = createRoot(container);
    mockedSendMessageToActiveTab.mockClear();
    onCommit = vi.fn<CommitHandler>().mockResolvedValue(undefined);

    act(() => {
      reactRoot.render(
        createElement(CascadeExplorer, {
          changes: [],
          result: matchedResult,
          responsiveTarget: "all",
          selectedSelector: ".card",
          scopeLabel: "This element / base / All",
          targetState: "base",
          onCommit,
          onPickProperty: vi.fn(),
        }),
      );
    });
  });

  afterEach(() => {
    act(() => reactRoot.unmount());
    container.remove();
  });

  it("opens an empty searchable declaration composer and applies the entered style", async () => {
    expect(container.querySelector('input[aria-label="CSS property to add"]')).toBeNull();

    const newStyleButton = findButton(container, "New style");
    expect(newStyleButton).toBeDefined();
    act(() => newStyleButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const propertyInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="CSS property to add"]',
    );
    const valueInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="New CSS value"]',
    );
    expect(propertyInput?.value).toBe("");
    expect(propertyInput?.placeholder).toBe("Search property...");
    expect(valueInput).not.toBeNull();

    if (propertyInput !== null && valueInput !== null) {
      setInputValue(propertyInput, "grid-template-columns");
      setInputValue(valueInput, "1fr 2fr");
    }

    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(onCommit).toHaveBeenCalledWith("grid-template-columns", "1fr 2fr");
    expect(container.querySelector('input[aria-label="CSS property to add"]')).toBeNull();
  });

  it("can focus the cascade on winning declarations", () => {
    expect(container.querySelector('input[aria-label="Rename opacity from .card"]')).not.toBeNull();
    const overriddenButton = findButton(container, "Overridden shown");
    expect(overriddenButton).toBeDefined();

    act(() => overriddenButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(container.querySelector('input[aria-label="Rename opacity from .card"]')).toBeNull();
    expect(container.textContent).toContain("Winners only");
  });

  it("collapses noisy rules while preserving a useful declaration summary", () => {
    const collapseButton = container.querySelector<HTMLButtonElement>(
      'button[aria-expanded="true"]',
    );
    expect(collapseButton).not.toBeNull();

    act(() => collapseButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(container.textContent).toContain("2 declarations / 1 winning");
  });

  it("renames an authored declaration property", async () => {
    const propertyInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="Rename color from .card"]',
    );
    expect(propertyInput).not.toBeNull();

    act(() => propertyInput?.focus());
    if (propertyInput !== null) {
      setInputValue(propertyInput, "background-color");
    }
    await act(async () => {
      propertyInput?.blur();
      await Promise.resolve();
    });

    expect(mockedSendMessageToActiveTab).toHaveBeenCalledWith({
      type: "MUTATE_MATCHED_STYLE_DECLARATION",
      payload: {
        ruleId: "base",
        inheritedSelector: null,
        property: "color",
        nextProperty: "background-color",
      },
    });
  });

  it("removes an authored declaration from its source rule", async () => {
    const removeButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove color from .card"]',
    );
    expect(removeButton).not.toBeNull();

    await act(async () => {
      removeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(mockedSendMessageToActiveTab).toHaveBeenCalledWith({
      type: "MUTATE_MATCHED_STYLE_DECLARATION",
      payload: {
        ruleId: "base",
        inheritedSelector: null,
        property: "color",
        nextProperty: null,
      },
    });
  });
});
