import maplibregl, {
  type FillLayerSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";

import { categoryPinSvg } from "@/lib/icons/category-glyphs";
import type { CategorySlug, Locale } from "@/lib/i18n/dict";
import { resolveMapTuning } from "@/lib/map/map-tuning";
import { detectSpaceCapabilities, SPACE_QUALITY_CONFIG, type SpaceQualityLevel } from "@/lib/map/space-quality";

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
// both themes share the same label and feature rules; dark mode changes paints
export const MAP_STYLE_DARK_URL = MAP_STYLE_URL;
export const MAP_STYLE_BRIGHT_URL = "https://tiles.openfreemap.org/styles/positron";

// open on a human-scale regional view so europe fits without feeling planetary
export const DEFAULT_CENTER: [number, number] = [28, 52];
export const DEFAULT_ZOOM = 3;
export const MIN_ZOOM = 2;
const MOBILE_MIN_ZOOM = 1;
// First-time visitors are revealed the whole planet at a random longitude (the
// launch sequence "births" the Earth, then hands off to this camera — Phase 9), so
// two people never open on the same face. A gentle northern bias frames more land.
const FIRST_VISIT_LATITUDE = 12;
function randomFirstVisitCenter(): [number, number] {
  return [Math.random() * 360 - 180, FIRST_VISIT_LATITUDE];
}

export interface CategoryStyle {
  id: number;
  slug: CategorySlug;
  color: string;
}

export type MapLabelDensity = "none" | "countries" | "all";

const COLORED_LANDCOVER_LAYERS: FillLayerSpecification[] = [
  {
    id: "loci-colored-wood",
    type: "fill",
    source: "openmaptiles",
    "source-layer": "landcover",
    filter: ["==", ["get", "class"], "wood"],
    paint: { "fill-color": "#b8d9b4", "fill-opacity": 0.8 },
  },
  {
    id: "loci-colored-grass",
    type: "fill",
    source: "openmaptiles",
    "source-layer": "landcover",
    filter: ["==", ["get", "class"], "grass"],
    paint: { "fill-color": "#d8e8c8", "fill-opacity": 0.8 },
  },
  {
    id: "loci-colored-sand",
    type: "fill",
    source: "openmaptiles",
    "source-layer": "landcover",
    filter: ["==", ["get", "class"], "sand"],
    paint: { "fill-color": "#eadfbd", "fill-opacity": 0.85 },
  },
];

function setColoredLandcoverLayers(map: MapLibreMap, colored: boolean): void {
  if (!colored) {
    for (const layer of COLORED_LANDCOVER_LAYERS) {
      if (map.getLayer(layer.id)) map.removeLayer(layer.id);
    }
    return;
  }
  if (!map.getSource("openmaptiles")) return;
  const beforeId = map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
  for (const layer of COLORED_LANDCOVER_LAYERS) {
    if (!map.getLayer(layer.id)) map.addLayer(layer, beforeId);
  }
}

export function applyMapAppearance(map: MapLibreMap, colored: boolean, animate = true): void {
  setColoredLandcoverLayers(map, colored);
  if (!colored) return;
  const paints: Array<[string, string, string]> = [
    ["background", "background-color", "#d9e7d1"],
    ["water", "fill-color", "#67c4da"],
    ["park", "fill-color", "#b7ddb0"],
    ["landcover_wood", "fill-color", "#acd5a8"],
    ["loci-colored-wood", "fill-color", "#b8d9b4"],
    ["loci-colored-grass", "fill-color", "#d8e8c8"],
    ["loci-colored-sand", "fill-color", "#eadfbd"],
    ["landcover_ice_shelf", "fill-color", "#edf7f8"],
    ["landcover_glacier", "fill-color", "#edf7f8"],
    ["landuse_residential", "fill-color", "#eeeade"],
    ["building", "fill-color", "#e7e0d3"],
    ["waterway", "line-color", "#55abc4"],
    ["boundary_3", "line-color", "#abb2ac"],
    ["boundary_2", "line-color", "#858e88"],
    ["highway_path", "line-color", "#d2cabd"],
    ["highway_minor", "line-color", "#fffaf0"],
    ["highway_major_casing", "line-color", "#d8d0c2"],
    ["highway_major_inner", "line-color", "#fffaf0"],
    ["highway_motorway_casing", "line-color", "#d5ad68"],
    ["highway_motorway_inner", "line-color", "#f5ce86"],
  ];
  for (const [layer, property, value] of paints) {
    if (!map.getLayer(layer)) continue;
    map.setPaintProperty(layer, `${property}-transition`, animate ? THEME_TRANSITION : { duration: 0, delay: 0 });
    map.setPaintProperty(layer, property, value);
  }
}

// Paint property to apply. `setProp` lets applyMapTheme route the same overrides
// through a transition-enabled setter so the light/dark swap animates smoothly.
type PaintSetter = (layerId: string, prop: string, value: unknown) => void;

function darkPaintFor(layer: { id: string; type: string }): Array<[string, unknown]> {
  // Lifted off pure black so the globe reads as a distinct dark-slate sphere
  // against deep space instead of blending into it.
  if (layer.type === "background") return [["background-color", "#1b232b"]];
  const id = layer.id.toLowerCase();
  if (layer.type === "fill") {
    const isBuilding = id.includes("building") || id.includes("residential");
    const color = id.includes("water")
      ? "#2f434e"
      : id.includes("park") || id.includes("wood") || id.includes("forest")
        ? "#28352f"
        : isBuilding
          ? "#242a31"
          : "#2b333c";
    // positron gives buildings a light fill-outline-color (rgb(219,219,218));
    // left untouched it glows near-white on dark, so tint it just above the fill
    // for a subtle edge instead of a bright outline
    return isBuilding
      ? [["fill-color", color], ["fill-outline-color", "#333b43"]]
      : [["fill-color", color]];
  }
  if (layer.type === "line") {
    const color = id.includes("boundary") ? "#4a525b" : id.includes("water") ? "#3d5765" : "#3a414a";
    return [["line-color", color], ["line-opacity", 0.8]];
  }
  if (layer.type === "symbol") {
    return [
      ["text-color", "#ffffff"],
      ["text-halo-color", "#121416"],
      ["text-halo-width", 0.75],
      ["text-halo-blur", 0],
    ];
  }
  return [];
}

export function applyDarkMapAppearance(map: MapLibreMap, setProp?: PaintSetter): void {
  const set: PaintSetter = setProp ?? ((id, prop, value) => map.setPaintProperty(id, prop, value));
  for (const layer of map.getStyle().layers ?? []) {
    try {
      for (const [prop, value] of darkPaintFor(layer)) set(layer.id, prop, value);
    } catch {
      // provider-owned layers can reject paint overrides
    }
  }
}

// Snapshot of the untouched (light) paints, captured once per map before any dark
// override so we can restore the exact light appearance without reloading tiles.
const BASE_APPEARANCE = new WeakMap<MapLibreMap, Record<string, Array<[string, unknown]>>>();
const THEME_TRANSITION = { duration: 200, delay: 0 };

// Decide light vs dark from the map background's perceived luminance, so it stays
// correct no matter which exact dark slate the palette uses.
function isDarkColor(color: string): boolean {
  let r = 255;
  let g = 255;
  let b = 255;
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    if (full.length >= 6) {
      r = parseInt(full.slice(0, 2), 16);
      g = parseInt(full.slice(2, 4), 16);
      b = parseInt(full.slice(4, 6), 16);
    }
  } else {
    const parts = color.match(/[\d.]+/g);
    if (parts && parts.length >= 3) {
      r = Number(parts[0]);
      g = Number(parts[1]);
      b = Number(parts[2]);
    }
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.45;
}

// Properties we may override per layer type — the set we must snapshot to restore.
function themedProps(layerType: string): string[] {
  if (layerType === "background") return ["background-color"];
  if (layerType === "fill") return ["fill-color", "fill-outline-color"];
  if (layerType === "line") return ["line-color", "line-opacity"];
  if (layerType === "symbol") return ["text-color", "text-halo-color", "text-halo-width", "text-halo-blur"];
  return [];
}

function captureBaseAppearance(map: MapLibreMap): void {
  if (BASE_APPEARANCE.has(map)) return;
  const snapshot: Record<string, Array<[string, unknown]>> = {};
  for (const layer of map.getStyle().layers ?? []) {
    const entries: Array<[string, unknown]> = [];
    for (const prop of themedProps(layer.type)) {
      try { entries.push([prop, map.getPaintProperty(layer.id, prop)]); } catch { /* ignore */ }
    }
    if (entries.length) snapshot[layer.id] = entries;
  }
  BASE_APPEARANCE.set(map, snapshot);
}

// Switch the basemap between light and dark by mutating paint in place — no
// setStyle, so it lands on the same frame as the app's own theme swap. When
// `animate` is set, colour transitions give a smooth crossfade.
export function applyMapTheme(map: MapLibreMap, isDark: boolean, animate = true): void {
  captureBaseAppearance(map);
  const set: PaintSetter = (id, prop, value) => {
    try {
      map.setPaintProperty(id, `${prop}-transition`, animate ? THEME_TRANSITION : { duration: 0, delay: 0 });
      map.setPaintProperty(id, prop, value);
    } catch {
      // provider-owned layers can reject overrides
    }
  };
  if (isDark) {
    applyDarkMapAppearance(map, set);
  } else {
    const snapshot = BASE_APPEARANCE.get(map);
    if (!snapshot) return;
    for (const [id, entries] of Object.entries(snapshot)) {
      for (const [prop, value] of entries) set(id, prop, value);
    }
  }
}

export function setMapLabelDensity(map: MapLibreMap, density: MapLabelDensity): void {
  for (const layer of map.getStyle()?.layers ?? []) {
    if (layer.type !== "symbol" || layer.source === "stories" || layer.source === "server-clusters") continue;
    const id = layer.id;
    const isCountry = id.startsWith("label_country_") || id.startsWith("place_country");
    const visible = density === "all" || (density === "countries" && isCountry);
    try {
      map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
      if (visible) {
        const background = String(map.getPaintProperty("background", "background-color") ?? "");
        const isDark = isDarkColor(background);
        map.setPaintProperty(id, "text-color", isDark ? "#ffffff" : "#18181b");
        map.setPaintProperty(id, "text-halo-color", isDark ? "#121416" : "#ffffff");
        map.setPaintProperty(id, "text-halo-width", isDark ? 0.75 : 1.5);
        map.setPaintProperty(id, "text-halo-blur", isDark ? 0 : 1);
      }
    } catch {
      // some provider-owned symbol layers reject layout changes
    }
  }
}

const CAMERA_STORAGE_KEY = "loci_camera";
const MAX_SAVED_ZOOM = 22;
const MAX_SAVED_PITCH = 60;

export interface SavedCamera {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

function normalizeLongitude(longitude: number): number {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

// Persist where the user is looking so a reload restores the same view.
export function saveCamera(map: MapLibreMap): void {
  try {
    const c = map.getCenter();
    const camera: SavedCamera = {
      center: [normalizeLongitude(c.lng), c.lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    };
    localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(camera));
  } catch { /* ignore */ }
}

export function parseSavedCamera(raw: string): SavedCamera | null {
  try {
    const c = JSON.parse(raw) as unknown;
    if (
      typeof c === "object" && c !== null &&
      "center" in c && Array.isArray(c.center) && c.center.length === 2 &&
      typeof c.center[0] === "number" && Number.isFinite(c.center[0]) &&
      typeof c.center[1] === "number" && Number.isFinite(c.center[1]) &&
      c.center[1] >= -90 && c.center[1] <= 90 &&
      "zoom" in c && typeof c.zoom === "number" && Number.isFinite(c.zoom) &&
      c.zoom >= 0 && c.zoom <= MAX_SAVED_ZOOM &&
      "bearing" in c && typeof c.bearing === "number" && Number.isFinite(c.bearing) &&
      "pitch" in c && typeof c.pitch === "number" && Number.isFinite(c.pitch) &&
      c.pitch >= 0 && c.pitch <= MAX_SAVED_PITCH
    ) {
      return {
        center: [normalizeLongitude(c.center[0]), c.center[1]],
        zoom: c.zoom,
        bearing: normalizeLongitude(c.bearing),
        pitch: c.pitch,
      };
    }
  } catch { /* ignore */ }
  return null;
}

export function loadCamera(): SavedCamera | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CAMERA_STORAGE_KEY);
    return raw ? parseSavedCamera(raw) : null;
  } catch {
    return null;
  }
}

