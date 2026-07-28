import { type SpaceCapabilities } from "@/lib/map/space-quality";

// Device-adaptive tuning for the MapLibre globe itself (distinct from the space
// backdrop, which has its own quality ladder in space-quality.ts). These are the
// levers that MapLibre exposes to trade GPU/memory pressure against fidelity, and
// they are the difference between a smooth globe and one that flickers, pops, and
// overheats on phones:
//
//   pixelRatio             — the map canvas' backing-store scale. Phones report a
//                            DPR of 2–3; rendering the globe + vector tiles at 3x
//                            is the single biggest source of fill/GPU pressure,
//                            thermal throttling, and the frame drops that read as
//                            flicker. We cap it well below the raw DPR on mobile.
//   maxTileCacheZoomLevels — multiplier for MapLibre's dynamic tile cache. A
//                            bigger cache means a fast spin re-uses already-loaded
//                            tiles instead of evicting and re-downloading them,
//                            which is what causes transient gaps / black patches.
//   fadeDuration           — cross-fade time for a freshly-loaded tile over the
//                            parent tile it replaces, and for symbols fading in/out.
//                            A short fade keeps provider labels stable while the
//                            globe rotates; story pins control their own opacity.
//   antialias              — MSAA on the map context. The globe's silhouette against
//                            space crawls/shimmers while rotating without it; it is
//                            cheap on desktop GPUs but costly on weak mobile ones.
export interface MapTuning {
  pixelRatio: number;
  maxTileCacheZoomLevels: number;
  fadeDuration: number;
  antialias: boolean;
}

// Mirrors resolveSpaceQuality's device buckets so the globe and its backdrop step
// down together. Pure and DPR-injected so it is deterministic under test.
export function resolveMapTuning(
  capabilities: SpaceCapabilities,
  devicePixelRatio: number,
): MapTuning {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const memory = capabilities.deviceMemory;
  const weakMemory = memory !== undefined && memory <= 2;
  const strongMemory = memory === undefined || memory >= 6;
  const slowNetwork =
    capabilities.saveData ||
    capabilities.effectiveType === "slow-2g" ||
    capabilities.effectiveType === "2g";

  // Genuinely weak hardware / constrained network: smallest everything. Render at
  // 1x, keep the cache lean, no MSAA, and use a short label crossfade.
  const lowEnd = weakMemory || capabilities.hardwareConcurrency <= 2 || slowNetwork;
  if (lowEnd) {
    return { pixelRatio: Math.min(dpr, 1), maxTileCacheZoomLevels: 3, fadeDuration: 200, antialias: false };
  }

  // capable phones keep retina detail while modest devices retain the cheaper cap
  if (capabilities.coarsePointer) {
    const capable = capabilities.hardwareConcurrency >= 6 && strongMemory;
    return {
      pixelRatio: Math.min(dpr, capable ? 2 : 1.5),
      maxTileCacheZoomLevels: capable ? 5 : 4,
      fadeDuration: 200,
      antialias: capable,
    };
  }

  // Desktop: honour DPR up to 2 (retina), a generous cache, and MSAA for a clean
  // globe rim. Very large surfaces (4K+) keep DPR at 2 but a slightly leaner cache.
  const hugeSurface = capabilities.viewportPixels > 9_000_000;
  return {
    pixelRatio: Math.min(dpr, 2),
    maxTileCacheZoomLevels: hugeSurface ? 5 : 6,
    fadeDuration: 200,
    antialias: true,
  };
}
