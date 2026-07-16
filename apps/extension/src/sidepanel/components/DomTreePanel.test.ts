import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendMessageToActiveTab } from "../../chrome/messaging";
import { usePanelStore } from "../store";

import { DomTreePanel, flattenVisibleDomNodes } from "./DomTreePanel";

import type { DomTreeNode } from "@clickspex/shared";

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
        ancestry: [{ ...html, attributes: { lang: "en" } }],
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

  it("searches the page DOM after a short debounce", async () => {
    vi.useFakeTimers();
    const html = node("html");

    act(() => {
      usePanelStore.getState().setDomContext({
        ancestry: [html],
        children: [],
        childrenBySelector: { html: [] },
        selectedSelector: "html",
      });
      reactRoot.render(createElement(DomTreePanel, { selectedDomPath: "html" }));
    });
    await act(async () => Promise.resolve());

    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Search DOM elements"]',
    );
    expect(input).not.toBeNull();

    act(() => {
      if (input !== null) {
        const valueSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        valueSetter?.call(input, "button.primary");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });

    await act(async () => vi.advanceTimersByTimeAsync(179));
    expect(
      mockedSendMessageToActiveTab.mock.calls.some(
        ([message]) => message.type === "SEARCH_ELEMENTS",
      ),
    ).toBe(false);

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(mockedSendMessageToActiveTab).toHaveBeenCalledWith({
      type: "SEARCH_ELEMENTS",
      payload: { query: "button.primary" },
    });
  });

  it("keeps the tree stable while a new selection context is loading", async () => {
    const html = node("html", 1);
    const body = node("body");

    act(() => {
      usePanelStore.getState().setDomContext({
        ancestry: [html],
        children: [body],
        childrenBySelector: { html: [body] },
        selectedSelector: "html",
      });
      reactRoot.render(createElement(DomTreePanel, { selectedDomPath: "html" }));
    });
    await act(async () => Promise.resolve());

    act(() => {
      reactRoot.render(createElement(DomTreePanel, { selectedDomPath: "body" }));
    });

    expect(container.textContent).toContain("<html");
    expect(container.textContent).toContain("Syncing");
    expect(container.textContent).not.toContain("Reading the live document tree");
  });

  it("never uses page-level scrollIntoView during live selection updates", async () => {
    const html = node("html", 1);
    const body = node("body");
    const pageScroll = vi.mocked(HTMLElement.prototype.scrollIntoView);

    act(() => {
      usePanelStore.getState().setDomContext({
        ancestry: [html],
        children: [body],
        childrenBySelector: { html: [body] },
        selectedSelector: "html",
      });
      reactRoot.render(createElement(DomTreePanel, { selectedDomPath: "html" }));
    });

    act(() => {
      usePanelStore.getState().setDomContext({
        ancestry: [html, body],
        children: [],
        childrenBySelector: { html: [body], body: [] },
        selectedSelector: "body",
      });
      reactRoot.render(createElement(DomTreePanel, { selectedDomPath: "body" }));
    });
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 20)));

    expect(pageScroll).not.toHaveBeenCalled();
  });
});
