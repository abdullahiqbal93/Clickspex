import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactsDir = join(root, "artifacts");
const cliDir = join(root, "apps/cli");
const packageJsonPath = join(cliDir, "package.json");
const distIndexPath = join(cliDir, "dist/index.js");
const licensePath = join(root, "LICENSE");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const version = packageJson.version;
const outputPath = join(artifactsDir, `clickspex-cli-${version}.tgz`);

if (!existsSync(distIndexPath)) {
  throw new Error("CLI dist/index.js is missing. Run pnpm --filter clickspex bundle first.");
}

mkdirSync(artifactsDir, { recursive: true });
for (const entry of readdirSync(artifactsDir)) {
  if (/^clickspex.*\.tgz$/.test(entry)) rmSync(join(artifactsDir, entry), { force: true });
}

const files = [
  { source: packageJsonPath, target: "package/package.json", mode: 0o644 },
  { source: licensePath, target: "package/LICENSE", mode: 0o644 },
  { source: distIndexPath, target: "package/dist/index.js", mode: 0o755 },
];

const encodeOctal = (value, length) => {
  const octal = value.toString(8);
  return Buffer.from(`${octal.padStart(length - 1, "0")}\0`, "ascii");
};

const writeString = (header, offset, length, value) => {
  header.fill(0, offset, offset + length);
  Buffer.from(value, "utf8").copy(header, offset, 0, Math.min(Buffer.byteLength(value), length));
};

const createHeader = (name, size, mode) => {
  const header = Buffer.alloc(512, 0);
  writeString(header, 0, 100, name);
  encodeOctal(mode, 8).copy(header, 100);
  encodeOctal(0, 8).copy(header, 108);
  encodeOctal(0, 8).copy(header, 116);
  encodeOctal(size, 12).copy(header, 124);
  encodeOctal(0, 12).copy(header, 136);
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  writeString(header, 257, 6, "ustar");
  writeString(header, 263, 2, "00");
  writeString(header, 265, 32, "root");
  writeString(header, 297, 32, "root");

  let checksum = 0;
  for (const byte of header) checksum += byte;
  encodeOctal(checksum, 8).copy(header, 148);
  return header;
};

const tarChunks = [];
for (const file of files) {
  const data = readFileSync(file.source);
  tarChunks.push(createHeader(file.target, data.length, file.mode), data);
  const padding = (512 - (data.length % 512)) % 512;
  if (padding > 0) tarChunks.push(Buffer.alloc(padding, 0));
}
tarChunks.push(Buffer.alloc(1024, 0));

const tarball = gzipSync(Buffer.concat(tarChunks), { level: 9, mtime: 0 });
writeFileSync(outputPath, tarball);
const sha256 = createHash("sha256").update(tarball).digest("hex");
console.log(`packed CLI artifact: artifacts/clickspex-cli-${version}.tgz (${sha256})`);
