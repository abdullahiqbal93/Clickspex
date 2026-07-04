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

export type SidePanelPortConnection = {
  /** Tear down the connection and stop reconnecting. */
  disconnect: () => void;
};

/**
 * Maintain a live connection from the side panel to the service worker.
 *
 * Manifest V3 service workers are terminated after a short period of
 * inactivity. When that happens the port that delivers page events
 * (ELEMENT_SELECTED, PAGE_SCAN_RESULT, ...) to the panel is torn down, and the
 * next service-worker instance starts with an empty port registry. The result
 * is that picking an element silently stops updating the panel until it is
 * reopened. We defend against this by transparently reconnecting whenever the
 * port drops, so the panel is always ready to receive the next page event.
 */
export const createReconnectingSidePanelPort = (
  onMessage: (message: unknown) => void,
): SidePanelPortConnection => {
  let stopped = false;
  let port: chrome.runtime.Port | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  function connect(): void {
    if (stopped) {
      return;
    }

    try {
      port = chrome.runtime.connect({ name: SIDE_PANEL_PORT_NAME });
    } catch {
      // Service worker not ready yet; retry shortly.
      reconnectTimer = setTimeout(connect, 500);
      return;
    }

    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(() => {
      // Reading lastError acknowledges the expected disconnect and prevents
      // Chrome from logging an unchecked runtime error.
      void chrome.runtime.lastError;
      port = null;

      // Reconnect promptly so a fresh service worker re-registers this panel
      // before the user's next pick.
      if (!stopped) {
        reconnectTimer = setTimeout(connect, 250);
      }
    });
  }

  connect();

  return {
    disconnect: () => {
      stopped = true;

      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer);
      }

      if (port !== null) {
        try {
          port.disconnect();
        } catch {
          /* already disconnected */
        }

        port = null;
      }
    },
  };
};

const isMissingContentScript = (error: unknown): boolean => {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes("Receiving end does not exist");
};

/**
 * Ask the service worker to inject the declared content script into the active
 * tab, then give it a moment to register its message listener. Returns false if
 * injection isn't possible (restricted page, no scripting permission, etc.).
 */
const ensureContentScriptInjected = async (): Promise<boolean> => {
  try {
    await callBackground("inject-content-script");
    await new Promise((resolve) => setTimeout(resolve, 150));
    return true;
  } catch {
    return false;
  }
};

export const sendMessageToActiveTab = async (message: ExtensionMessage): Promise<void> => {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (activeTab?.id === undefined) {
    throw new Error("No active tab is available for ui-buddy messaging.");
  }

  if (!canReceiveContentScriptMessages(activeTab.url)) {
    throw new Error("ui-buddy can inspect only http and https pages.");
  }

  const tabId = activeTab.id;

  try {
    assertOkMessageResponse(await chrome.tabs.sendMessage(tabId, message));
  } catch (error) {
    if (!isMissingContentScript(error)) {
      throw error;
    }

    // The content script isn't in this tab yet - common on tabs that were
    // already open before the extension was installed/updated, or after the
    // extension reloaded. Inject it on demand and retry once so picking works
    // without the user having to reload the extension or refresh the tab.
    if (await ensureContentScriptInjected()) {
      try {
        assertOkMessageResponse(await chrome.tabs.sendMessage(tabId, message));
        return;
      } catch (retryError) {
        if (!isMissingContentScript(retryError)) {
          throw retryError;
        }
      }
    }

    throw new Error("ui-buddy can't reach this page. Refresh the tab to reconnect.");
  }
};

export type BackgroundCommand =
  "capture-tab" | "detect-tech" | "lookup-source" | "inject-content-script";

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
