import {
  clamp01,
  easeInOutCubic,
  easeOutCubic,
  LAUNCH_TIMING,
  launchStageAt,
  resolveLaunchBudget,
  smoothstep,
  type LaunchBudget,
  type LaunchStage,
} from "@/lib/launch/birth-timeline";

// Canvas-2D renderer for the birth-of-a-world launch. Deliberately not WebGL: the
// whole sequence is ~1.5s of a few hundred additive sprites plus a handful of
// radial gradients, which Canvas-2D handles at 60fps everywhere and degrades
// gracefully — no shader compile, no context-loss handling, no download. The live
// starfield behind the map keeps its richer WebGL renderer; this is the curtain
// that lifts to reveal it.

interface Star {
  angle: number;
  // final radius as a fraction of the screen half-diagonal
  radius: number;
  size: number;
  brightness: number;
  // 0 warm → 1 cool, matching the live starfield's temperature ramp
  temperature: number;
  twinklePhase: number;
  twinkleSpeed: number;
}

interface Dust {
  angle: number;
  speed: number;
  size: number;
  life: number;
  delay: number;
}

type RenderState = "intro" | "hold" | "exit" | "done";

export interface BirthRendererOptions {
  reducedMotion?: boolean;
  onStage?: (stage: LaunchStage) => void;
  onDone?: () => void;
}

// Deep-space base, matched to `.lm-map-space` in globals.css so the moment the
// overlay fades the backdrop colour is already identical behind it.
const SPACE_BASE = "#02030a";

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// A soft round sprite (bright core + falloff) drawn once and blitted per star, far
// cheaper and smoother than an arc()+fill() per star every frame.
function createStarSprite(): HTMLCanvasElement {
  const size = 32;
  const sprite = document.createElement("canvas");
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.55)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return sprite;
}

function temperatureColor(temperature: number): [number, number, number] {
  // warm → neutral → cool, the same ramp the live starfield uses
  const warm: [number, number, number] = [255, 184, 128];
  const neutral: [number, number, number] = [255, 245, 224];
  const cool: [number, number, number] = [168, 199, 255];
  const mix = (a: number[], b: number[], t: number) =>
    [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] as [number, number, number];
  return temperature < 0.5
    ? mix(warm, neutral, temperature * 2)
    : mix(neutral, cool, (temperature - 0.5) * 2);
}

