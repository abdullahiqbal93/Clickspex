import { isExtensionMessage } from "@ui-buddy/shared";

import { SIDE_PANEL_PORT_NAME } from "../chrome/messaging";

import { shouldForwardToSidePanel } from "./router";

import type { ComponentSourceInfo, PageTechInfo } from "@ui-buddy/shared";

const sidePanelPorts = new Set<chrome.runtime.Port>();

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

void chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_AND_UNTRUSTED_CONTEXTS" });

/**
 * When the side panel closes we tell the page's content script to stop the
 * picker and drop any selection. Otherwise the page would keep its hover/select
 * overlay live and remain clickable even though the panel is gone — the user has
 * to press "Pick" again to start a new selection.
 */
const notifyPanelClosed = (): void => {
  void chrome.tabs
    .query({ active: true, currentWindow: true })
    .then(([tab]) => {
      if (tab?.id === undefined) {
        return;
      }

      const url = tab.url ?? "";

      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return;
      }

      void chrome.tabs.sendMessage(tab.id, { type: "PICKER_DISABLE" }).catch(() => {
        // The tab has no content script (navigated away / restricted page).
      });
    })
    .catch(() => {
      /* no active tab */
    });
};

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== SIDE_PANEL_PORT_NAME) {
    return;
  }

  sidePanelPorts.add(port);
  port.onDisconnect.addListener(() => {
    sidePanelPorts.delete(port);

    // Only react to the *last* side-panel context going away.
    if (sidePanelPorts.size === 0) {
      notifyPanelClosed();
    }
  });
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

// ── Privileged background commands (screenshot, MAIN-world inspection) ──

type BackgroundCommandMessage = {
  __ubBackground: true;
  command: string;
};

const isBackgroundCommand = (value: unknown): value is BackgroundCommandMessage =>
  typeof value === "object" &&
  value !== null &&
  (value as Record<string, unknown>).__ubBackground === true &&
  typeof (value as Record<string, unknown>).command === "string";

/**
 * Runs in the page's MAIN world: detect frameworks and libraries from global
 * variables and DOM markers. Must stay self-contained (it is serialized).
 */
const detectTechInPage = (): PageTechInfo[] => {
  const tech: PageTechInfo[] = [];
  const pageWindow = window as unknown as Record<string, unknown>;
  const add = (name: string, category: PageTechInfo["category"], evidence: string): void => {
    if (!tech.some((entry) => entry.name === name)) {
      tech.push({ name, category, evidence });
    }
  };

  try {
    const hook = pageWindow.__REACT_DEVTOOLS_GLOBAL_HOOK__ as
      { renderers?: Map<unknown, unknown> } | undefined;

    if (hook?.renderers !== undefined && hook.renderers.size > 0) {
      add("React", "framework", "React DevTools hook has active renderers");
    } else {
      const probe = document.querySelector("#root, [data-reactroot]");

      if (probe !== null && Object.keys(probe).some((key) => key.startsWith("__react"))) {
        add("React", "framework", "React fiber container found");
      }
    }
  } catch {
    /* detection only */
  }

  if (pageWindow.__NEXT_DATA__ !== undefined || document.querySelector("#__next") !== null) {
    add("Next.js", "framework", "__NEXT_DATA__ or #__next container");
  }

  if (pageWindow.__NUXT__ !== undefined || document.querySelector("#__nuxt") !== null) {
    add("Nuxt", "framework", "__NUXT__ state or #__nuxt container");
  }

  if (
    pageWindow.__VUE__ !== undefined ||
    document.querySelector("[data-v-app]") !== null ||
    document.querySelector("[data-server-rendered]") !== null
  ) {
    add("Vue", "framework", "Vue globals or data-v attributes");
  }

  const ngVersion = document.querySelector("[ng-version]");

  if (ngVersion !== null) {
    add("Angular", "framework", `ng-version ${ngVersion.getAttribute("ng-version") ?? ""}`);
  }

  if (pageWindow.__svelte !== undefined || document.querySelector('[class*="svelte-"]') !== null) {
    add("Svelte", "framework", "Svelte globals or scoped classes");
  }

  const jQuery = pageWindow.jQuery as { fn?: { jquery?: string } } | undefined;

  if (jQuery?.fn?.jquery !== undefined) {
    add("jQuery", "library", `window.jQuery ${jQuery.fn.jquery}`);
  }

  try {
    for (const sheet of Array.from(document.styleSheets).slice(0, 30)) {
      let cssText = "";

      try {
        cssText = Array.from(sheet.cssRules ?? [])
          .slice(0, 50)
          .map((rule) => rule.cssText)
          .join(" ");
      } catch {
        continue; // cross-origin stylesheet
      }

      if (cssText.includes("--tw-")) {
        add("Tailwind CSS", "styling", "--tw-* custom properties in stylesheet");
        break;
      }
    }
  } catch {
    /* detection only */
  }

  if (
    pageWindow.bootstrap !== undefined ||
    document.querySelector('link[href*="bootstrap"]') !== null
  ) {
    add("Bootstrap", "styling", "bootstrap global or stylesheet link");
  }

  const generator = document.querySelector('meta[name="generator"]');
  const generatorContent = generator?.getAttribute("content") ?? "";

  if (
    generatorContent.toLowerCase().includes("wordpress") ||
    document.querySelector('link[href*="/wp-content/"], script[src*="/wp-content/"]') !== null
  ) {
    add("WordPress", "platform", generatorContent || "wp-content assets");
  } else if (generatorContent.length > 0) {
    add(generatorContent, "platform", "meta generator tag");
  }

  if ((pageWindow.Shopify as Record<string, unknown> | undefined) !== undefined) {
    add("Shopify", "platform", "window.Shopify");
  }

  if (pageWindow.dataLayer !== undefined || pageWindow.gtag !== undefined) {
    add("Google Analytics / GTM", "analytics", "dataLayer or gtag global");
  }

  // ── Server-side stacks ──
  const cookies = document.cookie;
  const hasCsrfMeta = document.querySelector('meta[name="csrf-token"]') !== null;
  const hasXsrfCookie = cookies.includes("XSRF-TOKEN=");
  const hasLaravelSession = cookies.includes("laravel_session=");

  if (hasLaravelSession || (hasCsrfMeta && hasXsrfCookie)) {
    add(
      "Laravel",
      "framework",
      hasLaravelSession ? "laravel_session cookie" : "csrf-token meta + XSRF-TOKEN cookie",
    );
  }

  if (pageWindow.Livewire !== undefined || document.querySelector("[wire\\:id]") !== null) {
    add("Livewire", "library", "Livewire global or wire:id attributes");
  }

  if (document.querySelector("#app[data-page]") !== null) {
    add("Inertia.js", "library", "#app[data-page] payload");
  }

  if (pageWindow.Alpine !== undefined || document.querySelector("[x-data]") !== null) {
    add("Alpine.js", "library", "Alpine global or x-data attributes");
  }

  if (cookies.includes("PHPSESSID=")) {
    add("PHP", "platform", "PHPSESSID cookie");
  }

  if (document.querySelector('script[src*="/@vite/client"]') !== null) {
    add("Vite (dev server)", "library", "@vite/client script");
  }

  return tech;
};

