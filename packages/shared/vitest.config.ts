import baseConfig from "@ui-buddy/config/vitest";
import { mergeConfig } from "vitest/config";

export default mergeConfig(baseConfig, {
  test: {
    environment: "node",
  },
});
