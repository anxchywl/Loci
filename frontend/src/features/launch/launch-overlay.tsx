"use client";

import { useEffect, useRef, useState } from "react";

import { AppIcon } from "@/components/app-icon";
import { BirthRenderer } from "@/lib/launch/birth-renderer";
import { LAUNCH_TIMING, type LaunchStage } from "@/lib/launch/birth-timeline";
import { useDict } from "@/lib/i18n/use-dict";

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface LaunchOverlayProps {
  /** True once the map/globe is interactive (or has settled into an error). */
  ready: boolean;
  /** Fired the instant the reveal (exit crossfade) begins. */
  onReveal: () => void;
  /** Fired once the sequence has fully faded out and can be unmounted. */
  onComplete: () => void;
}

// The birth-of-a-world curtain. Mounts over the (already loading) map, plays the
// void→spark→expansion→Earth→Loci arc, then crossfades to reveal the live globe.
// The animation *is* the loading experience: no spinner, no progress bar.
export function LaunchOverlay({ ready, onReveal, onComplete }: LaunchOverlayProps) {
  const t = useDict();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<BirthRenderer | null>(null);
  const callbacks = useRef({ onReveal, onComplete });
  callbacks.current = { onReveal, onComplete };

  const [showLogo, setShowLogo] = useState(false);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: BirthRenderer;
    try {
      renderer = new BirthRenderer(canvas, {
        reducedMotion: prefersReducedMotion(),
        onStage: (stage: LaunchStage) => {
          if (stage === "logo") {
            setShowLogo(true);
          } else if (stage === "exit") {
            setExiting(true);
            callbacks.current.onReveal();
          }
        },
        onDone: () => callbacks.current.onComplete(),
      });
    } catch {
      // Canvas unavailable — don't strand the user behind a broken curtain.
      callbacks.current.onReveal();
      callbacks.current.onComplete();
      return;
    }
    rendererRef.current = renderer;
    renderer.start();

    // Backstop for the reduced-motion path (which idles without a RAF loop): if
    // "ready" never arrives, lift the curtain anyway rather than hold forever.
    const safety = window.setTimeout(() => renderer.markReady(), LAUNCH_TIMING.maxHoldMs);

    return () => {
      window.clearTimeout(safety);
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (ready) rendererRef.current?.markReady();
  }, [ready]);

  return (
    <div
      aria-hidden="true"
      className={`lm-launch pointer-events-none fixed inset-0 z-[60] ${exiting ? "lm-launch--exit" : ""}`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className={`lm-launch__brand ${showLogo ? "lm-launch__brand--in" : ""}`}>
        <span className="lm-launch__mark text-white">
          <AppIcon size={34} />
        </span>
        <span className="lm-launch__word">{t.appName}</span>
        <span className="lm-launch__tagline">{t.launchTagline}</span>
      </div>
    </div>
  );
}
