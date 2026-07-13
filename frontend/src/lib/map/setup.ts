import maplibregl, { Map as MapLibreMap } from "maplibre-gl";

import { categoryPinSvg } from "@/lib/icons/category-glyphs";
import type { CategorySlug, Locale } from "@/lib/i18n/dict";

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
// both themes share the same label and feature rules; dark mode changes paints
export const MAP_STYLE_DARK_URL = MAP_STYLE_URL;
export const MAP_STYLE_BRIGHT_URL = "https://tiles.openfreemap.org/styles/positron";

// open on a human-scale regional view so europe fits without feeling planetary
export const DEFAULT_CENTER: [number, number] = [28, 52];
export const DEFAULT_ZOOM = 4.5;
export const MIN_ZOOM = 3.0;
const RANDOM_START_CENTERS: [number, number][] = [
  [-5, 48], [18, 52], [52, 48], [88, 50], [125, 42],
];

export interface CategoryStyle {
  id: number;
  slug: CategorySlug;
  color: string;
}

export type MapLabelDensity = "none" | "countries" | "all";

export function applyMapAppearance(map: MapLibreMap, detailed: boolean): void {
  if (!detailed) return;
  const paints: Array<[string, string, string]> = [
    ["water", "fill-color", "#82c9e8"],
    ["park", "fill-color", "#bfe3bd"],
    ["landcover_wood", "fill-color", "#a8d49b"],
    ["landuse_residential", "fill-color", "#f3efe6"],
    ["boundary_2", "line-color", "#9aa6af"],
  ];
  for (const [layer, property, value] of paints) {
    if (map.getLayer(layer)) map.setPaintProperty(layer, property, value);
  }
}

// Paint property to apply. `setProp` lets applyMapTheme route the same overrides
// through a transition-enabled setter so the light/dark swap animates smoothly.
type PaintSetter = (layerId: string, prop: string, value: unknown) => void;

function darkPaintFor(layer: { id: string; type: string }): Array<[string, unknown]> {
  if (layer.type === "background") return [["background-color", "#121416"]];
  const id = layer.id.toLowerCase();
  if (layer.type === "fill") {
    const isBuilding = id.includes("building") || id.includes("residential");
    const color = id.includes("water")
      ? "#26343b"
      : id.includes("park") || id.includes("wood") || id.includes("forest")
        ? "#1c2824"
        : isBuilding
          ? "#171a1d"
          : "#1b1e21";
    // positron gives buildings a light fill-outline-color (rgb(219,219,218));
    // left untouched it glows near-white on dark, so tint it just above the fill
    // for a subtle edge instead of a bright outline
    return isBuilding
      ? [["fill-color", color], ["fill-outline-color", "#242a30"]]
      : [["fill-color", color]];
  }
  if (layer.type === "line") {
    const color = id.includes("boundary") ? "#3b424a" : id.includes("water") ? "#334b57" : "#30363d";
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
const THEME_TRANSITION = { duration: 420, delay: 0 };

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
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== "symbol" || layer.source === "stories" || layer.source === "server-clusters") continue;
    const id = layer.id;
    const isCountry = id.startsWith("label_country_") || id.startsWith("place_country");
    const visible = density === "all" || (density === "countries" && isCountry);
    try {
      map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
      if (visible) {
        const background = String(map.getPaintProperty("background", "background-color") ?? "");
        const isDark = background.includes("12,12,12") || background.includes("#0c0c0c") || background.includes("#121416");
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

export interface SavedCamera {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

// Persist where the user is looking so a reload restores the same view.
export function saveCamera(map: MapLibreMap): void {
  try {
    const c = map.getCenter();
    const camera: SavedCamera = {
      center: [c.lng, c.lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    };
    localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(camera));
  } catch { /* ignore */ }
}

export function loadCamera(): SavedCamera | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CAMERA_STORAGE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as SavedCamera;
    if (
      Array.isArray(c.center) && c.center.length === 2 &&
      Number.isFinite(c.center[0]) && Number.isFinite(c.center[1]) &&
      Number.isFinite(c.zoom)
    ) {
      return c;
    }
  } catch { /* ignore */ }
  return null;
}

export function createMap(container: HTMLElement, style = MAP_STYLE_URL): MapLibreMap {
  const saved = loadCamera();
  const minZoom = container.clientWidth < 1024 ? 2 : MIN_ZOOM;
  const center = saved?.center ?? RANDOM_START_CENTERS[Math.floor(Math.random() * RANDOM_START_CENTERS.length)];
  return new maplibregl.Map({
    container,
    style,
    center,
    zoom: saved?.zoom ?? MIN_ZOOM,
    bearing: saved?.bearing ?? 0,
    pitch: saved?.pitch ?? 0,
    minZoom,
    attributionControl: false,
  });
}

function rasterizeSvg(svg: string, width: number, height: number): Promise<HTMLImageElement> {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const image = new Image(width, height);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = reject;
    image.src = url;
  });
}

export async function addCategoryGlyphImages(
  map: MapLibreMap,
  categories: CategoryStyle[],
): Promise<void> {
  await Promise.all(
    categories.map(async (category) => {
      const imageId = `pin-${category.id}`;
      if (map.hasImage(imageId)) return;
      // pin is 30x44; rasterize at 2x for crisp edges (pixelRatio 2 → logical 30x44)
      const bitmap = await rasterizeSvg(categoryPinSvg(category.slug, category.color), 60, 88);
      if (!map.hasImage(imageId)) {
        map.addImage(imageId, bitmap, { pixelRatio: 2 });
      }
    }),
  );
}

const LABEL_FADE = 200;

export function setMapLanguage(map: MapLibreMap, locale: Locale, animate = false): void {
  if (!map.isStyleLoaded()) {
    map.once("idle", () => setMapLanguage(map, locale, animate));
    return;
  }
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
    return;
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
  window.setTimeout(() => {
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
