import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "..", "public", "icons");
mkdirSync(iconsDir, { recursive: true });

const sizes = [16, 32, 48, 128];

const createSvg =
  () => `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="16" fill="url(#bg)"/>
  <rect x="24" y="28" width="80" height="72" rx="6" fill="none" stroke="white" stroke-width="4" opacity="0.9"/>
  <line x1="24" y1="48" x2="104" y2="48" stroke="white" stroke-width="3" opacity="0.6"/>
  <line x1="52" y1="48" x2="52" y2="100" stroke="white" stroke-width="3" opacity="0.4"/>
  <circle cx="82" cy="74" r="16" fill="none" stroke="white" stroke-width="3.5" opacity="0.95"/>
  <line x1="82" y1="54" x2="82" y2="94" stroke="white" stroke-width="2.5" opacity="0.8"/>
  <line x1="62" y1="74" x2="102" y2="74" stroke="white" stroke-width="2.5" opacity="0.8"/>
  <circle cx="82" cy="74" r="3" fill="white" opacity="0.95"/>
</svg>`;

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

const chunk = (type, data) => {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
};

const writePixel = (pixels, size, x, y, r, g, b, a = 255) => {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const offset = (Math.floor(y) * size + Math.floor(x)) * 4;
  pixels[offset] = r;
  pixels[offset + 1] = g;
  pixels[offset + 2] = b;
  pixels[offset + 3] = a;
};

const blendPixel = (pixels, size, x, y, r, g, b, alpha) => {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const offset = (Math.floor(y) * size + Math.floor(x)) * 4;
  const existingAlpha = pixels[offset + 3] / 255;
  const sourceAlpha = alpha / 255;
  const outAlpha = sourceAlpha + existingAlpha * (1 - sourceAlpha);
  if (outAlpha === 0) return;
  pixels[offset] = Math.round(
    (r * sourceAlpha + pixels[offset] * existingAlpha * (1 - sourceAlpha)) / outAlpha,
  );
  pixels[offset + 1] = Math.round(
    (g * sourceAlpha + pixels[offset + 1] * existingAlpha * (1 - sourceAlpha)) / outAlpha,
  );
  pixels[offset + 2] = Math.round(
    (b * sourceAlpha + pixels[offset + 2] * existingAlpha * (1 - sourceAlpha)) / outAlpha,
  );
  pixels[offset + 3] = Math.round(outAlpha * 255);
};

const fillRect = (pixels, size, x, y, width, height, color, opacity = 1) => {
  const scale = size / 128;
  const startX = Math.max(0, Math.round(x * scale));
  const endX = Math.min(size, Math.round((x + width) * scale));
  const startY = Math.max(0, Math.round(y * scale));
  const endY = Math.min(size, Math.round((y + height) * scale));
  for (let py = startY; py < endY; py += 1) {
    for (let px = startX; px < endX; px += 1)
      blendPixel(pixels, size, px, py, ...color, Math.round(255 * opacity));
  }
};

const fillCircle = (pixels, size, cx, cy, radius, color, opacity = 1) => {
  const scale = size / 128;
  const centerX = cx * scale;
  const centerY = cy * scale;
  const scaledRadius = radius * scale;
  const alpha = Math.round(255 * opacity);
  for (
    let py = Math.floor(centerY - scaledRadius);
    py <= Math.ceil(centerY + scaledRadius);
    py += 1
  ) {
    for (
      let px = Math.floor(centerX - scaledRadius);
      px <= Math.ceil(centerX + scaledRadius);
      px += 1
    ) {
      if (Math.hypot(px + 0.5 - centerX, py + 0.5 - centerY) <= scaledRadius) {
        blendPixel(pixels, size, px, py, ...color, alpha);
      }
    }
  }
};

const strokeCircle = (pixels, size, cx, cy, radius, strokeWidth, color, opacity = 1) => {
  const scale = size / 128;
  const centerX = cx * scale;
  const centerY = cy * scale;
  const scaledRadius = radius * scale;
  const halfStroke = Math.max(0.5, (strokeWidth * scale) / 2);
  const alpha = Math.round(255 * opacity);
  for (
    let py = Math.floor(centerY - scaledRadius - halfStroke);
    py <= Math.ceil(centerY + scaledRadius + halfStroke);
    py += 1
  ) {
    for (
      let px = Math.floor(centerX - scaledRadius - halfStroke);
      px <= Math.ceil(centerX + scaledRadius + halfStroke);
      px += 1
    ) {
      const distance = Math.hypot(px + 0.5 - centerX, py + 0.5 - centerY);
      if (Math.abs(distance - scaledRadius) <= halfStroke)
        blendPixel(pixels, size, px, py, ...color, alpha);
    }
  }
};

const drawIconPixels = (size) => {
  const pixels = new Uint8Array(size * size * 4);
  const radius = size * 0.125;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const cornerX = x < radius ? radius : x >= size - radius ? size - radius - 1 : x;
      const cornerY = y < radius ? radius : y >= size - radius ? size - radius - 1 : y;
      if (Math.hypot(x - cornerX, y - cornerY) > radius) continue;
      const t = (x + y) / Math.max(1, size * 2 - 2);
      const r = Math.round(37 * (1 - t) + 29 * t);
      const g = Math.round(99 * (1 - t) + 78 * t);
      const b = Math.round(235 * (1 - t) + 216 * t);
      writePixel(pixels, size, x, y, r, g, b, 255);
    }
  }

  const white = [255, 255, 255];
  fillRect(pixels, size, 24, 28, 80, 4, white, 0.9);
  fillRect(pixels, size, 24, 96, 80, 4, white, 0.9);
  fillRect(pixels, size, 24, 28, 4, 72, white, 0.9);
  fillRect(pixels, size, 100, 28, 4, 72, white, 0.9);
  fillRect(pixels, size, 24, 47, 80, 3, white, 0.6);
  fillRect(pixels, size, 51, 48, 3, 52, white, 0.4);
  strokeCircle(pixels, size, 82, 74, 16, 3.5, white, 0.95);
  fillRect(pixels, size, 80.75, 54, 2.5, 40, white, 0.8);
  fillRect(pixels, size, 62, 72.75, 40, 2.5, white, 0.8);
  fillCircle(pixels, size, 82, 74, 3, white, 0.95);
  return pixels;
};

const createPng = (size) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const pixels = drawIconPixels(size);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0;
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, rowStart + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

for (const size of sizes) {
  const svgPath = join(iconsDir, `icon-${size}.svg`);
  const pngPath = join(iconsDir, `icon-${size}.png`);
  writeFileSync(svgPath, createSvg(), "utf8");
  const png = createPng(size);
  writeFileSync(pngPath, png);
  console.log(
    `Created icon-${size}.svg and icon-${size}.png (${createHash("sha256").update(png).digest("hex")})`,
  );
}

writeFileSync(join(iconsDir, "icon.svg"), createSvg(), "utf8");
console.log("Icon assets generated successfully.");
