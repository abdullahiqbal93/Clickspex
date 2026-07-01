import { fileURLToPath } from "node:url";

import baseConfig from "@ui-devtools/config/vitest";
import { mergeConfig } from "vitest/config";

const sharedSourcePath = fileURLToPath(new URL("../shared/src", import.meta.url));
const coreSourcePath = fileURLToPath(new URL("../core/src", import.meta.url));

export default mergeConfig(baseConfig, {
  resolve: {
    alias: {
      "@ui-devtools/core": coreSourcePath,
      "@ui-devtools/shared": sharedSourcePath,
    },
  },
  test: {
    environment: "node",
  },
});
