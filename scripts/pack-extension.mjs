import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "apps/extension/dist");
const artifactsDir = join(root, "artifacts");
const version = JSON.parse(readFileSync(join(root, "apps/extension/package.json"), "utf8")).version;
const outputPath = join(artifactsDir, `clickspex-extension-${version}.zip`);

if (!existsSync(join(distDir, "manifest.json"))) {
  throw new Error(
    "Extension dist/manifest.json is missing. Run pnpm --filter @clickspex/extension build first.",
  );
}

mkdirSync(artifactsDir, { recursive: true });
rmSync(outputPath, { force: true });

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const collectFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = join(dir, entry.name);
      return entry.isDirectory() ? collectFiles(fullPath) : [fullPath];
    })
    .sort((a, b) => relative(distDir, a).localeCompare(relative(distDir, b)));

const dosTime = 0;
const dosDate = (1 << 5) | 1;
const chunks = [];
const centralDirectory = [];
let offset = 0;

const u16 = (value) => {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
};
const u32 = (value) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
};

for (const file of collectFiles(distDir)) {
  const data = readFileSync(file);
  const name = relative(distDir, file).split(sep).join("/");
  const nameBuffer = Buffer.from(name, "utf8");
  const crc = crc32(data);

  const localHeader = Buffer.concat([
    u32(0x04034b50),
    u16(20),
    u16(0x0800),
    u16(0),
    u16(dosTime),
    u16(dosDate),
    u32(crc),
    u32(data.length),
    u32(data.length),
    u16(nameBuffer.length),
    u16(0),
    nameBuffer,
  ]);
  chunks.push(localHeader, data);

  centralDirectory.push(
    Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBuffer.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuffer,
    ]),
  );
  offset += localHeader.length + data.length;
}

const centralDirectorySize = centralDirectory.reduce((size, buffer) => size + buffer.length, 0);
const endOfCentralDirectory = Buffer.concat([
  u32(0x06054b50),
  u16(0),
  u16(0),
  u16(centralDirectory.length),
  u16(centralDirectory.length),
  u32(centralDirectorySize),
  u32(offset),
  u16(0),
]);

writeFileSync(outputPath, Buffer.concat([...chunks, ...centralDirectory, endOfCentralDirectory]));
console.log(`packed extension artifact: ${relative(root, outputPath).split(sep).join("/")}`);
