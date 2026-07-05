import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CommitInput } from "./CommitInput";

type SimulateChangeData = Parameters<typeof Simulate.change>[1];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const renderInput = (value: string, onCommit: (value: string) => void) => {
  act(() => {
    root.render(<CommitInput aria-label="size" onCommit={onCommit} value={value} />);
  });

  return container.querySelector("input")!;
};

describe("CommitInput", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("previews changes immediately while typing", () => {
    const onCommit = vi.fn();
    const input = renderInput("10px", onCommit);

    act(() => {
      Simulate.change(input, { target: { value: "12px" } } as unknown as SimulateChangeData);
    });

    expect(input.value).toBe("12px");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenLastCalledWith("12px");
  });

  it("does not require blur or Enter to apply the changed value", () => {
    const onCommit = vi.fn();
    const input = renderInput("10px", onCommit);

    act(() => {
      Simulate.change(input, { target: { value: "12px" } } as unknown as SimulateChangeData);
      Simulate.blur(input);
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenLastCalledWith("12px");
  });

  it("restores the focus baseline on Escape after a live preview", () => {
    const onCommit = vi.fn();
    const input = renderInput("10px", onCommit);

    act(() => {
      Simulate.focus(input);
      Simulate.change(input, { target: { value: "12px" } } as unknown as SimulateChangeData);
      Simulate.keyDown(input, { key: "Escape" });
    });

    expect(input.value).toBe("10px");
    expect(onCommit).toHaveBeenNthCalledWith(1, "12px");
    expect(onCommit).toHaveBeenNthCalledWith(2, "10px");
  });
});
