"use client";

import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import type { Category, MapCluster, StoryPin } from "@/features/stories/api";
import { addCategoryGlyphImages, applyMapTheme, createMap, type MapLabelDensity, MAP_STYLE_DARK_URL, MAP_STYLE_URL, saveCamera, setMapLabelDensity, setMapLanguage } from "@/lib/map/setup";
import {
  addStoryLayers,
  clustersToGeoJson,
  removeStoryLayers,
  storiesToGeoJson,
  updateServerClusterData,
  updateStoryData,
} from "@/lib/map/story-layers";
import { useUiStore } from "@/stores/ui-store";

export interface MapBounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
  zoom: number;
}

export interface MapViewHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  flyToUser: (lat: number, lon: number) => void;
  setLabelDensity: (density: MapLabelDensity) => void;
  setDetailedAppearance: () => void;
}

interface MapViewProps {
  categories: Category[];
  stories: StoryPin[];
  clusters: MapCluster[];
  onBoundsChange: (bounds: MapBounds) => void;
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  { categories, stories, clusters, onBoundsChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const pickMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);

  const mode = useUiStore((state) => state.mode);
  const pickedLocation = useUiStore((state) => state.pickedLocation);
  const locale = useUiStore((state) => state.locale);
  const theme = useUiStore((state) => state.theme);
  const mapLabelDensity = useUiStore((state) => state.mapLabelDensity);
  const showAllPins = useUiStore((state) => state.showAllPins);
  const categoriesRef = useRef(categories);
  const storiesRef = useRef(stories);
  const clustersRef = useRef(clusters);
  const showAllPinsRef = useRef(showAllPins);
  // false until the basemap has been themed, so the coloured cover can hide the
  // brief light-tile flash on a dark reload
  const [themeReady, setThemeReady] = useState(false);

  // stable click handler shared by every place that (re)creates the story
  // layers: initial load, theme restyle, and clustering-mode toggle
  const handleStoryClick = useCallback(
    (storyId: string, lat?: number, lon?: number) => {
      if (useUiStore.getState().mode !== "browse") return;
      useUiStore.getState().openStory(storyId);
      if (lat !== undefined && lon !== undefined) {
        useUiStore.getState().requestPanTo(lat, lon);
      }
    },
    [],
  );