/**
 * Runs in the page's MAIN world: resolve the component source of the element
 * marked with data-ub-source-target (React _debugSource, Vue __file).
 * Must stay self-contained (it is serialized).
 */
const lookupSourceInPage = (): ComponentSourceInfo | null => {
  const element = document.querySelector("[data-ub-source-target]");

  if (element === null) {
    return null;
  }

  element.removeAttribute("data-ub-source-target");

  let result: ComponentSourceInfo | null = null;
  const record = element as unknown as Record<string, unknown>;
  const fiberKey = Object.keys(record).find(
    (key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"),
  );

  if (fiberKey !== undefined) {
    type Fiber = {
      _debugSource?: { fileName?: string; lineNumber?: number; columnNumber?: number };
      _debugOwner?: Fiber | null;
      return?: Fiber | null;
      type?: unknown;
    };

    let fiber = record[fiberKey] as Fiber | null | undefined;
    let depth = 0;

    while (fiber !== null && fiber !== undefined && depth < 50) {
      const fiberType = fiber.type as
        { displayName?: string; name?: string } | string | null | undefined;
      const componentName =
        typeof fiberType === "function" || (typeof fiberType === "object" && fiberType !== null)
          ? ((fiberType as { displayName?: string; name?: string }).displayName ??
            (fiberType as { displayName?: string; name?: string }).name ??
            null)
          : null;
      const source = fiber._debugSource;

      if (source?.fileName !== undefined) {
        return {
          file: source.fileName,
          line: source.lineNumber ?? 1,
          column: source.columnNumber ?? 1,
          componentName,
        };
      }

      if (result === null && componentName !== null && componentName.length > 0) {
        result = { file: null, line: null, column: null, componentName };
      }

      fiber = fiber._debugOwner ?? fiber.return;
      depth += 1;
    }
  }

  const vueInstance = record.__vueParentComponent as
    { type?: { __file?: string; name?: string } } | undefined;

  if (result === null && vueInstance?.type !== undefined) {
    result = {
      file: vueInstance.type.__file ?? null,
      line: null,
      column: null,
      componentName: vueInstance.type.name ?? null,
    };
  }

  return result;
};

const activeTabId = async (): Promise<number> => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (tab?.id === undefined) {
    throw new Error("No active tab is available.");
  }

  return tab.id;
};

const handleBackgroundCommand = async (
  command: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> => {
  try {
    if (command === "inject-content-script") {
      // Inject the manifest's declared content script into tabs that were
      // already open when the extension was installed/updated (where the
      // content script never ran). Uses the hashed filenames from the manifest
      // so it stays correct across builds.
      const tabId = await activeTabId();
      const files = (chrome.runtime.getManifest().content_scripts ?? []).flatMap(
        (entry) => entry.js ?? [],
      );

      if (files.length > 0) {
        await chrome.scripting.executeScript({ target: { tabId }, files });
      }

      return { ok: true };
    }

    if (command === "capture-tab") {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const dataUrl =
        tab?.windowId === undefined
          ? await chrome.tabs.captureVisibleTab({ format: "png" })
          : await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      return { ok: true, data: dataUrl };
    }

    if (command === "detect-tech") {
      const [execution] = await chrome.scripting.executeScript({
        target: { tabId: await activeTabId() },
        world: "MAIN",
        func: detectTechInPage,
      });
      return { ok: true, data: execution?.result ?? [] };
    }

    if (command === "lookup-source") {
      const [execution] = await chrome.scripting.executeScript({
        target: { tabId: await activeTabId() },
        world: "MAIN",
        func: lookupSourceInPage,
      });
      return { ok: true, data: execution?.result ?? null };
    }

    return { ok: false, error: `Unknown background command: ${command}` };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Background command failed.",
    };
  }
};

chrome.runtime.onMessage.addListener(
  (rawMessage: unknown, _sender, sendResponse: (response: unknown) => void) => {
    if (!isBackgroundCommand(rawMessage)) {
      return false;
    }

    void handleBackgroundCommand(rawMessage.command).then(sendResponse);
    return true;
  },
);

export {};
