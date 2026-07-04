import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  bundle: true,
  // Inline the internal workspace packages so the published CLI is fully
  // self-contained: `npx ui-buddy` must not depend on any @ui-buddy/* packages
  // being on npm. chalk/commander stay external and ship as real dependencies.
  noExternal: [/@ui-buddy\//],
  clean: true,
  dts: false,
  splitting: false,
  sourcemap: false,
  minify: false,
  outDir: "dist",
});
