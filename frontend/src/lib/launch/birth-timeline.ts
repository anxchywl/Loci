import {
  detectSpaceCapabilities,
  resolveSpaceQuality,
  type SpaceCapabilities,
} from "@/lib/map/space-quality";

// The launch is an *artistic* birth-of-a-world — void → spark → expansion →
// Milky Way → Earth → Loci — not a physics sim. This module holds the pure timing
// math so the choreography can be reasoned about and unit-tested away from the
// canvas/RAF machinery in birth-renderer.ts.

export type LaunchStage =
  | "void"
  | "spark"
  | "expanding"
  | "settling"
  | "earth"
  | "logo"
  | "exit"
  | "done";

// Phase-END offsets (ms from start), strictly increasing, for the core emotional
// arc. Each value is the moment its phase finishes and the next begins. The arc
// runs to coreMs and then *holds* on the finished Earth+logo until the app signals
// it is ready — so a slow load never truncates the story and a fast load never has
// to wait past the arc. Tuned to land the whole birth in ~1.5s.
export const LAUNCH_TIMING = {
  voidMs: 160, // void → spark
  sparkMs: 360, // spark → expansion
  expandMs: 900, // expansion → settling
  settleMs: 1200, // settling → Earth
  earthMs: 1380, // Earth → logo
  coreMs: 1500, // logo fully in; hold begins
  exitMs: 720,
  // Hard ceiling: if the map never reports ready (offline/error), the overlay
  // still gets out of the way instead of trapping the user on the intro.
  maxHoldMs: 8000,
} as const;

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function easeOutCubic(t: number): number {
  const c = clamp01(t);
  return 1 - Math.pow(1 - c, 3);
}

export function easeInOutCubic(t: number): number {
  const c = clamp01(t);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

// Which beat of the intro a given elapsed time falls on. Stages are monotonic, so
// the renderer can fire an `onStage` callback each time this crosses a boundary.
export function launchStageAt(elapsedMs: number): LaunchStage {
  const t = LAUNCH_TIMING;
  if (elapsedMs < t.voidMs) return "void";
  if (elapsedMs < t.sparkMs) return "spark";
  if (elapsedMs < t.expandMs) return "expanding";
  if (elapsedMs < t.settleMs) return "settling";
  if (elapsedMs < t.earthMs) return "earth";
  return "logo";
}

export type LaunchQualityLevel = "ultra" | "high" | "medium" | "low";

export interface LaunchBudget {
  level: LaunchQualityLevel;
  /** Screen-space stars that stream out of the spark and stay as the sky. */
  starCount: number;
  /** Short-lived cosmic-dust motes that burst outward and fade. */
  dustCount: number;
  /** Whether to run the animated arc at all, or paint a single settled frame. */
  animate: boolean;
  /** Nebula/Milky-Way band brightness multiplier. */
  haze: number;
}

const BUDGETS: Record<LaunchQualityLevel, Omit<LaunchBudget, "level" | "animate">> = {
  ultra: { starCount: 1300, dustCount: 120, haze: 1.0 },
  high: { starCount: 850, dustCount: 78, haze: 0.9 },
  medium: { starCount: 480, dustCount: 40, haze: 0.75 },
  low: { starCount: 220, dustCount: 0, haze: 0.55 },
};

// Reuse the map's space-quality heuristic (device memory, cores, DPR, reduced
// motion, save-data) so the launch and the live starfield agree on how much a
// device can afford. reduced-motion / low tiers paint a static settled frame
// instead of animating — the birth still *reads*, it just doesn't move.
export function resolveLaunchBudget(
  capabilities: SpaceCapabilities = detectSpaceCapabilities(),
  viewportPixels = capabilities.viewportPixels,
): LaunchBudget {
  // resolveSpaceQuality never returns "fallback" (that's a runtime step-down), so
  // its result maps directly onto the launch quality tiers.
  const level: LaunchQualityLevel = resolveSpaceQuality(capabilities);
  const budget = BUDGETS[level];
  // Thin the star field on very large surfaces so a 5K canvas doesn't draw twice
  // the sprites for the same on-screen density.
  const scale = viewportPixels > 6_000_000 ? 0.7 : 1;
  const animate = !capabilities.reducedMotion && level !== "low";
  return {
    level,
    animate,
    haze: budget.haze,
    starCount: Math.round(budget.starCount * scale),
    dustCount: animate ? budget.dustCount : 0,
  };
}
