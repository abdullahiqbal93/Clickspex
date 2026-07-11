import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendMessageToActiveTab } from "../../chrome/messaging";
import { usePanelStore } from "../store";

import { DomTreePanel, flattenVisibleDomNodes } from "./DomTreePanel";

import type { DomTreeNode } from "@ui-buddy/shared";

vi.mock("../../chrome/messaging", () => ({
  sendMessageToActiveTab: vi.fn().mockResolvedValue(undefined),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockedSendMessageToActiveTab = vi.mocked(sendMessageToActiveTab);
let container: HTMLDivElement;
let reactRoot: Root;

const node = (selector: string, childCount = 0): DomTreeNode => ({
  selector,
  domPath: selector,
  tagName: selector === "html" || selector === "body" ? selector : "div",
  id: selector.startsWith("#") ? selector.slice(1) : "",
  classList: [],
  attributes: {},
  textPreview: "",
  childCount,
  visible: true,
});

describe("DOM tree navigation", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    reactRoot = createRoot(container);
    mockedSendMessageToActiveTab.mockClear();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    act(() => reactRoot.unmount());
    container.remove();
    vi.useRealTimers();
    usePanelStore.getState().setDomContext(null);
  });

  it("flattens only expanded branches and preserves parent relationships", () => {
    const root = node("html", 1);
    const body = node("body", 1);
    const selected = node("#save");

    expect(
      flattenVisibleDomNodes(root, new Set(), {
        html: [body],
        body: [selected],
      }).map((entry) => entry.node.selector),
    ).toEqual(["html"]);

    expect(
      flattenVisibleDomNodes(root, new Set(["html", "body"]), {
        html: [body],
        body: [selected],
      }),
    ).toEqual([
      { node: root, depth: 0, parentSelector: null },
      { node: body, depth: 1, parentSelector: "html" },
      { node: selected, depth: 2, parentSelector: "body" },
    ]);
  });

  it("rehydrates expanded branches after a live context refresh clears their cache", async () => {
    const html = node("html", 1);
    const body = node("body");

    act(() => {
      usePanelStore.getState().setDomContext({
        ancestry: [html],
        children: [],
        childrenBySelector: {},
        selectedSelector: "html",
      });
      reactRoot.render(createElement(DomTreePanel, { selectedDomPath: "html" }));
    });
    await act(async () => Promise.resolve());

    expect(
      mockedSendMessageToActiveTab.mock.calls.filter(
        ([message]) => message.type === "DOM_CHILDREN_REQUEST",
      ),
    ).toHaveLength(1);

    act(() => usePanelStore.getState().setDomChildren("html", [body]));
    expect(container.textContent).toContain("<body>");

    act(() =>
      usePanelStore.getState().setDomContext({
        ancestry: [html],
        children: [],
        childrenBySelector: {},
        selectedSelector: "html",
      }),
    );
    await act(async () => Promise.resolve());

    expect(
      mockedSendMessageToActiveTab.mock.calls.filter(
        ([message]) => message.type === "DOM_CHILDREN_REQUEST",
      ),
    ).toHaveLength(2);
    expect(container.textContent).toContain("Loading child nodes");
  });
  it("times out stalled child requests, retries, and clears loading on response", async () => {
    vi.useFakeTimers();
    const html = node("html", 1);
    const body = node("body");

    act(() => {
      usePanelStore.getState().setDomContext({
        ancestry: [html],
        children: [],
        childrenBySelector: {},
        selectedSelector: "html",
      });
      reactRoot.render(createElement(DomTreePanel, { selectedDomPath: "html" }));
    });
    await act(async () => Promise.resolve());

    expect(container.textContent).toContain("Loading child nodes");
    expect(
      mockedSendMessageToActiveTab.mock.calls.filter(
        ([message]) => message.type === "DOM_CHILDREN_REQUEST",
      ),
    ).toHaveLength(1);

    await act(async () => vi.advanceTimersByTimeAsync(3000));

    expect(container.textContent).toContain("Retry loading children");

    const retry = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent.includes("Retry loading children"),
    );
    expect(retry).toBeDefined();

    act(() => retry?.click());
    expect(
      mockedSendMessageToActiveTab.mock.calls.filter(
        ([message]) => message.type === "DOM_CHILDREN_REQUEST",
      ),
    ).toHaveLength(2);

    act(() => usePanelStore.getState().setDomChildren("html", [body]));

    expect(container.textContent).not.toContain("Loading child nodes");
    expect(container.textContent).not.toContain("Retry loading children");
    expect(container.textContent).toContain("<body>");
  });
});
