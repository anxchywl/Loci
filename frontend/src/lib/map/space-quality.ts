export type SpaceQualityLevel = "ultra" | "high" | "medium" | "low" | "fallback";

export interface SpaceCapabilities {
  coarsePointer: boolean;
  deviceMemory?: number;
  effectiveType?: string;
  hardwareConcurrency: number;
  reducedMotion: boolean;
  saveData: boolean;
  viewportPixels: number;
}

export interface SpaceQualityConfig {
  atmosphereBlend: number;
  idleFps: number;
  maxFps: number;
  minRenderScale: number;
  pixelRatioCap: number;
  starCount: number;
  /** Fragment-shader nebula octaves — higher is richer dust structure. */
  nebulaOctaves: number;
  twinkle: number;
  /** Nebula (Milky Way band) brightness multiplier. */
  haze: number;
}

export const SPACE_QUALITY_CONFIG: Record<Exclude<SpaceQualityLevel, "fallback">, SpaceQualityConfig> = {
  ultra: {
    atmosphereBlend: 0.62,
    idleFps: 8,
    maxFps: 120,
    minRenderScale: 0.7,
    pixelRatioCap: 2,
    starCount: 16_000,
    nebulaOctaves: 5,
    twinkle: 0.035,
    haze: 1.15,
  },
  high: {
    atmosphereBlend: 0.48,
    idleFps: 6,
    maxFps: 60,
    minRenderScale: 0.65,
    pixelRatioCap: 1.5,
    starCount: 9_000,
    nebulaOctaves: 4,
    twinkle: 0.028,
    haze: 1.0,
  },
  medium: {
    atmosphereBlend: 0.3,
    idleFps: 4,
    maxFps: 60,
    minRenderScale: 0.6,
    pixelRatioCap: 1,
    starCount: 3_500,
    nebulaOctaves: 3,
    twinkle: 0.02,
    haze: 0.8,
  },
  low: {
    atmosphereBlend: 0.12,
    idleFps: 0,
    maxFps: 0,
    minRenderScale: 1,
    pixelRatioCap: 1,
    starCount: 0,
    nebulaOctaves: 0,
    twinkle: 0,
    haze: 0,
  },
};

export function detectSpaceCapabilities(): SpaceCapabilities {
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  }).connection;
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  return {
    coarsePointer: window.matchMedia?.("(pointer: coarse)").matches ?? false,
    deviceMemory,
    effectiveType: connection?.effectiveType,
    hardwareConcurrency: navigator.hardwareConcurrency || 2,
    reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    saveData: connection?.saveData ?? false,
    viewportPixels: width * height * pixelRatio * pixelRatio,
  };
}

// Fully automatic — there is no user-facing quality control. We pick the richest
// tier a device can plausibly sustain from its reported capabilities, and the
// renderer's runtime adapter quietly steps down (render scale -> star count ->
// nebula -> static) if real frame timing can't keep up. So this only has to be
// roughly right: over-shooting self-corrects, it never locks a device into jank.
export function resolveSpaceQuality(
  capabilities: SpaceCapabilities,
): Exclude<SpaceQualityLevel, "fallback"> {
  // Accessibility and data/network constraints always win: static backdrop.
  if (capabilities.reducedMotion) return "low";
  if (
    capabilities.saveData ||
    capabilities.effectiveType === "slow-2g" ||
    capabilities.effectiveType === "2g"
  ) {
    return "low";
  }

  const memory = capabilities.deviceMemory;
  const weakMemory = memory !== undefined && memory <= 2;
  const strongMemory = memory === undefined || memory >= 6;

  // Genuinely weak hardware: static backdrop rather than a laggy animation.
  if (weakMemory || capabilities.hardwareConcurrency <= 2) return "low";

  // Phones / tablets (coarse pointer): capable ones get the full animated sky,
  // the rest a lighter animated tier. Never ultra — save their battery/thermals.
  if (capabilities.coarsePointer) {
    return capabilities.hardwareConcurrency >= 6 && strongMemory ? "high" : "medium";
  }

  // Desktop: strong machines at a sane resolution get ultra; very high-DPI or
  // 4K+ surfaces (a lot of fullscreen shader pixels) stay at high.
  if (
    capabilities.hardwareConcurrency >= 8 &&
    strongMemory &&
    capabilities.viewportPixels <= 8_300_000
  ) {
    return "ultra";
  }
  return capabilities.viewportPixels > 9_000_000 ? "medium" : "high";
}
