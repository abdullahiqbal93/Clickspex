import { fileURLToPath } from "node:url";

import baseConfig from "@clickspex/config/vitest";
import { mergeConfig } from "vitest/config";

const adaptersSourcePath = fileURLToPath(new URL("../../packages/adapters/src", import.meta.url));
const coreSourcePath = fileURLToPath(new URL("../../packages/core/src", import.meta.url));
const coreProjectSourcePath = fileURLToPath(
  new URL("../../packages/core/src/projectDetection.ts", import.meta.url),
);
const coreStyleDiffSourcePath = fileURLToPath(
  new URL("../../packages/core/src/styleDiff.ts", import.meta.url),
);
const sharedSourcePath = fileURLToPath(new URL("../../packages/shared/src", import.meta.url));

export default mergeConfig(baseConfig, {
  resolve: {
    alias: [
      { find: "@clickspex/core/project", replacement: coreProjectSourcePath },
      { find: "@clickspex/core/styleDiff", replacement: coreStyleDiffSourcePath },
      { find: "@clickspex/adapters", replacement: adaptersSourcePath },
      { find: "@clickspex/core", replacement: coreSourcePath },
      { find: "@clickspex/shared", replacement: sharedSourcePath },
    ],
  },
  test: {
    environment: "node",
  },
});
