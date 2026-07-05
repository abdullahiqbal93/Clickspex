import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "ui-buddy",
  description: "Inspect, measure, and prototype UI changes directly in Chrome.",
  version: "0.1.0",
  icons: {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png",
  },
  action: {
    default_title: "Open ui-buddy",
  },
  permissions: ["activeTab", "sidePanel", "storage", "scripting"],
  // `<all_urls>` is the permission chrome.tabs.captureVisibleTab explicitly
  // checks for; the http/https patterns alone can leave it dependent on a fresh
  // activeTab grant, which produced the "<all_urls> or activeTab required"
  // error. It also covers source lookup / tech detection (scripting MAIN world).
  // The explicit localhost patterns document (and guarantee) the side panel's
  // fetch to the `ui-buddy connect` Code Sync bridge.
  host_permissions: ["<all_urls>", "http://127.0.0.1/*", "http://localhost/*"],
  side_panel: {
    default_path: "sidepanel.html",
  },
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self';",
  },
});
