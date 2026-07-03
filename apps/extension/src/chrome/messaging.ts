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

const isBenignRuntimeError = (error: unknown): boolean => {
  const text = error instanceof Error ? error.message : String(error);
  return (
    text.includes("Extension context invalidated") ||
    text.includes("Receiving end does not exist") ||
    text.includes("message port closed") ||
    text.includes("message channel closed")
  );
};

export const sendRuntimeMessage = async (message: ExtensionMessage): Promise<void> => {
  try {
    assertOkMessageResponse(await chrome.runtime.sendMessage(message));
  } catch (error) {
    // The extension was reloaded/updated while this page kept the old content
    // script, or nothing is listening right now. Both are safe to ignore.
    if (isBenignRuntimeError(error)) {
      return;
    }

    throw error;
  }
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

  try {
    assertOkMessageResponse(await chrome.tabs.sendMessage(activeTab.id, message));
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);

    if (text.includes("Receiving end does not exist")) {
      throw new Error("ui-buddy can't reach this page. Refresh the tab to reconnect.");
    }

    throw error;
  }
};

export type BackgroundCommand = "capture-tab" | "detect-tech" | "lookup-source";

type BackgroundCommandResponse = { ok: true; data: unknown } | { ok: false; error: string };

/**
 * Ask the service worker to run a privileged command (screen capture,
 * MAIN-world page inspection) and return its result.
 */
export const callBackground = async <T>(command: BackgroundCommand): Promise<T> => {
  const response = (await chrome.runtime.sendMessage({
    __ubBackground: true,
    command,
  })) as BackgroundCommandResponse | undefined;

  if (response === undefined || response.ok !== true) {
    throw new Error(
      response !== undefined && response.ok === false
        ? response.error
        : "Background command failed.",
    );
  }

  return response.data as T;
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
