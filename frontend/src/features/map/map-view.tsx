"use client";

import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import type { Category, MapCluster, StoryPin } from "@/features/stories/api";
import { addCategoryGlyphImages, createMap, MAP_STYLE_DARK_URL, MAP_STYLE_URL, setMapLanguage } from "@/lib/map/setup";
import {
  addStoryLayers,
  clustersToGeoJson,
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
  const categoriesRef = useRef(categories);
  const storiesRef = useRef(stories);
  const clustersRef = useRef(clusters);
  const [mapLoading, setMapLoading] = useState(false);

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
  }));

  useEffect(() => {
    if (!containerRef.current || mapRef.current || categories.length === 0) return;

    const map = createMap(containerRef.current);
    mapRef.current = map;

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

    map.on("load", () => {
      addCategoryGlyphImages(map, categories)
        .then(() => {
          addStoryLayers(map, (storyId, lat, lon) => {
            if (useUiStore.getState().mode === "browse") {
              useUiStore.getState().openStory(storyId);
              if (lat !== undefined && lon !== undefined) {
                useUiStore.getState().requestPanTo(lat, lon);
              }
            }
          });
          readyRef.current = true;
          updateStoryData(map, storiesToGeoJson(stories));
          updateServerClusterData(map, clustersToGeoJson(clustersRef.current));
          emitBounds();
        })
        .catch((error) => {
          console.error("map marker setup failed", error);
        });
    });

    map.on("moveend", emitBounds);
    map.on("click", (event) => {
      if (useUiStore.getState().mode === "pick-location") {
        useUiStore.getState().pickLocation(event.lngLat.lat, event.lngLat.lng);
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
      readyRef.current = false;
    };
    // map is created once; categories are stable after first successful fetch
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (mapRef.current && readyRef.current) setMapLanguage(mapRef.current, locale);
  }, [locale]);

  useEffect(() => { categoriesRef.current = categories; }, [categories]);
  useEffect(() => { storiesRef.current = stories; }, [stories]);
  useEffect(() => { clustersRef.current = clusters; }, [clusters]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const isDark =
      theme === "dark" ||
      (theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const styleUrl = isDark ? MAP_STYLE_DARK_URL : MAP_STYLE_URL;
    const currentSprite = map.getStyle().sprite?.toString() ?? "";
    if (currentSprite.includes(isDark ? "dark" : "positron")) return;
    readyRef.current = false;
    setMapLoading(true);
    map.setStyle(styleUrl);
    map.once("styledata", () => {
      const cats = categoriesRef.current;
      addCategoryGlyphImages(map, cats)
        .then(() => {
          addStoryLayers(map, (storyId, lat, lon) => {
            if (useUiStore.getState().mode === "browse") {
              useUiStore.getState().openStory(storyId);
              if (lat !== undefined && lon !== undefined)
                useUiStore.getState().requestPanTo(lat, lon);
            }
          });
          readyRef.current = true;
          updateStoryData(map, storiesToGeoJson(storiesRef.current));
          updateServerClusterData(map, clustersToGeoJson(clustersRef.current));
          setMapLanguage(map, useUiStore.getState().locale);
          setMapLoading(false);
        })
        .catch(console.error);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

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
      {/* Instant colour bridge while the tile style reloads. isDark reads
          matchMedia, so the server always renders the light value — suppress
          the expected one-attribute hydration diff on dark clients */}
      <div
        suppressHydrationWarning
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{ backgroundColor: isDark ? "#1c1c1e" : "#f8f8f8", opacity: mapLoading ? 1 : 0 }}
      />
    </div>
  );
});
