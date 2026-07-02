import type { PageAssetInfo, PageColorInfo, PageFontInfo, PageScanResult } from "@ui-buddy/shared";

const rgbToHex = (r: number, g: number, b: number): string =>
  "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");

const parseRgb = (value: string): { r: number; g: number; b: number } | null => {
  const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return { r: parseInt(m[1]!, 10), g: parseInt(m[2]!, 10), b: parseInt(m[3]!, 10) };
};

const isVisible = (el: Element): boolean => {
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
};

export const scanPage = (): PageScanResult => {
  const colorMap = new Map<string, { rgb: string; count: number; properties: Set<string> }>();
  const fontMap = new Map<string, { sizes: Set<string>; weights: Set<string>; count: number }>();
  const assets: PageAssetInfo[] = [];

  const colorProps = ["color", "background-color", "border-top-color", "border-bottom-color", "border-left-color", "border-right-color"];

  // Limit to first 150 elements to ensure it runs instantly without freezing
  const allElements = document.querySelectorAll("*");
  const elements = Array.from(allElements).slice(0, 150);

  for (const el of elements) {
    if (!isVisible(el)) continue;

    const styles = window.getComputedStyle(el);

    // Colors
    for (const prop of colorProps) {
      const val = styles.getPropertyValue(prop);
      if (!val || val === "rgba(0, 0, 0, 0)" || val === "transparent") continue;
      const rgb = parseRgb(val);
      if (!rgb) continue;
      const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
      const existing = colorMap.get(hex);
      if (existing) {
        existing.count++;
        existing.properties.add(prop);
      } else {
        colorMap.set(hex, { rgb: val, count: 1, properties: new Set([prop]) });
      }
    }

    // Fonts
    const family = styles.getPropertyValue("font-family").split(",")[0]?.trim().replace(/['"]/g, "") ?? "";
    if (family) {
      const size = styles.getPropertyValue("font-size");
      const weight = styles.getPropertyValue("font-weight");
      const existing = fontMap.get(family);
      if (existing) {
        existing.count++;
        if (size) existing.sizes.add(size);
        if (weight) existing.weights.add(weight);
      } else {
        fontMap.set(family, { sizes: new Set(size ? [size] : []), weights: new Set(weight ? [weight] : []), count: 1 });
      }
    }
  }

  // Images (limit to 50)
  const images = Array.from(document.querySelectorAll("img")).slice(0, 50);
  for (const img of images) {
    if (img.src && !img.src.startsWith("data:")) {
      assets.push({ type: "img", src: img.src, alt: img.alt || "", width: img.naturalWidth, height: img.naturalHeight });
    }
  }

  // SVGs (limit to 50)
  const svgs = Array.from(document.querySelectorAll("svg")).slice(0, 50);
  for (const svg of svgs) {
    const rect = svg.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const serializer = new XMLSerializer();
      const svgStr = serializer.serializeToString(svg);
      const blob = new Blob([svgStr], { type: "image/svg+xml" });
      assets.push({ type: "svg", src: URL.createObjectURL(blob), alt: svg.getAttribute("aria-label") || "", width: Math.round(rect.width), height: Math.round(rect.height) });
    }
  }

  // Background images
  for (const el of elements) {
    const styles = window.getComputedStyle(el);
    const bg = styles.backgroundImage;
    if (bg && bg !== "none") {
      const urlMatch = bg.match(/url\(["']?(.+?)["']?\)/);
      if (urlMatch?.[1] && !urlMatch[1].startsWith("data:")) {
        const rect = el.getBoundingClientRect();
        assets.push({ type: "bg", src: urlMatch[1], alt: "", width: Math.round(rect.width), height: Math.round(rect.height) });
      }
    }
  }

  const colors: PageColorInfo[] = Array.from(colorMap.entries())
    .map(([hex, info]) => ({ hex, rgb: info.rgb, count: info.count, properties: Array.from(info.properties) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  const fonts: PageFontInfo[] = Array.from(fontMap.entries())
    .map(([family, info]) => ({ family, sizes: Array.from(info.sizes).sort(), weights: Array.from(info.weights).sort(), count: info.count }))
    .sort((a, b) => b.count - a.count);

  return { colors, fonts, assets: assets.slice(0, 50) };
};