export function createMap(container: HTMLElement, style = MAP_STYLE_URL): MapLibreMap {
  const saved = loadCamera();
  const minZoom = container.clientWidth < 640 ? MOBILE_MIN_ZOOM : MIN_ZOOM;
  // Returning visitors resume exactly where they left off; first-timers start on
  // the fully-zoomed-out globe (never the default regional view — Phase 9).
  const center = saved?.center ?? randomFirstVisitCenter();
  // Device-adaptive rendering budget: cap the backing-store DPR on phones, size
  // the tile cache so fast spins re-use tiles instead of re-downloading them, and
  // cross-fade LOD changes so tiles blend in over their parent instead of popping.
  const tuning = resolveMapTuning(detectSpaceCapabilities(), window.devicePixelRatio || 1);
  const map = new maplibregl.Map({
    container,
    style,
    center,
    zoom: saved ? Math.max(saved.zoom, minZoom) : minZoom,
    bearing: saved?.bearing ?? 0,
    pitch: saved?.pitch ?? 0,
    minZoom,
    pixelRatio: tuning.pixelRatio,
    maxTileCacheZoomLevels: tuning.maxTileCacheZoomLevels,
    fadeDuration: tuning.fadeDuration,
    // Fetch fresh tiles when the host's cache headers expire, but rely on the
    // browser HTTP cache + the tile cache above to avoid duplicate downloads.
    refreshExpiredTiles: true,
    canvasContextAttributes: {
      // MSAA smooths the globe's silhouette against space so its rim doesn't crawl
      // while rotating; powerPreference keeps us on the discrete GPU where present.
      antialias: tuning.antialias,
      powerPreference: "high-performance",
    },
    attributionControl: false,
  });
  map.on("style.load", () => {
    try {
      map.setProjection({ type: "globe" });
    } catch {
      // unsupported renderers keep the provider's mercator projection
    }
  });
  return map;
}

