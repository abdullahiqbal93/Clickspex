import { fileURLToPath } from "node:url";

import { crx } from "@crxjs/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import manifest from "./manifest";

const sharedSourcePath = fileURLToPath(
  new URL("../../packages/shared/src/index.ts", import.meta.url),
);
const coreSourcePath = fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url));

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      "@ui-devtools/core": coreSourcePath,
      "@ui-devtools/shared": sharedSourcePath,
    },
  },
});
