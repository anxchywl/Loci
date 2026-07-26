import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";

import {
  addStoryLayers,
  isStoryPointVisibleOnGlobe,
  pointIconSizeExpression,
  removeStoryLayers,
  storiesToGeoJson,
  updateStoryData,
} from "@/lib/map/story-layers";

describe("point icon size expression", () => {
  it("keeps production zoom scaling and enlarges only the selected story", () => {
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
      getCanvas: vi.fn(() => ({ style: { cursor: "" }, width: 1280, height: 720 })),
      getCenter: vi.fn(() => ({ lng: 0, lat: 0 })),
      getBearing: vi.fn(() => 0),
      getPitch: vi.fn(() => 0),
      getZoom: vi.fn(() => 4),
      easeTo: vi.fn(),
    } as unknown as MapLibreMap;

    addStoryLayers(map, vi.fn());

    expect(layers.get("story-point-hit-targets")).toMatchObject({
      type: "circle",
      paint: { "circle-opacity": 0.001 },
    });
    expect(
      (layers.get("story-point-hit-targets")?.paint as Record<string, unknown>)[
        "circle-radius"
      ],
    ).toEqual(expect.arrayContaining(["interpolate", ["linear"], ["zoom"]]));
    expect(layers.get("story-points")).toMatchObject({
      layout: {
        "icon-anchor": "bottom",
        "icon-pitch-alignment": "viewport",
        "icon-rotation-alignment": "viewport",
        "icon-allow-overlap": true,
      },
      paint: {
        "icon-opacity-transition": { duration: 0, delay: 0 },
      },
    });
    expect(layers.get("story-cluster-counts")).toMatchObject({
      layout: {
        "text-pitch-alignment": "map",
        "text-rotation-alignment": "viewport",
      },
    });
    expect(layers.get("server-cluster-counts")).toMatchObject({
      layout: {
        "text-pitch-alignment": "map",
        "text-rotation-alignment": "viewport",
      },
    });

    removeStoryLayers(map);
    expect(map.off).toHaveBeenCalledWith(
      "click",
      "story-point-hit-targets",
      expect.any(Function),
    );
    expect(map.off).toHaveBeenCalledWith("render", expect.any(Function));
  });

  it("lets front-facing pins extend beyond the rim and hides back-facing anchors", () => {
    const map = {
      getZoom: vi.fn(() => 3),
      transform: {
        isLocationOccluded: vi.fn(() => false),
      },
    } as unknown as MapLibreMap;

    expect(isStoryPointVisibleOnGlobe(map, { id: "edge", lat: 0, lon: 0 })).toBe(true);
    map.transform.isLocationOccluded = vi.fn(() => true);
    expect(isStoryPointVisibleOnGlobe(map, { id: "back", lat: 0, lon: 0 })).toBe(false);
  });

  it("updates feature state without waiting for the symbol placement cycle", () => {
    const source = { setData: vi.fn() };
    const handlers = new Map<string, () => void>();
    const map = {
      addSource: vi.fn(),
      addLayer: vi.fn(),
      getSource: vi.fn(() => source),
      on: vi.fn((event: string, handler: () => void) => handlers.set(event, handler)),
      off: vi.fn(),
      getCanvas: vi.fn(() => ({ style: { cursor: "" }, width: 1280, height: 720 })),
      getCenter: vi.fn(() => ({ lng: 0, lat: 0 })),
      getBearing: vi.fn(() => 0),
      getPitch: vi.fn(() => 0),
      getZoom: vi.fn(() => 3),
      setFeatureState: vi.fn(),
      transform: {
        isLocationOccluded: vi.fn(() => false),
      },
    } as unknown as MapLibreMap;

    addStoryLayers(map, vi.fn());
    updateStoryData(map, storiesToGeoJson([
      { id: "story-1", category_id: 1, lat: 43.24, lon: 76.94 },
    ]));
    handlers.get("render")?.();

    expect(map.setFeatureState).toHaveBeenCalledWith(
      { source: "stories", id: "story-1" },
      { horizonVisible: true },
    );
  });
});
