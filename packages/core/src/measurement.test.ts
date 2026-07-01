import { describe, expect, it } from "vitest";

import { measureRects } from "./measurement";

import type { RectSnapshot } from "@ui-devtools/shared";

const rect = (left: number, top: number, width: number, height: number): RectSnapshot => ({
  x: left,
  y: top,
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

describe("measurement utilities", () => {
  it("measures horizontal and vertical edge distances", () => {
    const measurement = measureRects(rect(0, 0, 100, 50), rect(140, 90, 30, 20));

    expect(measurement.horizontalDistance).toBe(40);
    expect(measurement.verticalDistance).toBe(40);
  });

  it("detects aligned edges and centers within tolerance", () => {
    const measurement = measureRects(rect(10, 20, 100, 40), rect(10, 20, 100, 40));

    expect(measurement.alignments).toEqual([
      "left",
      "right",
      "center-x",
      "top",
      "bottom",
      "center-y",
    ]);
  });
});
