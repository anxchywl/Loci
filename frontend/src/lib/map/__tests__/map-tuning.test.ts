import { describe, expect, it } from "vitest";

import { resolveMapTuning } from "@/lib/map/map-tuning";
import type { SpaceCapabilities } from "@/lib/map/space-quality";

const base: SpaceCapabilities = {
  coarsePointer: false,
  deviceMemory: 8,
  effectiveType: "4g",
  hardwareConcurrency: 8,
  reducedMotion: false,
  saveData: false,
  viewportPixels: 2_000_000,
};

describe("resolveMapTuning", () => {
  it("honours retina DPR up to 2 on capable desktops", () => {
    const tuning = resolveMapTuning(base, 3);
    expect(tuning.pixelRatio).toBe(2);
    expect(tuning.antialias).toBe(true);
    expect(tuning.fadeDuration).toBe(0);
    expect(tuning.maxTileCacheZoomLevels).toBe(6);
  });

  it("caps DPR at 1.5 on phones and only antialiases capable ones", () => {
    const capable = resolveMapTuning({ ...base, coarsePointer: true }, 3);
    expect(capable.pixelRatio).toBe(1.5);
    expect(capable.antialias).toBe(true);

    const modest = resolveMapTuning(
      { ...base, coarsePointer: true, hardwareConcurrency: 4, deviceMemory: 4 },
      3,
    );
    expect(modest.pixelRatio).toBe(1.5);
    expect(modest.antialias).toBe(false);
    expect(modest.maxTileCacheZoomLevels).toBe(4);
  });

  it("renders low-end and save-data devices at 1x with a lean cache", () => {
    const weak = resolveMapTuning({ ...base, deviceMemory: 2 }, 2);
    expect(weak.pixelRatio).toBe(1);
    expect(weak.antialias).toBe(false);
    expect(weak.fadeDuration).toBe(0);
    expect(weak.maxTileCacheZoomLevels).toBe(3);

    const saveData = resolveMapTuning({ ...base, saveData: true }, 2);
    expect(saveData.pixelRatio).toBe(1);
  });

  it("never upscales beyond the device's own DPR", () => {
    expect(resolveMapTuning(base, 1).pixelRatio).toBe(1);
    expect(resolveMapTuning({ ...base, coarsePointer: true }, 1).pixelRatio).toBe(1);
  });
});
