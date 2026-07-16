import { fileURLToPath } from "node:url";

import baseConfig from "@clickspex/config/vitest";
import { mergeConfig } from "vitest/config";

const sharedSourcePath = fileURLToPath(new URL("../shared/src/index.ts", import.meta.url));

export default mergeConfig(baseConfig, {
  resolve: {
    alias: {
      "@clickspex/shared": sharedSourcePath,
    },
  },
  test: {
    environment: "jsdom",
  },
});
