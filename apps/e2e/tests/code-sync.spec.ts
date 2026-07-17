import { readFile } from "node:fs/promises";

import { startBridgeProcess } from "../helpers/bridge.js";
import { applyQuickStyle, computedStyle, openSidePanel, pickElement } from "../helpers/panel.js";
import { expect, test } from "../helpers/test.js";

test.describe("code sync bridge", () => {
  test("previews, applies, and rolls back a source change end to end", async ({
    context,
    extensionId,
    server,
    project,
  }) => {
    const originalStyles = await readFile(project.stylesPath, "utf8");
    const bridge = await startBridgeProcess({ projectPath: project.rootPath, enableWrites: true });

    try {
      const page = await context.newPage();
      await page.goto(`${server.origin}/index.html`);
      const panel = await openSidePanel(context, extensionId);

      await pickElement(panel, page, "#save");
      await applyQuickStyle(panel, "color", "#ff0000");
      await expect.poll(() => computedStyle(page, "#save", "color")).toBe("rgb(255, 0, 0)");

      // Open Review -> Export, where the Code sync card lives.
      await panel.getByRole("button", { name: "Review", exact: true }).click();
      await panel.getByRole("button", { name: "Export", exact: true }).click();

      // Connect to the bridge port.
      const portInput = panel.getByLabel("Bridge port");
      await portInput.fill(String(bridge.port));
      await portInput.blur();
      await expect(panel.getByText(/Connected to/)).toBeVisible();
      await expect(panel.getByText("clickspex-e2e-fixture")).toBeVisible();

      // Pair with the one-time code from the CLI output.
      await panel.locator("#cs-pair-code").fill(bridge.pairingCode);
      await panel.getByRole("button", { name: "Pair", exact: true }).click();
      const previewButton = panel.getByRole("button", { name: "Preview diff", exact: true });
      await expect(previewButton).toBeVisible();

      // Preview the diff against the real project on disk.
      await previewButton.click();
      await expect(
        panel.getByText(/1 of 1 element\(s\) map to 1 stylesheet file\(s\)/),
      ).toBeVisible();
      await expect(panel.getByText("src/styles.css").first()).toBeVisible();

      // Apply (explicit confirmation step) and verify the file changed.
      await panel.getByRole("button", { name: "Apply to code", exact: true }).click();
      await panel.getByRole("button", { name: "Confirm apply", exact: true }).click();
      await expect(panel.getByText(/Applied 1 change\(s\) to your source\./)).toBeVisible();

      const appliedStyles = await readFile(project.stylesPath, "utf8");
      expect(appliedStyles).toContain("#ff0000");
      expect(appliedStyles).not.toBe(originalStyles);

      // Roll back through the panel and verify the file is restored.
      await panel.getByRole("button", { name: "Undo apply", exact: true }).click();
      await expect(panel.getByText(/Applied 1 change\(s\) to your source\./)).not.toBeVisible();
      expect(await readFile(project.stylesPath, "utf8")).toBe(originalStyles);
    } finally {
      await bridge.stop();
    }
  });

  test("keeps apply refused when the bridge runs without write access", async ({
    context,
    extensionId,
    server,
    project,
  }) => {
    const originalStyles = await readFile(project.stylesPath, "utf8");
    const bridge = await startBridgeProcess({ projectPath: project.rootPath });

    try {
      const page = await context.newPage();
      await page.goto(`${server.origin}/index.html`);
      const panel = await openSidePanel(context, extensionId);

      await pickElement(panel, page, "#save");
      await applyQuickStyle(panel, "color", "#ff0000");

      await panel.getByRole("button", { name: "Review", exact: true }).click();
      await panel.getByRole("button", { name: "Export", exact: true }).click();

      const portInput = panel.getByLabel("Bridge port");
      await portInput.fill(String(bridge.port));
      await portInput.blur();
      await expect(panel.getByText(/Connected to/)).toBeVisible();
      await expect(panel.getByText(/Source writes are disabled by default/)).toBeVisible();

      await panel.locator("#cs-pair-code").fill(bridge.pairingCode);
      await panel.getByRole("button", { name: "Pair", exact: true }).click();
      await panel.getByRole("button", { name: "Preview diff", exact: true }).click();
      await expect(
        panel.getByText(/1 of 1 element\(s\) map to 1 stylesheet file\(s\)/),
      ).toBeVisible();

      // Preview works, but writes stay locked out.
      await expect(
        panel.getByRole("button", { name: "Apply to code", exact: true }),
      ).toBeDisabled();
      expect(await readFile(project.stylesPath, "utf8")).toBe(originalStyles);
    } finally {
      await bridge.stop();
    }
  });

  test("web pages cannot reach the bridge", async ({ context, server, project }) => {
    const bridge = await startBridgeProcess({ projectPath: project.rootPath });

    try {
      const page = await context.newPage();
      await page.goto(`${server.origin}/index.html`);

      const result = await page.evaluate(async (port) => {
        try {
          const response = await fetch(`http://127.0.0.1:${port}/health`);
          return { blocked: !response.ok, status: response.status };
        } catch {
          return { blocked: true, status: null };
        }
      }, bridge.port);

      expect(result.blocked).toBe(true);
    } finally {
      await bridge.stop();
    }
  });
});
