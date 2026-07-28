import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LaunchOverlay } from "@/features/launch/launch-overlay";
import { dict } from "@/lib/i18n/dict";

// Minimal Canvas-2D stub — the BirthRenderer only draws (no reads), so no-op
// methods and a gradient with addColorStop are enough to let it initialise.
function make2dContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: vi.fn() };
  const ctx = {
    canvas: { width: 0, height: 0 },
    createRadialGradient: vi.fn(() => gradient),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    setTransform: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    fillStyle: "",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

let context: CanvasRenderingContext2D | null;

beforeEach(() => {
  context = make2dContext();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => context as unknown as ReturnType<HTMLCanvasElement["getContext"]>,
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  // No-op rAF so nothing loops during the test; the arc timeline itself is
  // covered deterministically in birth-timeline.test.ts.
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("LaunchOverlay", () => {
  it("renders the Loci brand over the launch canvas while loading", () => {
    render(<LaunchOverlay ready={false} onReveal={() => {}} onComplete={() => {}} />);

    expect(screen.getByText(dict.en.appName)).toBeInTheDocument();
    expect(screen.getByText(dict.en.launchTagline)).toBeInTheDocument();

    const root = document.querySelector(".lm-launch");
    expect(root).not.toBeNull();
    // still the birth arc — not yet crossfading out
    expect(root?.className).not.toContain("lm-launch--exit");
    expect(document.querySelector("canvas")).not.toBeNull();
  });

  it("degrades gracefully — lifts immediately if 2D canvas is unavailable", () => {
    context = null; // getContext returns null → renderer construction fails
    const onReveal = vi.fn();
    const onComplete = vi.fn();

    render(<LaunchOverlay ready={false} onReveal={onReveal} onComplete={onComplete} />);

    // never strand the user behind a broken curtain
    expect(onReveal).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
