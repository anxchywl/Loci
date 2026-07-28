import { beforeEach, describe, expect, it, vi } from "vitest";

const maplibreMock = vi.hoisted(() => {
  const instance = {
    on: vi.fn(),
    setLight: vi.fn(),
    setProjection: vi.fn(),
    setSky: vi.fn(),
  };
  return {
    instance,
    Map: vi.fn(function MockMap() { return instance; }),
  };
});

vi.mock("maplibre-gl", () => ({
  default: { Map: maplibreMock.Map },
}));

import type { Map as MapLibreMap } from "maplibre-gl";

import {
  applyGlobeAtmosphere,
  applyMapAppearance,
  createMap,
  parseSavedCamera,
  setMapLabelDensity,
} from "@/lib/map/setup";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("saved map camera", () => {
  it("normalizes wrapped longitude and bearing", () => {
    expect(parseSavedCamera(JSON.stringify({
      center: [541, 43],
      zoom: 8,
      bearing: 540,
      pitch: 30,
    }))).toEqual({
      center: [-179, 43],
      zoom: 8,
      bearing: -180,
      pitch: 30,
    });
  });

  it.each([
    "not json",
    JSON.stringify({ center: [10, 91], zoom: 4, bearing: 0, pitch: 0 }),
    JSON.stringify({ center: [10, 20], zoom: -1, bearing: 0, pitch: 0 }),
    JSON.stringify({ center: [10, 20], zoom: 23, bearing: 0, pitch: 0 }),
    JSON.stringify({ center: [10, 20], zoom: 4, bearing: "north", pitch: 0 }),
    JSON.stringify({ center: [10, 20], zoom: 4, bearing: 0, pitch: 61 }),
    JSON.stringify({ center: [10, 20], zoom: 4 }),
  ])("rejects unsafe persisted values", (raw) => {
    expect(parseSavedCamera(raw)).toBeNull();
  });
});

describe("map creation", () => {
  it.each([
    [390, 1],
    [1280, 2],
  ])("keeps a usable minimum zoom at %ipx", (width, minZoom) => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: width });

    createMap(container);

    const options = (maplibreMock.Map.mock.calls.at(-1) as unknown as [Record<string, number>])[0];
    // first-time visitors open on the fully-zoomed-out globe, not the regional
    // default — so the launch hands off to the whole planet (Phase 9)
    expect(options).toEqual(expect.objectContaining({ minZoom, zoom: minZoom }));
    // provider labels need a short crossfade while story pins control their own opacity
    expect(options.fadeDuration).toBe(200);
    expect(options.pixelRatio).toBeGreaterThan(0);
    expect(options.maxTileCacheZoomLevels).toBeGreaterThanOrEqual(3);
  });

  it("enables native globe projection when the style is ready", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientWidth", { value: 1280 });
    createMap(container);
    const styleLoadHandler = maplibreMock.instance.on.mock.calls.find(
      ([event]) => event === "style.load",
    )?.[1];

    styleLoadHandler?.();

    expect(maplibreMock.instance.setProjection).toHaveBeenCalledWith({ type: "globe" });
  });
});

describe("map appearance", () => {
  it("uses the native globe atmosphere without hiding the space canvas", () => {
    applyGlobeAtmosphere(maplibreMock.instance as unknown as MapLibreMap, "high");

    expect(maplibreMock.instance.setLight).toHaveBeenCalledWith(expect.objectContaining({
      anchor: "viewport",
      intensity: 0.36,
    }));
    expect(maplibreMock.instance.setSky).toHaveBeenCalledWith(expect.objectContaining({
      "sky-color": "transparent",
      "atmosphere-blend": 0.48,
    }));
  });

  it("applies the colored palette to matching provider layers", () => {
    const layers = new Set(["background", "water", "park", "landcover_wood"]);
    const map = {
      getLayer: vi.fn((id: string) => layers.has(id) ? { id } : undefined),
      getSource: vi.fn(() => ({})),
      getStyle: vi.fn(() => ({ layers: [{ id: "labels", type: "symbol" }] })),
      addLayer: vi.fn((layer: { id: string }) => { layers.add(layer.id); }),
      removeLayer: vi.fn((id: string) => { layers.delete(id); }),
      setPaintProperty: vi.fn(),
    } as unknown as MapLibreMap;

    applyMapAppearance(map, true, false);

    expect(map.setPaintProperty).toHaveBeenCalledWith("background", "background-color", "#d9e7d1");
    expect(map.setPaintProperty).toHaveBeenCalledWith("water", "fill-color", "#67c4da");
    expect(map.setPaintProperty).toHaveBeenCalledWith("park", "fill-color", "#b7ddb0");
    expect(map.setPaintProperty).toHaveBeenCalledWith("landcover_wood", "fill-color", "#acd5a8");
    expect(map.setPaintProperty).not.toHaveBeenCalledWith("building", "fill-color", expect.anything());
    expect(map.addLayer).toHaveBeenCalledTimes(3);

    applyMapAppearance(map, false);

    expect(map.removeLayer).toHaveBeenCalledTimes(3);
  });

  it("preserves provider label alignment while changing density", () => {
    const map = {
      getStyle: vi.fn(() => ({
        layers: [
          { id: "place_country", type: "symbol", source: "openmaptiles" },
          { id: "story-points", type: "symbol", source: "stories" },
        ],
      })),
      getPaintProperty: vi.fn(() => "#ffffff"),
      setLayoutProperty: vi.fn(),
      setPaintProperty: vi.fn(),
    } as unknown as MapLibreMap;

    setMapLabelDensity(map, "all");

    expect(map.setLayoutProperty).toHaveBeenCalledWith("place_country", "visibility", "visible");
    expect(map.setLayoutProperty).not.toHaveBeenCalledWith(
      "place_country",
      "text-pitch-alignment",
      expect.anything(),
    );
    expect(map.setLayoutProperty).not.toHaveBeenCalledWith(
      "story-points",
      expect.anything(),
      expect.anything(),
    );
  });

});
