import { fileURLToPath } from "node:url";

import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import manifest from "./manifest";

const sharedSourcePath = fileURLToPath(new URL("../../packages/shared/src", import.meta.url));
const coreSourcePath = fileURLToPath(new URL("../../packages/core/src", import.meta.url));
const adaptersSourcePath = fileURLToPath(new URL("../../packages/adapters/src", import.meta.url));

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      "@ui-buddy/adapters": adaptersSourcePath,
      "@ui-buddy/core": coreSourcePath,
      "@ui-buddy/shared": sharedSourcePath,
    },
  },
});
