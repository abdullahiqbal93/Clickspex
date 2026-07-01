import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "UI DevTools",
  description: "Inspect, measure, and prototype UI changes directly in Chrome.",
  version: "0.1.0",
  action: {
    default_title: "Open UI DevTools",
  },
  permissions: ["activeTab", "sidePanel", "storage"],
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
