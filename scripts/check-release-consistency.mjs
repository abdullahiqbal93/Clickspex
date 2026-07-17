import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const fail = (message) => {
  throw new Error(message);
};

const rootPackage = readJson("package.json");
const version = rootPackage.version;
const packageFiles = [
  "apps/cli/package.json",
  "apps/e2e/package.json",
  "apps/extension/package.json",
  "apps/mcp-server/package.json",
  "packages/adapters/package.json",
  "packages/config/package.json",
  "packages/core/package.json",
  "packages/shared/package.json",
];

for (const file of packageFiles) {
  const manifest = readJson(file);
  if (manifest.version !== version) {
    fail(`${file} version ${manifest.version} does not match root version ${version}.`);
  }
}

const cliPackage = readJson("apps/cli/package.json");
if (cliPackage.name !== "clickspex") fail("CLI package must be named clickspex.");
if (cliPackage.bin?.clickspex !== "./dist/index.js")
  fail("CLI bin must expose clickspex -> ./dist/index.js.");

const extensionPackage = readJson("apps/extension/package.json");
if (extensionPackage.name !== "@clickspex/extension")
  fail("Extension package must be named @clickspex/extension.");

const manifestSource = readFileSync("apps/extension/manifest.ts", "utf8");
if (!manifestSource.includes('name: "Clickspex"'))
  fail("Extension manifest name must be Clickspex.");
if (!manifestSource.includes('default_title: "Open Clickspex"')) {
  fail("Extension action title must be Open Clickspex.");
}
const manifestVersion = manifestSource.match(/version:\s*"([^"]+)"/)?.[1];
if (manifestVersion !== version) {
  fail(`Extension manifest version ${manifestVersion ?? "<missing>"} does not match ${version}.`);
}

const cliSource = readFileSync("apps/cli/src/index.ts", "utf8");
const cliSourceVersion = cliSource.match(/const PRODUCT_VERSION = "([^"]+)"/)?.[1];
if (cliSourceVersion !== version) {
  fail(`CLI PRODUCT_VERSION ${cliSourceVersion ?? "<missing>"} does not match ${version}.`);
}

const bridgeSource = readFileSync("apps/cli/src/bridge.ts", "utf8");
const bridgeHealthVersion = bridgeSource.match(/version:\s*"([^"]+)"/)?.[1];
if (bridgeHealthVersion !== version) {
  fail(`Bridge health version ${bridgeHealthVersion ?? "<missing>"} does not match ${version}.`);
}

const mcpSource = readFileSync("apps/mcp-server/src/index.ts", "utf8");
const mcpVersion = mcpSource.match(/version:\s*"([^"]+)"/)?.[1];
if (mcpVersion !== version) {
  fail(`MCP server version ${mcpVersion ?? "<missing>"} does not match ${version}.`);
}

const sharedSource = readFileSync("packages/shared/src/index.ts", "utf8");
const protocolVersion = sharedSource.match(/BRIDGE_PROTOCOL_VERSION\s*=\s*(\d+)/)?.[1];
if (protocolVersion !== "1")
  fail(`Unexpected bridge protocol version: ${protocolVersion ?? "<missing>"}.`);
if (!bridgeSource.includes("BRIDGE_PROTOCOL_VERSION"))
  fail("Bridge must use BRIDGE_PROTOCOL_VERSION from shared.");

const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
if (!workflow.includes("pnpm audit --audit-level high"))
  fail("CI must run high-severity dependency audit.");
if (!workflow.includes("pnpm release:check")) fail("CI must run release consistency checks.");

console.log(`release consistency ok: Clickspex ${version}, bridge protocol ${protocolVersion}`);
