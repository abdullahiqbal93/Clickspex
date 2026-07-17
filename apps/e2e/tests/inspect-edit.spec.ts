import { applyQuickStyle, computedStyle, openSidePanel, pickElement } from "../helpers/panel.js";
import { expect, test } from "../helpers/test.js";

const RED = "rgb(255, 0, 0)";
const ORIGINAL = "rgb(20, 20, 20)";

test.describe("inspect and live edit", () => {
  test("picks an element, edits its color, and undoes/redoes the change", async ({
    context,
    extensionId,
    server,
  }) => {
    const page = await context.newPage();
    await page.goto(`${server.origin}/index.html`);
    const panel = await openSidePanel(context, extensionId);

    await pickElement(panel, page, "#save");

    expect(await computedStyle(page, "#save", "color")).toBe(ORIGINAL);
    await applyQuickStyle(panel, "color", "#ff0000");
    await expect.poll(() => computedStyle(page, "#save", "color")).toBe(RED);

    await panel
      .getByTitle("Undo last change (styles, moves, deletes) - Ctrl+Z", { exact: true })
      .click();
    await expect.poll(() => computedStyle(page, "#save", "color")).toBe(ORIGINAL);

    await panel.getByTitle("Redo - Ctrl+Shift+Z", { exact: true }).click();
    await expect.poll(() => computedStyle(page, "#save", "color")).toBe(RED);
  });

  test("temporary edits survive a page reload", async ({
    context,
    extensionId,
    server,
    serviceWorker,
  }) => {
    const page = await context.newPage();
    await page.goto(`${server.origin}/index.html`);
    const panel = await openSidePanel(context, extensionId);

    await pickElement(panel, page, "#save");
    await applyQuickStyle(panel, "color", "#ff0000");
    await expect.poll(() => computedStyle(page, "#save", "color")).toBe(RED);

    // The content script persists edits (debounced) to session storage;
    // wait until the write landed before reloading.
    await expect
      .poll(() =>
        serviceWorker.evaluate(async () => {
          const stored = await chrome.storage.session.get(null);
          return Object.keys(stored).filter((key) => key.startsWith("ubEdits:")).length;
        }),
      )
      .toBeGreaterThan(0);

    await page.reload();
    await expect.poll(() => computedStyle(page, "#save", "color"), { timeout: 20_000 }).toBe(RED);
  });
});
