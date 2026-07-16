import baseConfig from "@clickspex/config/vitest";
import { mergeConfig } from "vitest/config";

export default mergeConfig(baseConfig, {
  test: {
    environment: "node",
  },
});
