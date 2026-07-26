import { act, fireEvent, render, screen } from "@testing-library/react";
import { createRef, StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MapView, type MapViewHandle, spaceParallaxOffset } from "@/features/map/map-view";
import { useUiStore } from "@/stores/ui-store";

const mapMocks = vi.hoisted(() => ({
  created: [] as Array<ReturnType<typeof makeMap>>,
  makeMap,
}));

function makeMap() {
  const handlers = new Map<string, Set<(event?: unknown) => void>>();
  return {
    emit(event: string, value?: unknown) {
      for (const handler of handlers.get(event) ?? []) handler(value);
    },
    on: vi.fn((event: string, handler: (value?: unknown) => void) => {
      const eventHandlers = handlers.get(event) ?? new Set();
      eventHandlers.add(handler);
      handlers.set(event, eventHandlers);
    }),
    off: vi.fn((event: string, handler: (value?: unknown) => void) => {
      handlers.get(event)?.delete(handler);
    }),
    remove: vi.fn(),
    resize: vi.fn(),
    triggerRepaint: vi.fn(),
    isStyleLoaded: vi.fn(() => false),
    getBounds: vi.fn(() => ({
      getSouth: () => -45,
      getWest: () => -90,
      getNorth: () => 45,
      getEast: () => 90,
    })),
    getZoom: vi.fn(() => 3),
    getCenter: vi.fn(() => ({ lng: 0, lat: 0 })),
    getBearing: vi.fn(() => 0),
    getPitch: vi.fn(() => 0),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    stop: vi.fn(),
    jumpTo: vi.fn(),
    easeTo: vi.fn(),
    flyTo: vi.fn(),
  };
}

vi.mock("maplibre-gl", () => ({
  default: {
    Marker: class {
      setLngLat() { return this; }
      addTo() { return this; }
      remove() { return this; }
    },
  },
}));

vi.mock("@/lib/map/setup", () => ({
  MAP_STYLE_DARK_URL: "dark-style",
  MAP_STYLE_URL: "light-style",
  addCategoryGlyphImages: vi.fn(async () => undefined),
  applyMapAppearance: vi.fn(),
  applyMapTheme: vi.fn(),
  createMap: vi.fn(() => {
    const map = mapMocks.makeMap();
    mapMocks.created.push(map);
    return map;
  }),
  saveCamera: vi.fn(),
  setMapLabelDensity: vi.fn(),
  setMapLanguage: vi.fn(() => null),
}));

vi.mock("@/lib/map/story-layers", () => ({
  addStoryLayers: vi.fn(),
  clustersToGeoJson: vi.fn(() => ({ type: "FeatureCollection", features: [] })),
  removeStoryLayers: vi.fn(),
  setSelectedStory: vi.fn(),
  storiesToGeoJson: vi.fn(() => ({ type: "FeatureCollection", features: [] })),
  updateServerClusterData: vi.fn(),
  updateStoryData: vi.fn(),
}));

import { applyMapAppearance, createMap } from "@/lib/map/setup";
import { addStoryLayers } from "@/lib/map/story-layers";

const mapProps = {
  categories: [],
  stories: [],
  clusters: [],
  onBoundsChange: vi.fn(),
};

describe("space parallax", () => {
  it("stays continuous at the antimeridian and bounded near the poles", () => {
    const east = spaceParallaxOffset(180, 90);
    const west = spaceParallaxOffset(-180, 90);

    expect(east.x).toBeCloseTo(west.x);
    expect(east.y).toBeCloseTo(west.y);
    expect(Math.abs(east.x)).toBeLessThanOrEqual(14);
    expect(Math.abs(east.y)).toBeLessThanOrEqual(14);
  });
});

describe("MapView lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mapMocks.created.length = 0;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    useUiStore.setState({
      locale: "en",
      theme: "light",
      mode: "browse",
      pickedLocation: null,
      openStoryId: null,
      showAllPins: true,
      mapLabelDensity: "all",
      mapStyle: "clean",
      panRequest: null,
    });
  });

  it("initializes layers on style.load before every style resource is loaded", () => {
    render(<MapView {...mapProps} />);

    expect(screen.getByTestId("map-space")).toHaveClass("lm-map-space");
    expect(screen.getByTestId("map-space")).toHaveAttribute("aria-hidden", "true");
    act(() => mapMocks.created[0].emit("style.load"));

    expect(mapMocks.created[0].isStyleLoaded()).toBe(false);
    expect(addStoryLayers).toHaveBeenCalledOnce();
  });

  it("switches to the colored appearance without recreating the map", () => {
    render(<MapView {...mapProps} />);
    act(() => mapMocks.created[0].emit("style.load"));

    act(() => useUiStore.getState().setMapStyle("bright"));

    expect(applyMapAppearance).toHaveBeenLastCalledWith(mapMocks.created[0], true, true);
    expect(createMap).toHaveBeenCalledOnce();
  });

  it("zooms out before flying smoothly to the user location", () => {
    vi.useFakeTimers();
    const ref = createRef<MapViewHandle>();
    render(<MapView ref={ref} {...mapProps} />);
    const map = mapMocks.created[0];
    map.getZoom.mockReturnValue(14);

    act(() => ref.current?.flyToUser(43.24, 76.94));

    expect(map.stop).toHaveBeenCalledOnce();
    expect(map.easeTo).toHaveBeenCalledWith({ zoom: 3, duration: 650 });
    expect(map.flyTo).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(650));

    expect(map.flyTo).toHaveBeenCalledWith({
      center: [76.94, 43.24],
      zoom: 15,
      duration: 1_400,
      curve: 1.4,
    });
  });

  it("shows a retry action after a load timeout and recreates the map", () => {
    vi.useFakeTimers();
    render(<MapView {...mapProps} />);

    act(() => vi.advanceTimersByTime(12_000));
    expect(screen.getByRole("alert")).toHaveTextContent("Map unavailable");

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(createMap).toHaveBeenCalledTimes(2);
    expect(mapMocks.created[0].remove).toHaveBeenCalledOnce();
  });

  it("removes every map instance created by a Strict Mode remount", () => {
    const view = render(
      <StrictMode>
        <MapView {...mapProps} />
      </StrictMode>,
    );

    view.unmount();

    expect(mapMocks.created.length).toBeGreaterThanOrEqual(2);
    for (const map of mapMocks.created) expect(map.remove).toHaveBeenCalledOnce();
  });
});
