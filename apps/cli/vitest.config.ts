import { fileURLToPath } from "node:url";

import baseConfig from "@ui-buddy/config/vitest";
import { mergeConfig } from "vitest/config";

const adaptersSourcePath = fileURLToPath(new URL("../../packages/adapters/src", import.meta.url));
const coreProjectSourcePath = fileURLToPath(
  new URL("../../packages/core/src/projectDetection.ts", import.meta.url),
);
const coreStyleDiffSourcePath = fileURLToPath(
  new URL("../../packages/core/src/styleDiff.ts", import.meta.url),
);
const sharedSourcePath = fileURLToPath(
  new URL("../../packages/shared/src/index.ts", import.meta.url),
);

export default mergeConfig(baseConfig, {
  resolve: {
    alias: [
      { find: "@ui-buddy/core/project", replacement: coreProjectSourcePath },
      { find: "@ui-buddy/core/styleDiff", replacement: coreStyleDiffSourcePath },
      { find: "@ui-buddy/adapters", replacement: adaptersSourcePath },
      { find: "@ui-buddy/shared", replacement: sharedSourcePath },
    ],
  },
  test: {
    environment: "node",
  },
});
