import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addRuntimeMessageListener,
  connectSidePanelPort,
  sendMessageToActiveTab,
  sendRuntimeMessage,
  SIDE_PANEL_PORT_NAME,
  type MessageResponse,
} from "./messaging";

import type { ExtensionMessage } from "@ui-buddy/shared";

type RuntimeListener = Parameters<typeof chrome.runtime.onMessage.addListener>[0];
type MockTab = { id?: number; url?: string };

const pickerMessage: ExtensionMessage = { type: "PICKER_ENABLE" };

const installChromeMock = (activeTab: MockTab | null = { id: 42, url: "https://example.test" }) => {
  let listener: RuntimeListener | null = null;
  const sendMessage = vi
    .fn<() => Promise<MessageResponse | undefined>>()
    .mockResolvedValue({ ok: true });
  const connect = vi.fn(() => ({ name: SIDE_PANEL_PORT_NAME }));
  const query = vi.fn<() => Promise<MockTab[]>>().mockResolvedValue([activeTab ?? {}]);
  const tabSendMessage = vi
    .fn<() => Promise<MessageResponse | undefined>>()
    .mockResolvedValue({ ok: true });
  const addListener = vi.fn((callback: RuntimeListener) => {
    listener = callback;
  });
  const removeListener = vi.fn((callback: RuntimeListener) => {
    if (listener === callback) {
      listener = null;
    }
  });

  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage,
      connect,
      onMessage: { addListener, removeListener },
    },
    tabs: {
      query,
      sendMessage: tabSendMessage,
    },
  });

  return {
    get listener() {
      return listener;
    },
    sendMessage,
    connect,
    query,
    tabSendMessage,
    addListener,
    removeListener,
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Chrome messaging helpers", () => {
  it("sends runtime messages and connects the named side-panel port", async () => {
    const chromeMock = installChromeMock();

    await sendRuntimeMessage(pickerMessage);
    const port = connectSidePanelPort();

    expect(chromeMock.sendMessage).toHaveBeenCalledWith(pickerMessage);
    expect(chromeMock.connect).toHaveBeenCalledWith({ name: SIDE_PANEL_PORT_NAME });
    expect(port).toEqual({ name: SIDE_PANEL_PORT_NAME });
  });

  it("throws when a runtime command returns an error response", async () => {
    const chromeMock = installChromeMock();
    chromeMock.sendMessage.mockResolvedValueOnce({ ok: false, error: "boom" });

    await expect(sendRuntimeMessage(pickerMessage)).rejects.toThrow("boom");
  });

  it("sends tab messages to the active tab", async () => {
    const chromeMock = installChromeMock({ id: 99, url: "https://example.test" });

    await sendMessageToActiveTab(pickerMessage);

    expect(chromeMock.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(chromeMock.tabSendMessage).toHaveBeenCalledWith(99, pickerMessage);
  });

  it("throws when no active tab id is available", async () => {
    installChromeMock(null);

    await expect(sendMessageToActiveTab(pickerMessage)).rejects.toThrow("No active tab");
  });

  it("throws before messaging unsupported browser pages", async () => {
    installChromeMock({ id: 7, url: "chrome://extensions" });

    await expect(sendMessageToActiveTab(pickerMessage)).rejects.toThrow("http and https");
  });

  it("throws when a tab command returns an error response", async () => {
    const chromeMock = installChromeMock({ id: 99, url: "https://example.test" });
    chromeMock.tabSendMessage.mockResolvedValueOnce({ ok: false, error: "content failed" });

    await expect(sendMessageToActiveTab(pickerMessage)).rejects.toThrow("content failed");
  });

  it("injects the content script and retries when the receiving end is missing", async () => {
    const chromeMock = installChromeMock({ id: 5, url: "https://example.test" });
    chromeMock.tabSendMessage
      .mockRejectedValueOnce(new Error("Could not establish connection. Receiving end does not exist."))
      .mockResolvedValueOnce({ ok: true });
    // runtime.sendMessage backs the inject-content-script background command.
    chromeMock.sendMessage.mockResolvedValue({ ok: true });

    await sendMessageToActiveTab(pickerMessage);

    expect(chromeMock.sendMessage).toHaveBeenCalledWith({
      __ubBackground: true,
      command: "inject-content-script",
    });
    expect(chromeMock.tabSendMessage).toHaveBeenCalledTimes(2);
  });

  it("asks the user to refresh when injection does not recover the content script", async () => {
    const chromeMock = installChromeMock({ id: 5, url: "https://example.test" });
    chromeMock.tabSendMessage.mockRejectedValue(new Error("Receiving end does not exist"));
    chromeMock.sendMessage.mockResolvedValue({ ok: true });

    await expect(sendMessageToActiveTab(pickerMessage)).rejects.toThrow("Refresh the tab");
  });

  it("wraps valid runtime messages with ok/error responses and removes listeners", async () => {
    const chromeMock = installChromeMock();
    const handler = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const remove = addRuntimeMessageListener(handler);
    const sendResponse = vi.fn<(response: MessageResponse) => void>();

    const didRespondAsync = chromeMock.listener?.(pickerMessage, {}, sendResponse);
    await Promise.resolve();

    expect(didRespondAsync).toBe(true);
    expect(handler).toHaveBeenCalledWith(pickerMessage, {});
    expect(sendResponse).toHaveBeenCalledWith({ ok: true });

    remove();

    expect(chromeMock.removeListener).toHaveBeenCalled();
  });

  it("ignores invalid runtime messages", () => {
    const chromeMock = installChromeMock();
    const handler = vi.fn();
    addRuntimeMessageListener(handler);
    const sendResponse = vi.fn<(response: MessageResponse) => void>();

    const didRespondAsync = chromeMock.listener?.({ type: "UNKNOWN" }, {}, sendResponse);

    expect(didRespondAsync).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(sendResponse).not.toHaveBeenCalled();
  });
});
