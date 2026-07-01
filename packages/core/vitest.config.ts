import { fileURLToPath } from "node:url";

import baseConfig from "@ui-devtools/config/vitest";
import { mergeConfig } from "vitest/config";

const sharedSourcePath = fileURLToPath(new URL("../shared/src/index.ts", import.meta.url));

export default mergeConfig(baseConfig, {
  resolve: {
    alias: {
      "@ui-devtools/shared": sharedSourcePath,
    },
  },
  test: {
    environment: "jsdom",
  },
});
