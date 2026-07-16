import { fileURLToPath } from "node:url";

import baseConfig from "@clickspex/config/vitest";
import { mergeConfig } from "vitest/config";

const sharedSourcePath = fileURLToPath(new URL("../../packages/shared/src", import.meta.url));
const coreSourcePath = fileURLToPath(new URL("../../packages/core/src", import.meta.url));
const adaptersSourcePath = fileURLToPath(new URL("../../packages/adapters/src", import.meta.url));

export default mergeConfig(baseConfig, {
  resolve: {
    alias: {
      "@clickspex/adapters": adaptersSourcePath,
      "@clickspex/core": coreSourcePath,
      "@clickspex/shared": sharedSourcePath,
    },
  },
  test: {
    environment: "jsdom",
  },
});