  useImperativeHandle(ref, () => ({
    zoomIn: () => mapRef.current?.zoomIn({ duration: 250 }),
    zoomOut: () => mapRef.current?.zoomOut({ duration: 250 }),
    flyToUser: (lat: number, lon: number) => {
      const map = mapRef.current;
      if (!map) return;

      // drop (or move) a pulsing blue dot at the user's position
      if (!userMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "lm-user-dot";
        el.innerHTML = '<span class="lm-user-dot__ring"></span><span class="lm-user-dot__core"></span>';
        userMarkerRef.current = new maplibregl.Marker({ element: el });
      }
      userMarkerRef.current.setLngLat([lon, lat]).addTo(map);

      const reduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) {
        map.jumpTo({ center: [lon, lat], zoom: 15 });
        return;
      }

      // two-phase: pull back to a planet-wide view, then arc down onto the user
      map.easeTo({ zoom: 2.2, duration: 750, essential: true });
      window.setTimeout(() => {
        map.flyTo({ center: [lon, lat], zoom: 15, duration: 2200, curve: 1.5, essential: true });
      }, 800);
    },
    setLabelDensity: (density: MapLabelDensity) => {
      const map = mapRef.current;
      if (map) setMapLabelDensity(map, density);
    },
    setDetailedAppearance: () => {
      const map = mapRef.current;
      if (map) setMapLabelDensity(map, "all");
    },
  }));

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialIsDarkTheme =
      theme === "dark" ||
      (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const map = createMap(containerRef.current, initialIsDarkTheme ? MAP_STYLE_DARK_URL : MAP_STYLE_URL);
    mapRef.current = map;

    // Safety net: if the point layer asks for a pin-<id> glyph that hasn't been
    // rasterized yet (categories can resolve after the style/layers load),
    // register it on demand so pins never render blank.
    map.on("styleimagemissing", (event) => {
      const imageId = event.id;
      if (!imageId.startsWith("pin-") || map.hasImage(imageId)) return;
      const categoryId = Number(imageId.slice("pin-".length));
      const category = categoriesRef.current.find((c) => c.id === categoryId);
      if (!category) return;
      void addCategoryGlyphImages(map, [category])
        .then(() => {
          if (readyRef.current) updateStoryData(map, storiesToGeoJson(storiesRef.current));
        })
        .catch(() => { /* transient; the next render retries */ });
    });

    const emitBounds = () => {
      const bounds = map.getBounds();
      onBoundsChange({
        minLat: bounds.getSouth(),
        minLon: bounds.getWest(),
        maxLat: bounds.getNorth(),
        maxLon: bounds.getEast(),
        zoom: map.getZoom(),
      });
    };

    // Emit bounds *during* the zoom/pan, not only after it settles, so the pin/
    // cluster fetch starts while the camera is still animating and is usually
    // done by the time it lands. quantizeBounds (in the query hooks) dedupes to a
    // grid cell so mid-flight emits that don't cross a cell are free, abort
    // signals cancel superseded requests, and placeholderData keeps the current
    // pins on screen meanwhile. Trailing-throttled to ~150ms so the parent (and
    // its react-query keys) re-renders a handful of times during a gesture
    // instead of once per frame — enough to start the fetch early without churn.
    const MOVE_THROTTLE_MS = 150;
    let moveTimer = 0;
    const emitThrottled = () => {
      if (moveTimer) return;
      moveTimer = window.setTimeout(() => {
        moveTimer = 0;
        emitBounds();
      }, MOVE_THROTTLE_MS);
    };
    map.on("move", emitThrottled);

    map.on("load", () => {
      // Read the *current* theme, not initialIsDarkTheme: preferences may have
      // hydrated (auto → dark) between mount and this async load event, and the
      // theme effect can't correct it yet because readyRef is still false.
      const st = useUiStore.getState();
      const darkNow = st.theme === "dark" || (st.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      // Theme the basemap synchronously on the first painted frame (not inside
      // the async glyph promise) so a dark reload never flashes the light base.
      applyMapTheme(map, darkNow, false);
      setMapLabelDensity(map, mapLabelDensity);
      // reveal the map (fade out the themed cover) now that colours are correct
      requestAnimationFrame(() => setThemeReady(true));
      // categoriesRef.current, not the closure `categories`, which is captured
      // empty at mount before the categories query resolves
      addCategoryGlyphImages(map, categoriesRef.current)
        .then(() => {
          addStoryLayers(map, handleStoryClick, !showAllPinsRef.current);
          readyRef.current = true;
          updateStoryData(map, storiesToGeoJson(stories));
          updateServerClusterData(map, clustersToGeoJson(clustersRef.current));
          setMapLanguage(map, locale);
          emitBounds();
        })
        .catch((error) => {
          console.error("map marker setup failed", error);
        });
    });

    map.on("moveend", () => {
      if (moveTimer) {
        clearTimeout(moveTimer);
        moveTimer = 0;
      }
      emitBounds();
      saveCamera(map);
    });
    map.on("movestart", () => useUiStore.getState().setMapViewOpen(false));
    map.on("click", (event) => {
      useUiStore.getState().setMapViewOpen(false);
      if (useUiStore.getState().mode === "pick-location") {
        useUiStore.getState().pickLocation(event.lngLat.lat, event.lngLat.lng);
      }
    });

    return () => {
      if (moveTimer) clearTimeout(moveTimer);
      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
      readyRef.current = false;
    };
    // map is created once; category assets update independently
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || categories.length === 0) return;
    let cancelled = false;
    const addImages = () => {
      if (cancelled) return;
      void addCategoryGlyphImages(map, categories)
        .then(() => {
          // re-push story data so the point layer resolves its now-registered
          // pin-<id> glyphs (categories can arrive after the style/layers do)
          if (!cancelled && readyRef.current) {
            updateStoryData(map, storiesToGeoJson(storiesRef.current));
          }
        })
        .catch((error) => console.error("map marker setup failed", error));
    };
    if (map.isStyleLoaded()) addImages();
    else map.once("load", addImages);
    return () => {
      cancelled = true;
      map.off("load", addImages);
    };
  }, [categories]);

  useEffect(() => {
    if (mapRef.current && readyRef.current) {
      updateStoryData(mapRef.current, storiesToGeoJson(stories));
    }
  }, [stories]);

  useEffect(() => {
    if (mapRef.current && readyRef.current) {
      updateServerClusterData(mapRef.current, clustersToGeoJson(clusters));
    }
  }, [clusters]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (mode === "compose" && pickedLocation) {
      pickMarkerRef.current ??= new maplibregl.Marker({ color: "#3390ec" });
      pickMarkerRef.current.setLngLat([pickedLocation.lon, pickedLocation.lat]).addTo(map);
    } else if (mode === "browse" && pickMarkerRef.current) {
      pickMarkerRef.current.remove();
      pickMarkerRef.current = null;
    }
  }, [mode, pickedLocation]);

  useEffect(() => {
    if (mapRef.current && readyRef.current) setMapLanguage(mapRef.current, locale, true);
  }, [locale]);

  useEffect(() => { categoriesRef.current = categories; }, [categories]);
  useEffect(() => { storiesRef.current = stories; }, [stories]);
  useEffect(() => { clustersRef.current = clusters; }, [clusters]);

  // Toggling clustering means rebuilding the geojson source (its `cluster` flag
  // is immutable after creation), then re-pushing the current data.
  useEffect(() => {
    showAllPinsRef.current = showAllPins;
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    removeStoryLayers(map);
    addStoryLayers(map, handleStoryClick, !showAllPins);
    updateStoryData(map, storiesToGeoJson(storiesRef.current));
    updateServerClusterData(map, clustersToGeoJson(clustersRef.current));
  }, [showAllPins, handleStoryClick]);

  // Light and dark share the same base style, so a theme swap is a direct paint
  // mutation — it lands on the same frame as the app's own theme change and
  // crossfades smoothly, instead of refetching the style (slow, laggy, flashy).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const isDarkTheme = theme === "dark" || (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    applyMapTheme(map, isDarkTheme, true);
    // re-derive label colours (halo/text) for the new theme
    setMapLabelDensity(map, useUiStore.getState().mapLabelDensity);
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    setMapLabelDensity(map, mapLabelDensity);
    requestAnimationFrame(() => setMapLabelDensity(map, mapLabelDensity));
  }, [mapLabelDensity]);

  const panRequest = useUiStore((state) => state.panRequest);

  useEffect(() => {
    if (mapRef.current && panRequest) {
      mapRef.current.easeTo({
        center: [panRequest.lon, panRequest.lat],
        zoom: panRequest.zoom ?? mapRef.current.getZoom(),
        duration: 500,
      });
    }
  }, [panRequest]);

  const isDark =
    theme === "dark" ||
    (theme === "auto" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" data-testid="map" />
      {/* Themed cover over the map until its paints are correct, so a dark reload
          never shows the light base tiles. Fades out once themeReady. isDark
          reads matchMedia, so the server always renders the light value —
          suppress the expected one-attribute hydration diff on dark clients */}
      <div
        suppressHydrationWarning
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 ease-out"
        style={{ backgroundColor: isDark ? "#121416" : "#f8f8f8", opacity: themeReady ? 0 : 1 }}
      />
    </div>
  );
});
