import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const manifestPath = resolve("apps/extension/dist/manifest.json");
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const fail = (message) => {
  process.stderr.write(`manifest validation failed: ${message}\n`);
  process.exit(1);
};

const readPngDimensions = async (path) => {
  const buffer = await readFile(path);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(pngSignature)) {
    fail(`${path} must be a valid PNG file`);
  }
  if (buffer.subarray(12, 16).toString("ascii") !== "IHDR") {
    fail(`${path} is missing a PNG IHDR chunk`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  fail(error instanceof Error ? error.message : "could not read manifest.json");
}

if (manifest.manifest_version !== 3) {
  fail("manifest_version must be 3");
}

if (typeof manifest.name !== "string" || manifest.name.trim().length === 0) {
  fail("name must be a non-empty string");
}

if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(manifest.version)) {
  fail("version must be a Chrome-compatible version string");
}

if (manifest.background?.service_worker === undefined) {
  fail("background.service_worker is required");
}

if (!Array.isArray(manifest.permissions)) {
  fail("permissions must be declared as an array");
}

if (!manifest.icons || typeof manifest.icons !== "object") {
  fail("icons must be declared");
}

for (const requiredSize of [16, 32, 48, 128]) {
  const relativeIconPath = manifest.icons[String(requiredSize)];
  if (typeof relativeIconPath !== "string" || relativeIconPath.length === 0) {
    fail(`icons.${requiredSize} must be declared`);
  }
  const iconPath = resolve(dirname(manifestPath), relativeIconPath);
  const { width, height } = await readPngDimensions(iconPath);
  if (width !== requiredSize || height !== requiredSize) {
    fail(`${relativeIconPath} must be ${requiredSize}x${requiredSize}, got ${width}x${height}`);
  }
}

process.stdout.write(`validated ${manifestPath}\n`);
