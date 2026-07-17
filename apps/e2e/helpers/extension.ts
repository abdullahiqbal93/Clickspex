import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { test as base, chromium, expect } from "@playwright/test";

import type { BrowserContext, Worker } from "@playwright/test";

const extensionDistPath = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../extension/dist",
);

type ExtensionFixtures = {
  context: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
};

/**
 * Playwright test base that loads the built Clickspex extension into a real
 * Chromium instance. MV3 extensions require a persistent context; the
 * `chromium` channel supports them in the new headless mode.
 */
export const test = base.extend<ExtensionFixtures>({
  context: async ({}, use) => {
    const userDataDir = await mkdtemp(join(tmpdir(), "clickspex-e2e-profile-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      args: [
        `--disable-extensions-except=${extensionDistPath}`,
        `--load-extension=${extensionDistPath}`,
      ],
    });

    await use(context);

    await context.close();
    await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
  },
  serviceWorker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    await use(worker);
  },
  extensionId: async ({ serviceWorker }, use) => {
    await use(new URL(serviceWorker.url()).host);
  },
});

export { expect };
