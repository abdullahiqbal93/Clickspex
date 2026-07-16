import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  bundle: true,
  // Inline the internal workspace packages so the published CLI is fully
  // self-contained: `npx clickspex` must not depend on any @clickspex/* packages
  // being on npm. chalk/commander stay external and ship as real dependencies.
  noExternal: [/@clickspex\//],
  external: ["postcss"],
  clean: true,
  dts: false,
  splitting: false,
  sourcemap: false,
  minify: false,
  outDir: "dist",
});
