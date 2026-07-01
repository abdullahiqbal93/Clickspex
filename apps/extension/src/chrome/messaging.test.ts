import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addRuntimeMessageListener,
  connectSidePanelPort,
  sendMessageToActiveTab,
  sendRuntimeMessage,
  SIDE_PANEL_PORT_NAME,
  type MessageResponse,
} from "./messaging";

import type { ExtensionMessage } from "@ui-devtools/shared";

type RuntimeListener = Parameters<typeof chrome.runtime.onMessage.addListener>[0];

const pickerMessage: ExtensionMessage = { type: "PICKER_ENABLE" };

const installChromeMock = (activeTabId: number | null = 42) => {
  let listener: RuntimeListener | null = null;
  const sendMessage = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  const connect = vi.fn(() => ({ name: SIDE_PANEL_PORT_NAME }));
  const query = vi
    .fn<() => Promise<Array<{ id?: number }>>>()
    .mockResolvedValue([activeTabId === null ? {} : { id: activeTabId }]);
  const tabSendMessage = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
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

  it("sends tab messages to the active tab", async () => {
    const chromeMock = installChromeMock(99);

    await sendMessageToActiveTab(pickerMessage);

    expect(chromeMock.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(chromeMock.tabSendMessage).toHaveBeenCalledWith(99, pickerMessage);
  });

  it("throws when no active tab id is available", async () => {
    installChromeMock(null);

    await expect(sendMessageToActiveTab(pickerMessage)).rejects.toThrow("No active tab");
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
