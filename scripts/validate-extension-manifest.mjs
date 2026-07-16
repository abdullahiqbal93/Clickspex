import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const manifestPath = resolve("apps/extension/dist/manifest.json");

const fail = (message) => {
  process.stderr.write(`manifest validation failed: ${message}\n`);
  process.exit(1);
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

process.stdout.write(`validated ${manifestPath}\n`);
