import { isExtensionMessage } from "@ui-devtools/shared";

import { SIDE_PANEL_PORT_NAME } from "../chrome/messaging";

import { shouldForwardToSidePanel } from "./router";

const sidePanelPorts = new Set<chrome.runtime.Port>();

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

void chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== SIDE_PANEL_PORT_NAME) {
    return;
  }

  sidePanelPorts.add(port);
  port.onDisconnect.addListener(() => sidePanelPorts.delete(port));
});

chrome.runtime.onMessage.addListener((rawMessage: unknown) => {
  if (!isExtensionMessage(rawMessage) || !shouldForwardToSidePanel(rawMessage)) {
    return false;
  }

  for (const port of sidePanelPorts) {
    port.postMessage(rawMessage);
  }

  return false;
});

export {};
