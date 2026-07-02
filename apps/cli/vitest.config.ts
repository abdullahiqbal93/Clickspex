import { fileURLToPath } from "node:url";

import baseConfig from "@ui-buddy/config/vitest";
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
      "@ui-buddy/core/project": coreProjectSourcePath,
      "@ui-buddy/shared": sharedSourcePath,
    },
  },
  test: {
    environment: "node",
  },
});