export class BirthRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly budget: LaunchBudget;
  private readonly reducedMotion: boolean;
  private readonly onStage?: (stage: LaunchStage) => void;
  private readonly onDone?: () => void;
  private readonly stars: Star[];
  private readonly dust: Dust[];
  private readonly sprite: HTMLCanvasElement;
  private readonly resizeObserver: ResizeObserver;

  private width = 0;
  private height = 0;
  private dpr = 1;
  private startTime = 0;
  private exitStart = 0;
  private state: RenderState = "intro";
  private readyPending = false;
  private lastStage: LaunchStage | null = null;
  private frame = 0;

  constructor(canvas: HTMLCanvasElement, options: BirthRendererOptions = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("launch canvas 2d unavailable");
    this.ctx = ctx;
    this.reducedMotion = options.reducedMotion ?? false;
    this.budget = resolveLaunchBudget();
    this.onStage = options.onStage;
    this.onDone = options.onDone;
    this.sprite = createStarSprite();

    const random = seededRandom(0x4c4f4349);
    this.stars = Array.from({ length: this.budget.starCount }, () => ({
      angle: random() * Math.PI * 2,
      // bias density toward the centre so the field reads as emanating from the
      // spark, while still reaching the corners
      radius: 0.05 + Math.pow(random(), 0.7) * 1.05,
      size: 0.7 + Math.pow(random(), 3) * 2.6,
      brightness: 0.35 + Math.pow(random(), 2.2) * 0.65,
      temperature: random(),
      twinklePhase: random() * Math.PI * 2,
      twinkleSpeed: 0.6 + random() * 1.6,
    }));
    this.dust = Array.from({ length: this.budget.dustCount }, () => ({
      angle: random() * Math.PI * 2,
      speed: 0.5 + random() * 0.9,
      size: 0.8 + random() * 1.8,
      life: 0.45 + random() * 0.4,
      delay: random() * 0.18,
    }));

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  start(): void {
    this.startTime = performance.now();
    if (!this.animates) {
      // Reduced-motion / low tier: no arc, no RAF. Paint the settled world once
      // and jump straight to the held logo state, then wait for ready.
      this.emitStage("logo");
      this.state = "hold";
      this.renderStatic();
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
  }

  // Signal that the app is ready. Exits after the core arc finishes (or at once if
  // it already has), so a fast load never cuts the birth short mid-expansion.
  markReady(): void {
    if (this.state === "intro") {
      this.readyPending = true;
    } else if (this.state === "hold") {
      this.beginExit();
    }
  }

  dispose(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.resizeObserver.disconnect();
    this.state = "done";
  }

  private get animates(): boolean {
    return this.budget.animate && !this.reducedMotion;
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.dpr = dpr;
    this.width = width;
    this.height = height;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    if (this.state === "hold" && !this.animates) this.renderStatic();
  }

  private emitStage(stage: LaunchStage): void {
    if (this.lastStage === stage) return;
    this.lastStage = stage;
    this.onStage?.(stage);
  }

  private beginExit(): void {
    this.state = "exit";
    this.exitStart = performance.now();
    this.emitStage("exit");
    if (!this.frame) this.frame = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    this.frame = 0;
    if (this.state === "done") return;
    const elapsed = now - this.startTime;

    if (this.state === "intro") {
      this.emitStage(launchStageAt(elapsed));
      if (elapsed >= LAUNCH_TIMING.coreMs) {
        if (this.readyPending) this.beginExit();
        else this.state = "hold";
      }
    } else if (this.state === "hold") {
      // Safety valve: never hold on the intro forever if ready never arrives.
      if (elapsed >= LAUNCH_TIMING.maxHoldMs) this.beginExit();
    }

    let exitProgress = 0;
    if (this.state === "exit") {
      exitProgress = clamp01((now - this.exitStart) / LAUNCH_TIMING.exitMs);
    }

    this.render(elapsed, now, exitProgress);

    if (this.state === "exit" && exitProgress >= 1) {
      this.state = "done";
      this.emitStage("done");
      this.onDone?.();
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  private renderStatic(): void {
    // Settled frame for reduced motion: everything at its final resting state.
    this.render(LAUNCH_TIMING.coreMs, this.startTime || performance.now(), 0);
  }

  private render(elapsed: number, now: number, exitProgress: number): void {
    const { ctx } = this;
    const w = this.width;
    const h = this.height;
    const cx = w / 2;
    const cy = h / 2;
    const diag = Math.hypot(w, h) / 2;
    const twinkleT = this.animates ? now / 1000 : 0;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    this.paintSpace(cx, cy, w, h);

    // Progress signals for each element, all derived from a single clock. The
    // windows overlap the phase boundaries slightly so nothing snaps on.
    const T = LAUNCH_TIMING;
    const expand = easeOutCubic(smoothstep(T.sparkMs, T.expandMs, elapsed));
    const starOpacity = smoothstep(T.sparkMs, T.expandMs - 100, elapsed);
    const hazeOpacity = smoothstep(T.expandMs - 120, T.settleMs, elapsed);
    const earthGrow = easeOutCubic(smoothstep(T.settleMs - 260, T.earthMs + 80, elapsed));
    const sparkGlow = smoothstep(T.voidMs, T.sparkMs, elapsed);

    ctx.globalCompositeOperation = "lighter";

    this.paintMilkyWay(cx, cy, diag, hazeOpacity);
    if (this.budget.dustCount > 0) this.paintDust(cx, cy, diag, elapsed);
    this.paintStars(cx, cy, diag, expand, starOpacity, twinkleT);
    this.paintShockwave(cx, cy, diag, elapsed);
    this.paintSpark(cx, cy, sparkGlow, earthGrow, elapsed);

    if (earthGrow > 0.001) {
      // ~matches the live globe's on-screen radius at the fully-zoomed-out
      // first-visit camera, so the exit crossfade lands close to seamless.
      const earthRadius = Math.min(w, h) * 0.34 * earthGrow;
      // A breath of atmospheric life on the settled planet + a gentle bloom as it
      // hands off to the live globe on exit.
      const breathe = this.animates ? 1 + Math.sin(now / 1400) * 0.012 : 1;
      const exitBloom = 1 + easeInOutCubic(exitProgress) * 0.06;
      this.paintEarth(cx, cy, earthRadius * breathe * exitBloom, now);
    }

    ctx.globalCompositeOperation = "source-over";
  }

  private paintSpace(cx: number, cy: number, w: number, h: number): void {
    const { ctx } = this;
    ctx.fillStyle = SPACE_BASE;
    ctx.fillRect(0, 0, w, h);
    // The two faint tints from `.lm-map-space`, so the base matches on handoff.
    const tintA = ctx.createRadialGradient(w * 0.28, h * 0.18, 0, w * 0.28, h * 0.18, Math.max(w, h) * 0.9);
    tintA.addColorStop(0, "rgba(46,52,82,0.20)");
    tintA.addColorStop(0.58, "rgba(46,52,82,0)");
    ctx.fillStyle = tintA;
    ctx.fillRect(0, 0, w, h);
    const tintB = ctx.createRadialGradient(w * 0.76, h * 0.82, 0, w * 0.76, h * 0.82, Math.max(w, h) * 0.8);
    tintB.addColorStop(0, "rgba(58,42,66,0.16)");
    tintB.addColorStop(0.55, "rgba(58,42,66,0)");
    ctx.fillStyle = tintB;
    ctx.fillRect(0, 0, w, h);
  }

  private paintMilkyWay(cx: number, cy: number, diag: number, opacity: number): void {
    if (opacity <= 0.001) return;
    const { ctx } = this;
    const alpha = opacity * this.budget.haze;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.42);
    ctx.scale(1, 0.36);
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, diag * 1.25);
    glow.addColorStop(0, `rgba(150,160,205,${0.22 * alpha})`);
    glow.addColorStop(0.4, `rgba(120,120,160,${0.12 * alpha})`);
    glow.addColorStop(1, "rgba(120,120,160,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, diag * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private paintStars(
    cx: number,
    cy: number,
    diag: number,
    expand: number,
    opacity: number,
    twinkleT: number,
  ): void {
    if (opacity <= 0.001) return;
    const { ctx, sprite } = this;
    const travel = 0.12 + expand * 0.88;
    for (const star of this.stars) {
      const radius = star.radius * diag * travel;
      const x = cx + Math.cos(star.angle) * radius;
      const y = cy + Math.sin(star.angle) * radius;
      const shimmer = 1 + Math.sin(twinkleT * star.twinkleSpeed + star.twinklePhase) * 0.28;
      const alpha = clamp01(star.brightness * shimmer * opacity);
      if (alpha <= 0.01) continue;
      const [r, g, b] = temperatureColor(star.temperature);
      const drawSize = Math.max(1.5, star.size * (0.7 + expand * 0.5)) * 2.4;
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, x - drawSize / 2, y - drawSize / 2, drawSize, drawSize);
      if (star.temperature < 0.42 || star.temperature > 0.58) {
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(0.6, drawSize * 0.14), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  private paintDust(cx: number, cy: number, diag: number, elapsed: number): void {
    const { ctx, sprite } = this;
    const T = LAUNCH_TIMING;
    for (const mote of this.dust) {
      const local = smoothstep(T.sparkMs, T.expandMs + mote.life * 600, elapsed) - mote.delay;
      if (local <= 0 || local >= 1) continue;
      const eased = easeOutCubic(local);
      const radius = eased * diag * mote.speed;
      const x = cx + Math.cos(mote.angle) * radius;
      const y = cy + Math.sin(mote.angle) * radius;
      const alpha = Math.sin(local * Math.PI) * 0.5;
      const size = mote.size * 3;
      ctx.globalAlpha = alpha;
      ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  private paintShockwave(cx: number, cy: number, diag: number, elapsed: number): void {
    const T = LAUNCH_TIMING;
    const local = smoothstep(T.sparkMs - 40, T.expandMs, elapsed);
    if (local <= 0 || local >= 1) return;
    const { ctx } = this;
    const eased = easeOutCubic(local);
    const radius = eased * diag * 1.1;
    const alpha = (1 - local) * 0.5;
    const ring = ctx.createRadialGradient(cx, cy, radius * 0.55, cx, cy, radius);
    ring.addColorStop(0, "rgba(120,150,220,0)");
    ring.addColorStop(0.72, `rgba(150,180,255,${alpha * 0.5})`);
    ring.addColorStop(0.9, `rgba(220,232,255,${alpha})`);
    ring.addColorStop(1, "rgba(220,232,255,0)");
    ctx.fillStyle = ring;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  private paintSpark(cx: number, cy: number, glow: number, earthGrow: number, elapsed: number): void {
    // The seed of light. Blazes up in the spark beat, then dims as it condenses
    // into the forming Earth so the two never double-expose.
    const intensity = glow * (1 - earthGrow);
    if (intensity <= 0.001) return;
    const { ctx } = this;
    const T = LAUNCH_TIMING;
    const swell = smoothstep(T.voidMs, T.expandMs, elapsed);
    const coreR = (6 + swell * 26) * (0.6 + intensity * 0.4);
    const haloR = coreR * (5 + swell * 6);
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, haloR);
    halo.addColorStop(0, `rgba(235,242,255,${0.55 * intensity})`);
    halo.addColorStop(0.25, `rgba(170,195,255,${0.28 * intensity})`);
    halo.addColorStop(1, "rgba(120,150,220,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
    ctx.fill();
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    core.addColorStop(0, `rgba(255,255,255,${intensity})`);
    core.addColorStop(0.6, `rgba(255,255,255,${0.7 * intensity})`);
    core.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();
  }

  private paintEarth(cx: number, cy: number, radius: number, now: number): void {
    const { ctx } = this;
    // Atmospheric rim glow, matched to the live globe's blue halo, so on the exit
    // crossfade the ring around the planet reads as the same object.
    ctx.globalCompositeOperation = "lighter";
    const atmosphere = ctx.createRadialGradient(cx, cy, radius * 0.9, cx, cy, radius * 1.24);
    atmosphere.addColorStop(0, "rgba(90,150,255,0)");
    atmosphere.addColorStop(0.6, "rgba(96,160,255,0.3)");
    atmosphere.addColorStop(0.85, "rgba(130,185,255,0.14)");
    atmosphere.addColorStop(1, "rgba(130,185,255,0)");
    ctx.fillStyle = atmosphere;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.24, 0, Math.PI * 2);
    ctx.fill();

    // The sphere itself: a dark slate globe (matching the map's dark basemap) lit
    // from the upper-right, with a soft terminator into shadow.
    ctx.globalCompositeOperation = "source-over";
    const lightX = cx + radius * 0.42;
    const lightY = cy - radius * 0.42;
    const body = ctx.createRadialGradient(lightX, lightY, radius * 0.1, cx, cy, radius * 1.05);
    body.addColorStop(0, "#3a5064");
    body.addColorStop(0.4, "#26323d");
    body.addColorStop(0.75, "#1b232b");
    body.addColorStop(1, "#0e141a");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Faint drifting cloud/landmass mottle so the planet feels alive, not a
    // billiard ball. Clipped to the sphere, additive, very low contrast.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalCompositeOperation = "lighter";
    const drift = this.animates ? (now / 26000) % (Math.PI * 2) : 0.6;
    for (let i = 0; i < 5; i += 1) {
      const a = drift + (i / 5) * Math.PI * 2;
      const bx = cx + Math.cos(a) * radius * 0.42;
      const by = cy + Math.sin(a * 1.3) * radius * 0.34;
      const br = radius * (0.42 + (i % 3) * 0.12);
      const blob = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      blob.addColorStop(0, "rgba(120,150,175,0.10)");
      blob.addColorStop(1, "rgba(120,150,175,0)");
      ctx.fillStyle = blob;
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fill();
    }
    // Terminator: deepen the lower-left into shadow for spherical volume.
    ctx.globalCompositeOperation = "source-over";
    const shade = ctx.createRadialGradient(
      cx - radius * 0.5,
      cy + radius * 0.5,
      radius * 0.2,
      cx - radius * 0.3,
      cy + radius * 0.3,
      radius * 1.3,
    );
    shade.addColorStop(0, "rgba(6,9,14,0.55)");
    shade.addColorStop(1, "rgba(6,9,14,0)");
    ctx.fillStyle = shade;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
  }
}
