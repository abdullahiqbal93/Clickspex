import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = join(root, "artifacts");
const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const cliPackage = JSON.parse(readFileSync(join(root, "apps/cli/package.json"), "utf8"));
const extensionPackage = JSON.parse(
  readFileSync(join(root, "apps/extension/package.json"), "utf8"),
);

if (!existsSync(artifactsDir)) throw new Error("artifacts directory does not exist.");

const artifactNames = readdirSync(artifactsDir)
  .filter((entry) => /\.(tgz|zip|json)$/.test(entry) && !/provenance\.json$/.test(entry))
  .sort();
if (artifactNames.length === 0)
  throw new Error("No release artifacts found for checksum generation.");

const checksumLines = artifactNames.map((entry) => {
  const hash = createHash("sha256")
    .update(readFileSync(join(artifactsDir, entry)))
    .digest("hex");
  return `${hash}  ${entry}`;
});
writeFileSync(join(artifactsDir, "CHECKSUMS.sha256"), `${checksumLines.join("\n")}\n`);

const git = (args) => {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
};

const provenance = {
  product: "Clickspex",
  version: rootPackage.version,
  packageManager: rootPackage.packageManager,
  node: process.version,
  gitCommit: git(["rev-parse", "HEAD"]),
  gitDirty: (git(["status", "--porcelain"]) ?? "").length > 0,
  cli: { name: cliPackage.name, version: cliPackage.version },
  extension: { name: extensionPackage.name, version: extensionPackage.version },
  artifacts: checksumLines.map((line) => {
    const [sha256, file] = line.split(/\s+/);
    return { file, sha256 };
  }),
};
writeFileSync(
  join(artifactsDir, "clickspex-provenance.json"),
  `${JSON.stringify(provenance, null, 2)}\n`,
);
console.log(`wrote ${relative(root, join(artifactsDir, "CHECKSUMS.sha256")).split(sep).join("/")}`);
console.log(
  `wrote ${relative(root, join(artifactsDir, "clickspex-provenance.json")).split(sep).join("/")}`,
);
