import type { Map as MapLibreMap } from "maplibre-gl";

// Opt-in developer overlay for the globe. It is never mounted in production:
// map-view only constructs it when shouldEnableMapDiagnostics() is true, which
// requires an explicit `?debug=map` query flag or a localStorage opt-in. It reads
// the frame clock plus MapLibre's tile state and reports the numbers that matter
// when chasing rendering artifacts — FPS, frame time, tile counts by state, and
// the WebGL context status — so regressions can be measured rather than guessed.
export function shouldEnableMapDiagnostics(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("debug") === "map") return true;
    return window.localStorage.getItem("loci_map_debug") === "1";
  } catch {
    return false;
  }
}

interface TileStats {
  visible: number;
  loaded: number;
  loading: number;
  errored: number;
  cached: number;
}

interface TileManagerLike {
  _outOfViewCache?: { order?: string[] };
  getIds?: () => string[];
  getRenderableIds?: () => string[];
  getTileByID?: (id: string) => { state?: string } | undefined;
}

// MapLibre exposes no public tile-inventory API, so we reflect into its per-source
// tile managers behind a guard (v5's `style.tileManagers`, each a `TileManager`
// with `getIds`/`getTileByID`/`getRenderableIds` and an out-of-view `TileCache`).
// Everything is best-effort: a version bump that renames an internal only blanks
// the tile rows, it never throws into the render loop.
function collectTileStats(map: MapLibreMap): TileStats {
  const stats: TileStats = { visible: 0, loaded: 0, loading: 0, errored: 0, cached: 0 };
  try {
    const style = (map as unknown as { style?: { tileManagers?: Record<string, TileManagerLike> } }).style;
    const managers = style?.tileManagers;
    if (!managers) return stats;
    for (const manager of Object.values(managers)) {
      try {
        stats.visible += manager.getRenderableIds?.().length ?? 0;
        for (const id of manager.getIds?.() ?? []) {
          const state = manager.getTileByID?.(id)?.state;
          if (state === "loaded" || state === "expired") stats.loaded += 1;
          else if (state === "loading" || state === "reloading") stats.loading += 1;
          else if (state === "errored") stats.errored += 1;
        }
        stats.cached += manager._outOfViewCache?.order?.length ?? 0;
      } catch {
        // a single source can throw mid-style-swap; keep tallying the rest
      }
    }
  } catch {
    // no introspection available on this build
  }
  return stats;
}

function contextStatus(map: MapLibreMap): string {
  try {
    const painter = (map as unknown as { painter?: { context?: { gl?: WebGLRenderingContext } } }).painter;
    const gl = painter?.context?.gl;
    if (!gl) return "unknown";
    return gl.isContextLost() ? "LOST" : "ok";
  } catch {
    return "unknown";
  }
}

export class MapDiagnostics {
  private readonly map: MapLibreMap;
  private readonly element: HTMLElement;
  private readonly onRender = () => { this.renders += 1; };
  private frame = 0;
  private frames = 0;
  private renders = 0;
  private dropped = 0;
  private lastSampleAt = 0;
  private lastFrameAt = 0;
  private fps = 0;
  private worstFrame = 0;
  private disposed = false;

  constructor(map: MapLibreMap) {
    this.map = map;
    const element = document.createElement("div");
    element.dataset.testid = "map-diagnostics";
    element.style.cssText = [
      "position:absolute", "top:8px", "right:8px", "z-index:9999",
      "padding:8px 10px", "border-radius:8px", "pointer-events:none",
      "font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace",
      "color:#e6faff", "background:rgba(8,12,20,.82)", "white-space:pre",
      "box-shadow:0 1px 8px rgba(0,0,0,.4)", "letter-spacing:.02em",
    ].join(";");
    this.element = element;
    map.getContainer().appendChild(element);
    map.on("render", this.onRender);
    this.frame = window.requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    if (this.disposed) return;
    this.frames += 1;
    if (this.lastFrameAt > 0) {
      const delta = now - this.lastFrameAt;
      if (delta > this.worstFrame) this.worstFrame = delta;
      // count frames that missed a 60fps budget by more than half a frame
      if (delta > 24) this.dropped += 1;
    }
    this.lastFrameAt = now;

    if (this.lastSampleAt === 0) this.lastSampleAt = now;
    if (now - this.lastSampleAt >= 500) {
      this.fps = Math.round((this.frames * 1000) / (now - this.lastSampleAt));
      this.paint();
      this.frames = 0;
      this.renders = 0;
      this.worstFrame = 0;
      this.lastSampleAt = now;
    }
    this.frame = window.requestAnimationFrame(this.tick);
  };

  private paint(): void {
    const tiles = collectTileStats(this.map);
    const frameMs = this.fps > 0 ? (1000 / this.fps).toFixed(1) : "—";
    const rows = [
      `fps        ${this.fps.toString().padStart(3)}   ${frameMs}ms`,
      `worst      ${this.worstFrame.toFixed(0).padStart(3)}ms`,
      `dropped    ${this.dropped}`,
      `zoom       ${this.map.getZoom().toFixed(2)}`,
      `tiles vis  ${tiles.visible}`,
      `  loaded   ${tiles.loaded}`,
      `  loading  ${tiles.loading}`,
      `  errored  ${tiles.errored}`,
      `  cached   ${tiles.cached}`,
      `renders/s  ${this.renders * 2}`,
      `gl ctx     ${contextStatus(this.map)}`,
    ];
    this.element.textContent = rows.join("\n");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.frame) window.cancelAnimationFrame(this.frame);
    this.map.off("render", this.onRender);
    this.element.remove();
  }
}
