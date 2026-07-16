import type { RectSnapshot } from "@clickspex/shared";

export type AlignmentName = "left" | "right" | "center-x" | "top" | "bottom" | "center-y";

export type MeasurementResult = {
  source: RectSnapshot;
  target: RectSnapshot;
  horizontalDistance: number;
  verticalDistance: number;
  centerDeltaX: number;
  centerDeltaY: number;
  alignments: AlignmentName[];
};

const withinTolerance = (a: number, b: number, tolerance: number): boolean =>
  Math.abs(a - b) <= tolerance;

export const distanceBetweenEdges = (first: RectSnapshot, second: RectSnapshot): number => {
  if (first.right < second.left) {
    return second.left - first.right;
  }

  if (second.right < first.left) {
    return first.left - second.right;
  }

  return 0;
};

export const verticalDistanceBetweenEdges = (first: RectSnapshot, second: RectSnapshot): number => {
  if (first.bottom < second.top) {
    return second.top - first.bottom;
  }

  if (second.bottom < first.top) {
    return first.top - second.bottom;
  }

  return 0;
};

export const getCenter = (rect: RectSnapshot): { x: number; y: number } => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
});

export const measureRects = (
  source: RectSnapshot,
  target: RectSnapshot,
  tolerance = 1,
): MeasurementResult => {
  const sourceCenter = getCenter(source);
  const targetCenter = getCenter(target);
  const alignments: AlignmentName[] = [];

  if (withinTolerance(source.left, target.left, tolerance)) {
    alignments.push("left");
  }

  if (withinTolerance(source.right, target.right, tolerance)) {
    alignments.push("right");
  }

  if (withinTolerance(sourceCenter.x, targetCenter.x, tolerance)) {
    alignments.push("center-x");
  }

  if (withinTolerance(source.top, target.top, tolerance)) {
    alignments.push("top");
  }

  if (withinTolerance(source.bottom, target.bottom, tolerance)) {
    alignments.push("bottom");
  }

  if (withinTolerance(sourceCenter.y, targetCenter.y, tolerance)) {
    alignments.push("center-y");
  }

  return {
    source,
    target,
    horizontalDistance: distanceBetweenEdges(source, target),
    verticalDistance: verticalDistanceBetweenEdges(source, target),
    centerDeltaX: targetCenter.x - sourceCenter.x,
    centerDeltaY: targetCenter.y - sourceCenter.y,
    alignments,
  };
};
