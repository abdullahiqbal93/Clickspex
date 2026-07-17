import { expect, test } from "../helpers/extension.js";
import { openSidePanel } from "../helpers/panel.js";

test.describe("extension bootstrap", () => {
  test("loaded manifest matches the store configuration", async ({ serviceWorker }) => {
    const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());

    expect(manifest.manifest_version).toBe(3);

    if (manifest.manifest_version !== 3) {
      return;
    }

    expect(manifest.name).toBe("Clickspex");
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(manifest.minimum_chrome_version).toBe("114");
    expect(manifest.permissions?.slice().sort()).toEqual([
      "activeTab",
      "scripting",
      "sidePanel",
      "storage",
    ]);
    expect(manifest.host_permissions?.slice().sort()).toEqual(["http://*/*", "https://*/*"]);
    expect(manifest.side_panel).toEqual({ default_path: "sidepanel.html" });
    expect(manifest.background?.service_worker).toBeTruthy();
    expect(manifest.content_scripts?.[0]?.matches).toEqual(["http://*/*", "https://*/*"]);
  });

  test("side panel renders inside the browser without crashing", async ({
    context,
    extensionId,
  }) => {
    const panel = await openSidePanel(context, extensionId);

    await expect(panel.getByRole("heading", { name: "Clickspex" })).toBeVisible();
    await expect(panel.getByText("No element selected", { exact: false })).toBeVisible();
    // The React error boundary must not have tripped during boot.
    await expect(panel.getByText("Clickspex ran into an unexpected error.")).not.toBeVisible();
  });
});
