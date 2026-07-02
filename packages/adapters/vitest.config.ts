import { fileURLToPath } from "node:url";

import baseConfig from "@ui-buddy/config/vitest";
import { mergeConfig } from "vitest/config";

const sharedSourcePath = fileURLToPath(new URL("../shared/src", import.meta.url));
const coreSourcePath = fileURLToPath(new URL("../core/src", import.meta.url));

export default mergeConfig(baseConfig, {
  resolve: {
    alias: {
      "@ui-buddy/core": coreSourcePath,
      "@ui-buddy/shared": sharedSourcePath,
    },
  },
  test: {
    environment: "node",
  },
});
