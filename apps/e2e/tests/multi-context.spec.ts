import {
  applyQuickStyle,
  computedStyle,
  openSidePanel,
  pickElement,
  selectorChip,
} from "../helpers/panel.js";
import { expect, test } from "../helpers/test.js";

import type { Page } from "@playwright/test";

const injectedStyles = (page: Page): Promise<string> =>
  page.evaluate(() => document.getElementById("__clickspex-styles__")?.textContent ?? "");

test.describe("multi-tab and multi-window inspection", () => {
  test("isolates picker state and injected styles across tabs", async ({
    context,
    extensionId,
    server,
  }) => {
    const pageA = await context.newPage();
    await pageA.goto(`${server.origin}/index.html`);
    const panel = await openSidePanel(context, extensionId);

    await pickElement(panel, pageA, "#save");
    await applyQuickStyle(panel, "color", "#ff0000");
    await expect.poll(() => computedStyle(pageA, "#save", "color")).toBe("rgb(255, 0, 0)");

    const pageB = await context.newPage();
    await pageB.goto(`${server.origin}/two.html`);

    await pickElement(panel, pageB, "#second-target");
    await applyQuickStyle(panel, "color", "#0000ff");
    await expect.poll(() => computedStyle(pageB, "#second-target", "color")).toBe("rgb(0, 0, 255)");

    // Tab B's edit stays in tab B.
    expect(await injectedStyles(pageB)).not.toContain("#save");

    // Tab A keeps its own edit and never receives tab B's.
    await pageA.bringToFront();
    await expect.poll(() => computedStyle(pageA, "#save", "color")).toBe("rgb(255, 0, 0)");
    expect(await injectedStyles(pageA)).not.toContain("#second-target");
  });

  test("scopes inspection to each window's own side panel", async ({
    context,
    extensionId,
    server,
    serviceWorker,
  }) => {
    const pageA = await context.newPage();
    await pageA.goto(`${server.origin}/index.html`);
    const panelA = await openSidePanel(context, extensionId);
    await pickElement(panelA, pageA, "#save");

    const fixtureUrl = `${server.origin}/two.html`;
    const panelUrl = `chrome-extension://${extensionId}/sidepanel.html`;

    // Open a second browser window holding its own fixture tab and panel tab.
    await serviceWorker.evaluate(
      async ([fixture, panelPath]) => {
        const created = await chrome.windows.create({ url: [fixture, panelPath] });
        const fixtureTabId = created?.tabs?.[0]?.id;

        if (fixtureTabId !== undefined) {
          await chrome.tabs.update(fixtureTabId, { active: true });
        }
      },
      [fixtureUrl, panelUrl] as const,
    );

    const waitForPage = async (url: string, exclude: readonly Page[]): Promise<Page> => {
      await expect
        .poll(() => context.pages().some((page) => page.url() === url && !exclude.includes(page)))
        .toBe(true);
      const page = context
        .pages()
        .find((candidate) => candidate.url() === url && !exclude.includes(candidate));

      if (page === undefined) {
        throw new Error(`Expected a page at ${url}`);
      }

      return page;
    };

    const pageB = await waitForPage(fixtureUrl, [pageA]);
    const panelB = await waitForPage(panelUrl, [panelA]);
    await expect(panelB.getByRole("button", { name: "Pick", exact: true })).toBeVisible();

    await pickElement(panelB, pageB, "#second-target");

    // The second window's panel sees its own element...
    await expect(selectorChip(panelB, "#second-target")).toBeVisible();
    // ...and the first window's panel never adopts it.
    await expect(selectorChip(panelA, "#second-target")).not.toBeVisible();
  });
});
