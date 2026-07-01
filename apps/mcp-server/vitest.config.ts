import { fileURLToPath } from "node:url";

import baseConfig from "@ui-devtools/config/vitest";
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
      { find: "@ui-devtools/core/project", replacement: coreProjectSourcePath },
      { find: "@ui-devtools/core/styleDiff", replacement: coreStyleDiffSourcePath },
      { find: "@ui-devtools/adapters", replacement: adaptersSourcePath },
      { find: "@ui-devtools/core", replacement: coreSourcePath },
      { find: "@ui-devtools/shared", replacement: sharedSourcePath },
    ],
  },
  test: {
    environment: "node",
  },
});
