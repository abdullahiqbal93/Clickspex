import config from "../../packages/config/eslint.config.mjs";

export default [
  ...config,
  {
    files: ["**/*.ts"],
    rules: {
      // Playwright fixtures receive a `use` callback; there is no React here.
      "react-hooks/rules-of-hooks": "off",
    },
  },
];
