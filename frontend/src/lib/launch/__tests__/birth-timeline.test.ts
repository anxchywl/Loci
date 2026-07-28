import { describe, expect, it } from "vitest";

import type { SpaceCapabilities } from "@/lib/map/space-quality";
import {
  clamp01,
  easeInOutCubic,
  easeOutCubic,
  LAUNCH_TIMING,
  launchStageAt,
  resolveLaunchBudget,
  smoothstep,
} from "@/lib/launch/birth-timeline";

describe("launch easing helpers", () => {
  it("clamps to the unit interval", () => {
    expect(clamp01(-2)).toBe(0);
    expect(clamp01(0.3)).toBe(0.3);
    expect(clamp01(5)).toBe(1);
  });

  it("smoothstep is 0 below, 1 above, monotonic between", () => {
    expect(smoothstep(10, 20, 5)).toBe(0);
    expect(smoothstep(10, 20, 25)).toBe(1);
    expect(smoothstep(10, 20, 15)).toBeCloseTo(0.5, 5);
    expect(smoothstep(10, 20, 12)).toBeLessThan(smoothstep(10, 20, 18));
    // degenerate edges never divide by zero
    expect(smoothstep(10, 10, 9)).toBe(0);
    expect(smoothstep(10, 10, 11)).toBe(1);
  });

  it("cubic easings pin their endpoints and stay in range", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 5);
    for (const t of [0.1, 0.4, 0.7, 0.9]) {
      expect(easeOutCubic(t)).toBeGreaterThanOrEqual(0);
      expect(easeOutCubic(t)).toBeLessThanOrEqual(1);
    }
  });
});

describe("launchStageAt", () => {
  it("walks the beats in order across the arc", () => {
    const t = LAUNCH_TIMING;
    expect(launchStageAt(0)).toBe("void");
    expect(launchStageAt(t.voidMs - 1)).toBe("void");
    expect(launchStageAt(t.voidMs)).toBe("spark");
    expect(launchStageAt(t.sparkMs)).toBe("expanding");
    expect(launchStageAt(t.expandMs)).toBe("settling");
    expect(launchStageAt(t.settleMs)).toBe("earth");
    expect(launchStageAt(t.earthMs)).toBe("logo");
    expect(launchStageAt(t.coreMs + 1000)).toBe("logo");
  });

  it("is monotonic — a stage never regresses as time advances", () => {
    const order = ["void", "spark", "expanding", "settling", "earth", "logo"];
    let last = -1;
    for (let ms = 0; ms <= LAUNCH_TIMING.coreMs; ms += 20) {
      const idx = order.indexOf(launchStageAt(ms));
      expect(idx).toBeGreaterThanOrEqual(last);
      last = idx;
    }
  });
});

function caps(overrides: Partial<SpaceCapabilities> = {}): SpaceCapabilities {
  return {
    coarsePointer: false,
    deviceMemory: 8,
    effectiveType: "4g",
    hardwareConcurrency: 8,
    reducedMotion: false,
    saveData: false,
    viewportPixels: 2_000_000,
    ...overrides,
  };
}

describe("resolveLaunchBudget", () => {
  it("gives a capable desktop the animated ultra tier", () => {
    const budget = resolveLaunchBudget(caps());
    expect(budget.level).toBe("ultra");
    expect(budget.animate).toBe(true);
    expect(budget.starCount).toBeGreaterThan(0);
    expect(budget.dustCount).toBeGreaterThan(0);
  });

  it("paints a static frame for reduced motion — no arc, no dust", () => {
    const budget = resolveLaunchBudget(caps({ reducedMotion: true }));
    expect(budget.animate).toBe(false);
    expect(budget.dustCount).toBe(0);
    // stars still drawn (a settled sky), just not animated
    expect(budget.starCount).toBeGreaterThan(0);
  });

  it("drops weak hardware to the static low tier", () => {
    const budget = resolveLaunchBudget(caps({ hardwareConcurrency: 2, deviceMemory: 2 }));
    expect(budget.level).toBe("low");
    expect(budget.animate).toBe(false);
  });

  it("thins the star field on very large surfaces", () => {
    const normal = resolveLaunchBudget(caps(), 2_000_000);
    const huge = resolveLaunchBudget(caps(), 8_000_000);
    expect(huge.starCount).toBeLessThan(normal.starCount);
  });
});