export function applyGlobeAtmosphere(map: MapLibreMap, level: SpaceQualityLevel): void {
  const atmosphereBlend = level === "fallback" ? 0 : SPACE_QUALITY_CONFIG[level].atmosphereBlend;
  try {
    // Light comes almost straight from the camera (small polar angle) so the
    // atmosphere rim glows evenly around the whole disc instead of lighting one
    // half and leaving a hard dark terminator on the other.
    map.setLight({
      anchor: "viewport",
      position: [1.5, 0, 8],
      color: "#eef6ff",
      intensity: level === "ultra" ? 0.42 : level === "high" ? 0.36 : 0.28,
    });
    map.setSky({
      "sky-color": "transparent",
      "horizon-color": "transparent",
      "fog-color": "transparent",
      "fog-ground-blend": 0,
      "horizon-fog-blend": 0,
      "sky-horizon-blend": 0,
      "atmosphere-blend": atmosphereBlend,
    });
  } catch {
    // unsupported renderers keep the transparent static fallback
  }
}

function rasterizeSvg(
  svg: string,
  width: number,
  height: number,
  signal?: AbortSignal,
): Promise<HTMLImageElement> {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const image = new Image(width, height);
    const cleanup = () => {
      URL.revokeObjectURL(url);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      image.src = "";
      cleanup();
      const error = new Error("map marker setup cancelled");
      error.name = "AbortError";
      reject(error);
    };
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = (error) => {
      cleanup();
      reject(error);
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    image.src = url;
  });
}

