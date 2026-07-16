import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = join(root, "artifacts");
const lockfilePath = join(root, "pnpm-lock.yaml");
const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const workspacePackagePaths = [
  "apps/cli/package.json",
  "apps/extension/package.json",
  "apps/mcp-server/package.json",
  "packages/adapters/package.json",
  "packages/config/package.json",
  "packages/core/package.json",
  "packages/shared/package.json",
];

if (!existsSync(lockfilePath)) throw new Error("pnpm-lock.yaml is required to generate an SBOM.");
mkdirSync(artifactsDir, { recursive: true });

const purlName = (name) => name.replace(/^@/, "").replace("/", "/");
const purl = (name, version) => `pkg:npm/${purlName(name)}@${encodeURIComponent(version)}`;
const bomRef = (name, version) => `${name}@${version}`;
const component = (name, version, type = "library") => ({
  type,
  "bom-ref": bomRef(name, version),
  name,
  version,
  purl: purl(name, version),
});

const components = new Map();
const addComponent = (name, version, type = "library") => {
  if (!name || !version || version.startsWith("link:")) return;
  components.set(bomRef(name, version), component(name, version, type));
};

for (const path of workspacePackagePaths) {
  const manifest = JSON.parse(readFileSync(join(root, path), "utf8"));
  addComponent(manifest.name, manifest.version, manifest.private ? "application" : "application");
}

const lockfile = readFileSync(lockfilePath, "utf8");
const packagesStart = lockfile.indexOf("packages:\n");
const snapshotsStart = lockfile.indexOf("snapshots:\n");
if (packagesStart === -1 || snapshotsStart === -1 || snapshotsStart <= packagesStart) {
  throw new Error("Could not find the packages section in pnpm-lock.yaml.");
}

const packagesSection = lockfile.slice(packagesStart, snapshotsStart);
for (const line of packagesSection.split("\n")) {
  const match = line.match(/^  ['"]?(.+?)['"]?:\s*$/);
  if (!match) continue;
  const key = match[1];
  const separatorIndex = key.startsWith("@") ? key.lastIndexOf("@") : key.indexOf("@");
  if (separatorIndex <= 0) continue;
  const name = key.slice(0, separatorIndex);
  const version = key.slice(separatorIndex + 1);
  if (!version || version.includes("(") || version.startsWith("link:")) continue;
  addComponent(name, version);
}

const sortedComponents = [...components.values()].sort((a, b) =>
  `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
);
const serialNumberSeed = `${rootPackage.name}@${rootPackage.version}:${sortedComponents
  .map((entry) => `${entry.name}@${entry.version}`)
  .join("|")}`;
const serialHash = createHash("sha256").update(serialNumberSeed).digest("hex");
const serialUuid = `${serialHash.slice(0, 8)}-${serialHash.slice(8, 12)}-4${serialHash.slice(13, 16)}-${((parseInt(serialHash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0")}${serialHash.slice(18, 20)}-${serialHash.slice(20, 32)}`;

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  serialNumber: `urn:uuid:${serialUuid}`,
  version: 1,
  metadata: {
    component: {
      type: "application",
      "bom-ref": bomRef(rootPackage.name, rootPackage.version),
      name: rootPackage.name,
      version: rootPackage.version,
    },
    properties: [
      {
        name: "clickspex:lockfile-sha256",
        value: createHash("sha256").update(lockfile).digest("hex"),
      },
      { name: "clickspex:serial-seed-sha256", value: serialHash },
    ],
  },
  components: sortedComponents,
};

const outputPath = join(artifactsDir, "clickspex-sbom.cdx.json");
writeFileSync(outputPath, `${JSON.stringify(sbom, null, 2)}\n`);
console.log(`wrote artifacts/clickspex-sbom.cdx.json (${sortedComponents.length} components)`);
