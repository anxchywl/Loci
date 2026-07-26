import { describe, expect, it } from "vitest";

import { resolveSpaceQuality, type SpaceCapabilities } from "@/lib/map/space-quality";
import { createStarData, shortestAngleDelta } from "@/lib/map/space-renderer";

const capableDesktop: SpaceCapabilities = {
  coarsePointer: false,
  deviceMemory: 8,
  hardwareConcurrency: 8,
  reducedMotion: false,
  saveData: false,
  viewportPixels: 3_000_000,
};

describe("space quality", () => {
  it("gives a strong desktop the ultra preset automatically", () => {
    expect(resolveSpaceQuality(capableDesktop)).toBe("ultra");
  });

  it("keeps a mid-range desktop on high", () => {
    expect(resolveSpaceQuality({ ...capableDesktop, hardwareConcurrency: 4 })).toBe("high");
  });

  it("steps a 4K+ desktop down to medium", () => {
    expect(resolveSpaceQuality({ ...capableDesktop, viewportPixels: 9_500_000 })).toBe("medium");
  });

  it("gives capable phones high and weaker phones medium — never ultra", () => {
    expect(resolveSpaceQuality({ ...capableDesktop, coarsePointer: true })).toBe("high");
    expect(resolveSpaceQuality({
      ...capableDesktop,
      coarsePointer: true,
      deviceMemory: 4,
      hardwareConcurrency: 4,
    })).toBe("medium");
  });

  it("uses the static low preset for reduced motion, data saving, and weak hardware", () => {
    expect(resolveSpaceQuality({ ...capableDesktop, reducedMotion: true })).toBe("low");
    expect(resolveSpaceQuality({ ...capableDesktop, saveData: true })).toBe("low");
    expect(resolveSpaceQuality({ ...capableDesktop, deviceMemory: 2 })).toBe("low");
    expect(resolveSpaceQuality({ ...capableDesktop, hardwareConcurrency: 2 })).toBe("low");
  });
});

describe("space geometry", () => {
  it("builds deterministic reusable star buffers", () => {
    expect(createStarData(4)).toEqual(createStarData(4));
    expect(createStarData(4)).toHaveLength(32);
  });

  it("takes the shortest continuous path across the antimeridian", () => {
    const east = 179 * Math.PI / 180;
    const west = -179 * Math.PI / 180;

    expect(shortestAngleDelta(east, west)).toBeCloseTo(2 * Math.PI / 180);
    expect(shortestAngleDelta(west, east)).toBeCloseTo(-2 * Math.PI / 180);
  });
});
