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
  // Same scope as the content scripts. Required so source lookup / tech
  // detection (chrome.scripting MAIN world) and element screenshots
  // (captureVisibleTab) work without a fresh action-click grant.
  host_permissions: ["http://*/*", "https://*/*"],
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
