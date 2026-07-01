/**
 * Generate extension icon PNGs at required sizes.
 * Usage: node scripts/generate-icons.mjs
 *
 * Creates simple SVG-based PNG icons using data URIs.
 * Requires no external dependencies.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "..", "public", "icons");
mkdirSync(iconsDir, { recursive: true });

// Create SVG icon as a string
const createSvg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#2563eb"/>
      <stop offset="100%" style="stop-color:#1d4ed8"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect width="128" height="128" rx="16" fill="url(#bg)"/>
  <!-- UI Frame -->
  <rect x="24" y="28" width="80" height="72" rx="6" fill="none" stroke="white" stroke-width="4" opacity="0.9"/>
  <line x1="24" y1="48" x2="104" y2="48" stroke="white" stroke-width="3" opacity="0.6"/>
  <line x1="52" y1="48" x2="52" y2="100" stroke="white" stroke-width="3" opacity="0.4"/>
  <!-- Crosshair -->
  <circle cx="82" cy="74" r="16" fill="none" stroke="white" stroke-width="3.5" opacity="0.95"/>
  <line x1="82" y1="54" x2="82" y2="94" stroke="white" stroke-width="2.5" opacity="0.8"/>
  <line x1="62" y1="74" x2="102" y2="74" stroke="white" stroke-width="2.5" opacity="0.8"/>
  <circle cx="82" cy="74" r="3" fill="white" opacity="0.95"/>
</svg>`;

const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  const svgPath = join(iconsDir, `icon-${size}.svg`);
  writeFileSync(svgPath, createSvg(size), "utf8");
  console.log(`Created ${svgPath}`);
}

// Also create the main icon.svg
writeFileSync(join(iconsDir, "icon.svg"), createSvg(128), "utf8");
console.log("Icon SVGs generated successfully.");
console.log("Note: Chrome extensions can use SVG icons directly in manifest V3.");
