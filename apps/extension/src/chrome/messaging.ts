import { isExtensionMessage, isRecord, type ExtensionMessage } from "@ui-buddy/shared";

export const SIDE_PANEL_PORT_NAME = "ui-buddy-side-panel";

export type MessageHandler = (
  message: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
) => Promise<void> | void;

export type MessageResponse = {
  ok: boolean;
  error?: string;
};

const errorMessageFromUnknown = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown extension messaging error";

const assertOkMessageResponse = (response: unknown): void => {
  if (response === undefined) {
    return;
  }

  if (!isRecord(response) || response.ok !== false) {
    return;
  }

  throw new Error(
    typeof response.error === "string" ? response.error : "Extension command failed.",
  );
};

const canReceiveContentScriptMessages = (url: string | undefined): boolean =>
  url === undefined || url.startsWith("http://") || url.startsWith("https://");

export const sendRuntimeMessage = async (message: ExtensionMessage): Promise<void> => {
  assertOkMessageResponse(await chrome.runtime.sendMessage(message));
};

export const connectSidePanelPort = (): chrome.runtime.Port =>
  chrome.runtime.connect({ name: SIDE_PANEL_PORT_NAME });

export const sendMessageToActiveTab = async (message: ExtensionMessage): Promise<void> => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (activeTab?.id === undefined) {
    throw new Error("No active tab is available for ui-buddy messaging.");
  }

  if (!canReceiveContentScriptMessages(activeTab.url)) {
    throw new Error("ui-buddy can inspect only http and https pages.");
  }

  assertOkMessageResponse(await chrome.tabs.sendMessage(activeTab.id, message));
};

export const addRuntimeMessageListener = (handler: MessageHandler): (() => void) => {
  const listener = (
    rawMessage: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void,
  ): true | false => {
    if (!isExtensionMessage(rawMessage)) {
      return false;
    }

    Promise.resolve(handler(rawMessage, sender))
      .then(() => sendResponse({ ok: true }))
      .catch((error: unknown) =>
        sendResponse({ ok: false, error: errorMessageFromUnknown(error) }),
      );

    return true;
  };

  chrome.runtime.onMessage.addListener(listener);

  return () => chrome.runtime.onMessage.removeListener(listener);
};
