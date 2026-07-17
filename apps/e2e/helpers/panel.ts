import { expect } from "@playwright/test";

import type { BrowserContext, Page } from "@playwright/test";

/**
 * Open the side panel page as a tab in the same window as the inspected page.
 * In production Chrome hosts sidepanel.html in the window's side panel; as a
 * tab it runs the identical code path (`chrome.tabs.query` against the
 * window's active tab) while staying reachable for automation.
 */
export const openSidePanel = async (
  context: BrowserContext,
  extensionId: string,
): Promise<Page> => {
  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await expect(panel.getByRole("button", { name: "Pick", exact: true })).toBeVisible();
  return panel;
};

/**
 * Enable the picker for the page's tab and click the target element.
 * Retries the toggle because the panel re-resolves its inspected-tab context
 * asynchronously after tab activation changes.
 */
export const pickElement = async (panel: Page, page: Page, selector: string): Promise<void> => {
  await page.bringToFront();

  await expect(async () => {
    const stopButton = panel.getByRole("button", { name: "Stop", exact: true });

    if (!(await stopButton.isVisible())) {
      await panel.getByRole("button", { name: "Pick", exact: true }).click();
      await expect(stopButton).toBeVisible({ timeout: 2000 });
    }

    await page.click(selector);
    await expect(selectorChip(panel, selector)).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
};

/** The header chip that displays the currently inspected selector. */
export const selectorChip = (panel: Page, selector: string) =>
  panel.locator("header").getByTitle(selector, { exact: true });

/** Apply a style value through the panel's Quick edit controls. */
export const applyQuickStyle = async (
  panel: Page,
  property: string,
  value: string,
): Promise<void> => {
  await panel.locator("#quick-style-property").selectOption(property);
  await panel.locator("#quick-style-value").fill(value);
};

/** Read a computed style from the live page. */
export const computedStyle = (page: Page, selector: string, property: string): Promise<string> =>
  page.evaluate(
    ([sel, prop]) => {
      const element = sel === undefined ? null : document.querySelector(sel);
      return element === null || prop === undefined
        ? ""
        : getComputedStyle(element).getPropertyValue(prop);
    },
    [selector, property],
  );
