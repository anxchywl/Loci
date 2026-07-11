"use client";

import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";

import type { Category, Story } from "@/features/stories/api";
import { addCategoryGlyphImages, createMap } from "@/lib/map/setup";
import { addStoryLayers, storiesToGeoJson, updateStoryData } from "@/lib/map/story-layers";
import { useUiStore } from "@/stores/ui-store";

export interface MapBounds {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}

interface MapViewProps {
  categories: Category[];
  stories: Story[];
  onBoundsChange: (bounds: MapBounds) => void;
}

export function MapView({ categories, stories, onBoundsChange }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const pickMarkerRef = useRef<maplibregl.Marker | null>(null);

  const mode = useUiStore((state) => state.mode);
  const pickedLocation = useUiStore((state) => state.pickedLocation);

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
      });
    };

    map.on("load", () => {
      addCategoryGlyphImages(map, categories)
        .then(() => {
          addStoryLayers(map, categories, (storyId, lat, lon) => {
            if (useUiStore.getState().mode === "browse") {
              useUiStore.getState().openStory(storyId);
              if (lat !== undefined && lon !== undefined) {
                useUiStore.getState().requestPanTo(lat, lon);
              }
            }
          });
          readyRef.current = true;
          updateStoryData(map, storiesToGeoJson(stories));
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

  const panRequest = useUiStore((state) => state.panRequest);

  useEffect(() => {
    // camera moves are independent of the glyph/layer pipeline, so this must not
    // wait on readyRef — a marker setup failure should never freeze the map
    if (mapRef.current && panRequest) {
      mapRef.current.easeTo({
        center: [panRequest.lon, panRequest.lat],
        zoom: panRequest.zoom ?? mapRef.current.getZoom(),
        duration: 500,
      });
    }
  }, [panRequest]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" data-testid="map" />
      <div className="absolute bottom-20 left-4 z-10 flex flex-col overflow-hidden rounded-lg border border-border bg-bg shadow-sm lg:left-16">
        <button
          aria-label="Zoom in"
          onClick={() => mapRef.current?.zoomIn({ duration: 250 })}
          className="flex h-9 w-9 items-center justify-center text-[18px] font-light text-text transition-colors hover:bg-surface active:bg-surface"
        >
          +
        </button>
        <div className="h-px bg-border" />
        <button
          aria-label="Zoom out"
          onClick={() => mapRef.current?.zoomOut({ duration: 250 })}
          className="flex h-9 w-9 items-center justify-center text-[18px] font-light text-text transition-colors hover:bg-surface active:bg-surface"
        >
          −
        </button>
      </div>
    </div>
  );
}
