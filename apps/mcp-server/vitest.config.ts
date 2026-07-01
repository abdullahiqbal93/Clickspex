import { fileURLToPath } from "node:url";

import baseConfig from "@ui-devtools/config/vitest";
import { mergeConfig } from "vitest/config";

export default mergeConfig(baseConfig, {
  resolve: {
    alias: {
      "@ui-devtools/adapters": fileURLToPath(
        new URL("../../packages/adapters/src", import.meta.url),
      ),
      "@ui-devtools/core": fileURLToPath(new URL("../../packages/core/src", import.meta.url)),
      "@ui-devtools/shared": fileURLToPath(new URL("../../packages/shared/src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
  },
});