export async function addCategoryGlyphImages(
  map: MapLibreMap,
  categories: CategoryStyle[],
  signal?: AbortSignal,
): Promise<void> {
  await Promise.all(
    categories.map(async (category) => {
      const imageId = `pin-${category.id}`;
      if (map.hasImage(imageId)) return;
      // pin is 30x44; rasterize at 2x for crisp edges (pixelRatio 2 → logical 30x44)
      const bitmap = await rasterizeSvg(categoryPinSvg(category.slug, category.color), 60, 88, signal);
      if (signal?.aborted) return;
      if (!map.hasImage(imageId)) {
        map.addImage(imageId, bitmap, { pixelRatio: 2 });
      }
    }),
  );
}

const LABEL_FADE = 200;

export function setMapLanguage(map: MapLibreMap, locale: Locale, animate = false): number | null {
  // openfreemap exposes the translated fields as name_en/name and keeps the
  // latin and non-latin variants separate; its default style concatenates both
  const nameExpression = locale === "en"
    ? ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]]
    : ["coalesce", ["get", "name:" + locale], ["get", "name"], ["get", "name:nonlatin"], ["get", "name:latin"]];

  const labelLayers = (map.getStyle().layers ?? []).filter(
    (layer) => layer.type === "symbol" && layer.source !== "stories" && layer.source !== "server-clusters",
  );

  // text-field is a layout property, so swapping it pops instantly. Fade the
  // labels out, swap the text while invisible, then fade back in for a smooth
  // language change that matches the theme crossfade.
  const swapText = () => {
    for (const layer of labelLayers) {
      try {
        map.setLayoutProperty(layer.id, "text-field", nameExpression);
        map.setLayoutProperty(layer.id, "text-transform", "none");
      } catch { /* some layers may not accept this expression */ }
    }
    map.triggerRepaint();
  };

  if (!animate) {
    swapText();
    return null;
  }

  // preserve each layer's original text-opacity (may be a zoom expression) so we
  // fade back to exactly what the style/label-density set, not a flat 1
  const originalOpacity = new Map<string, unknown>();
  for (const layer of labelLayers) {
    try {
      originalOpacity.set(layer.id, map.getPaintProperty(layer.id, "text-opacity"));
      map.setPaintProperty(layer.id, "text-opacity-transition", { duration: LABEL_FADE, delay: 0 });
      map.setPaintProperty(layer.id, "text-opacity", 0);
    } catch { /* provider-owned layers can reject overrides */ }
  }
  return window.setTimeout(() => {
    swapText();
    for (const layer of labelLayers) {
      try {
        map.setPaintProperty(layer.id, "text-opacity-transition", { duration: LABEL_FADE, delay: 0 });
        map.setPaintProperty(layer.id, "text-opacity", originalOpacity.get(layer.id) ?? 1);
      } catch { /* ignore */ }
    }
  }, LABEL_FADE);
}

export function colorMatchExpression(
  categories: CategoryStyle[],
): maplibregl.ExpressionSpecification {
  const pairs = categories.flatMap((category) => [category.id, category.color]);
  return ["match", ["get", "category_id"], ...pairs, "#888888"] as never;
}
