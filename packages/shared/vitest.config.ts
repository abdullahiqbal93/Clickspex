import baseConfig from "@ui-devtools/config/vitest";
import { mergeConfig } from "vitest/config";

export default mergeConfig(baseConfig, {
  test: {
    environment: "node",
  },
});
