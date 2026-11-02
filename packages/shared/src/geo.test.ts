import { describe, expect, it } from "vitest";
import { circlePolygon, pointInPolygon, type Pt } from "./geo";

describe("pointInPolygon", () => {
  const square: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
  it("finds points inside and outside a square", () => {
    expect(pointInPolygon([5, 5], square)).toBe(true);
    expect(pointInPolygon([15, 5], square)).toBe(false);
    expect(pointInPolygon([-1, -1], square)).toBe(false);
  });
  it("handles a concave lasso", () => {
    const u: Pt[] = [[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10]];
    expect(pointInPolygon([5, 8], u)).toBe(false);
    expect(pointInPolygon([1, 8], u)).toBe(true);
    expect(pointInPolygon([5, 1], u)).toBe(true);
  });
});

describe("circlePolygon", () => {
  it("is closed and about the right size at Cleveland's latitude", () => {
    const c: Pt = [-81.78, 41.45];
    const ring = circlePolygon(c, 150);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    // North point is 150 m away: ~0.00135 degrees of latitude.
    const north = ring[16]!;
    expect((north[1] - c[1]) * 111_320).toBeCloseTo(150, 0);
    expect(pointInPolygon(c, ring)).toBe(true);
    expect(pointInPolygon([c[0] + 0.01, c[1]], ring)).toBe(false);
  });
});
