import maplibregl, { Map as MapLibreMap } from "maplibre-gl";

import { categoryPinSvg } from "@/lib/icons/category-glyphs";
import type { CategorySlug, Locale } from "@/lib/i18n/dict";

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
export const MAP_STYLE_DARK_URL = "https://tiles.openfreemap.org/styles/dark";

export const DEFAULT_CENTER: [number, number] = [76.889709, 43.238949];
export const DEFAULT_ZOOM = 11;

export interface CategoryStyle {
  id: number;
  slug: CategorySlug;
  color: string;
}

export function createMap(container: HTMLElement): MapLibreMap {
  return new maplibregl.Map({
    container,
    style: MAP_STYLE_URL,
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
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

export function setMapLanguage(map: MapLibreMap, locale: Locale): void {
  if (!map.isStyleLoaded()) return;
  const nameKey = locale === "ru" ? "name:ru" : locale === "kk" ? "name" : "name:en";
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== "symbol") continue;
    try {
      map.setLayoutProperty(layer.id, "text-field", [
        "coalesce",
        ["get", nameKey],
        ["get", "name"],
      ]);
    } catch { /* some layers may not accept this expression */ }
  }
}

export function colorMatchExpression(
  categories: CategoryStyle[],
): maplibregl.ExpressionSpecification {
  const pairs = categories.flatMap((category) => [category.id, category.color]);
  return ["match", ["get", "category_id"], ...pairs, "#888888"] as never;
}
