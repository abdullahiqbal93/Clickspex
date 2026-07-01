import { fileURLToPath } from "node:url";

import baseConfig from "@ui-devtools/config/vitest";
import { mergeConfig } from "vitest/config";

const coreProjectSourcePath = fileURLToPath(
  new URL("../../packages/core/src/projectDetection.ts", import.meta.url),
);
const sharedSourcePath = fileURLToPath(
  new URL("../../packages/shared/src/index.ts", import.meta.url),
);

export default mergeConfig(baseConfig, {
  resolve: {
    alias: {
      "@ui-devtools/core/project": coreProjectSourcePath,
      "@ui-devtools/shared": sharedSourcePath,
    },
  },
  test: {
    environment: "node",
  },
});
