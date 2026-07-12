import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RawCssRuleEditor } from "./RawCssRuleEditor";

type SimulateChangeData = Parameters<typeof Simulate.change>[1];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const renderEditor = (css: string, onChange = vi.fn()) => {
  act(() => {
    root.render(
      createElement(RawCssRuleEditor, {
        applied: false,
        css,
        getValueSuggestions: (property) => (property === "display" ? ["block", "flex"] : []),
        onChange,
        onClear: vi.fn(),
        selector: "#save",
      }),
    );
  });
  return onChange;
};

describe("RawCssRuleEditor", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("applies property and value edits immediately and adds a row with Enter", () => {
    const onChange = renderEditor("");
    const property = container.querySelector<HTMLInputElement>('[aria-label="CSS property"]')!;
    const value = container.querySelector<HTMLInputElement>('[aria-label="CSS value"]')!;

    act(() => {
      Simulate.change(property, {
        target: { value: "display" },
      } as unknown as SimulateChangeData);
    });
    act(() => {
      Simulate.change(value, {
        target: { value: "flex" },
      } as unknown as SimulateChangeData);
    });

    expect(onChange).toHaveBeenLastCalledWith("display: flex;");
    expect(
      Array.from(container.querySelectorAll("option")).some((option) => option.value === "flex"),
    ).toBe(true);

    act(() => Simulate.keyDown(value, { key: "Enter" }));
    expect(container.querySelectorAll('[aria-label="CSS property"]')).toHaveLength(2);
  });

  it("keeps disabled declarations in the draft while removing them from live CSS", () => {
    const onChange = renderEditor("color: red;\ndisplay: block;");
    const toggle = container.querySelector<HTMLInputElement>('[aria-label="Toggle display"]')!;

    act(() => {
      Simulate.change(toggle, { target: { checked: false } } as unknown as SimulateChangeData);
    });

    expect(onChange).toHaveBeenLastCalledWith("color: red;\n/* display: block; */");
    expect(container.textContent).toContain("2 declarations");
  });
});
