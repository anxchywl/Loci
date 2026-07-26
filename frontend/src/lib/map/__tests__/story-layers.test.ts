import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";

import {
  addStoryLayers,
  pointIconSizeExpression,
  removeStoryLayers,
  storiesToGeoJson,
} from "@/lib/map/story-layers";

describe("point icon size expression", () => {
  it("keeps zoom interpolation at the top level when selecting a story", () => {
    const expression = pointIconSizeExpression("story-1") as unknown[];
    expect(expression[0]).toBe("interpolate");
    expect(expression[2]).toEqual(["zoom"]);
    expect(JSON.stringify(expression).match(/interpolate/g)).toHaveLength(1);
  });

  it("keeps antimeridian and polar coordinates unchanged", () => {
    const data = storiesToGeoJson([
      { id: "east", category_id: 1, lat: 89.5, lon: 179.5 },
      { id: "west", category_id: 2, lat: -89.5, lon: -179.5 },
    ]);
    expect(data.features.map((feature) => feature.geometry)).toEqual([
      { type: "Point", coordinates: [179.5, 89.5] },
      { type: "Point", coordinates: [-179.5, -89.5] },
    ]);
  });

  it("adds an accessible pin hit layer and removes delegated handlers", () => {
    const layers = new Map<string, { id: string; [key: string]: unknown }>();
    const sources = new Map<string, unknown>();
    const map = {
      addSource: vi.fn((id: string, source: unknown) => sources.set(id, source)),
      addLayer: vi.fn((layer: { id: string; [key: string]: unknown }) => layers.set(layer.id, layer)),
      getSource: vi.fn((id: string) => sources.get(id)),
      getLayer: vi.fn((id: string) => layers.get(id)),
      removeLayer: vi.fn((id: string) => layers.delete(id)),
      removeSource: vi.fn((id: string) => sources.delete(id)),
      on: vi.fn(),
      off: vi.fn(),
      getCanvas: vi.fn(() => ({ style: { cursor: "" } })),
      getZoom: vi.fn(() => 4),
      easeTo: vi.fn(),
    } as unknown as MapLibreMap;

    addStoryLayers(map, vi.fn());

    expect(layers.get("story-point-hit-targets")).toMatchObject({
      type: "circle",
      paint: { "circle-opacity": 0.001 },
    });
    expect(layers.get("story-points")).toMatchObject({
      layout: {
        "icon-anchor": "bottom",
        "icon-pitch-alignment": "viewport",
        "icon-rotation-alignment": "viewport",
      },
    });

    removeStoryLayers(map);
    expect(map.off).toHaveBeenCalledWith(
      "click",
      "story-point-hit-targets",
      expect.any(Function),
    );
  });
});
