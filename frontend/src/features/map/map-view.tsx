"use client";

import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { Loader2, MapPinOff, RefreshCw } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import type { Category, MapCluster, StoryPin } from "@/features/stories/api";
import { useDict } from "@/lib/i18n/use-dict";
import { addCategoryGlyphImages, applyMapAppearance, applyMapTheme, createMap, type MapLabelDensity, MAP_STYLE_DARK_URL, MAP_STYLE_URL, saveCamera, setMapLabelDensity, setMapLanguage } from "@/lib/map/setup";
import {
  addStoryLayers,
  clustersToGeoJson,
  removeStoryLayers,
  storiesToGeoJson,
  updateServerClusterData,
  updateStoryData,
  setSelectedStory,
} from "@/lib/map/story-layers";
import { useUiStore } from "@/stores/ui-store";

const MAP_LOAD_TIMEOUT_MS = 12_000;
const MAP_RECOVERY_COOLDOWN_MS = 5_000;

type MapStatus = "loading" | "ready" | "error";

function mediaMatches(query: string): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(query).matches;
}

function prefersReducedMotion(): boolean {
  return mediaMatches("(prefers-reduced-motion: reduce)");
}

export function spaceParallaxOffset(longitude: number, latitude: number): { x: number; y: number } {
  const longitudeRadians = longitude * Math.PI / 180;
  const latitudeRadians = latitude * Math.PI / 180;
  return {
    x: Math.sin(longitudeRadians) * 14,
    y: (1 - Math.cos(longitudeRadians)) * 3 - Math.sin(latitudeRadians) * 8,
  };
}

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
  desktopLeftInset?: number;
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  { categories, stories, clusters, onBoundsChange, desktopLeftInset = 0 },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const spaceRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const statusRef = useRef<MapStatus>("loading");
  const pickMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const locateAnimationTimerRef = useRef<number | null>(null);
  const retryMapRef = useRef<() => void>(() => {});

  const mode = useUiStore((state) => state.mode);
  const pickedLocation = useUiStore((state) => state.pickedLocation);
  const locale = useUiStore((state) => state.locale);
  const theme = useUiStore((state) => state.theme);
  const mapLabelDensity = useUiStore((state) => state.mapLabelDensity);
  const mapStyle = useUiStore((state) => state.mapStyle);
  const showAllPins = useUiStore((state) => state.showAllPins);
  const openStoryId = useUiStore((state) => state.openStoryId);
  const categoriesRef = useRef(categories);
  const storiesRef = useRef(stories);
  const clustersRef = useRef(clusters);
  const showAllPinsRef = useRef(showAllPins);
  const [mapAttempt, setMapAttempt] = useState(0);
  const [mapStatus, setMapStatus] = useState<MapStatus>("loading");
  const t = useDict();

  // stable click handler shared by every place that (re)creates the story
  // layers: initial load, theme restyle, and clustering-mode toggle
  const handleStoryClick = useCallback(
    (storyId: string, lat?: number, lon?: number) => {
      if (useUiStore.getState().mode !== "browse") return;
      const coords = lat !== undefined && lon !== undefined ? { lat, lon } : undefined;
      useUiStore.getState().openStory(storyId, coords);
      if (coords) {
        const isMobile = !mediaMatches("(min-width: 1024px)");
        const padding = isMobile ? Math.round(window.innerHeight * 0.6) : undefined;
        useUiStore.getState().requestPanTo(coords.lat, coords.lon, undefined, padding);
      }
    },
    [],
  );

  useImperativeHandle(ref, () => ({
    zoomIn: () => mapRef.current?.zoomIn({ duration: prefersReducedMotion() ? 0 : 250 }),
    zoomOut: () => mapRef.current?.zoomOut({ duration: prefersReducedMotion() ? 0 : 250 }),
    flyToUser: (lat: number, lon: number) => {
      const map = mapRef.current;
      if (!map) return;

      if (locateAnimationTimerRef.current !== null) {
        window.clearTimeout(locateAnimationTimerRef.current);
        locateAnimationTimerRef.current = null;
      }
      map.stop();

      // drop (or move) a pulsing blue dot at the user's position
      if (!userMarkerRef.current) {
        const el = document.createElement("div");
        el.className = "lm-user-dot";
        el.innerHTML = '<span class="lm-user-dot__ring"></span><span class="lm-user-dot__core"></span>';
        userMarkerRef.current = new maplibregl.Marker({ element: el });
      }
      userMarkerRef.current.setLngLat([lon, lat]).addTo(map);

      if (prefersReducedMotion()) {
        map.jumpTo({ center: [lon, lat], zoom: 15 });
        return;
      }

      const overviewZoom = Math.min(map.getZoom(), 3);
      const zoomOutDuration = map.getZoom() > overviewZoom ? 650 : 250;
      map.easeTo({ zoom: overviewZoom, duration: zoomOutDuration });
      locateAnimationTimerRef.current = window.setTimeout(() => {
        locateAnimationTimerRef.current = null;
        if (mapRef.current !== map) return;
        map.flyTo({ center: [lon, lat], zoom: 15, duration: 1_400, curve: 1.4 });
      }, zoomOutDuration);
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

    let disposed = false;
    let moveTimer = 0;
    let loadTimer = 0;
    let revealTimer = 0;
    let revealFrame = 0;
    let spaceFrame = 0;
    let styleReady = false;
    let lastRecoveryAt = 0;
    const lifecycleAbort = new AbortController();
    const updateStatus = (status: MapStatus) => {
      if (disposed) return;
      statusRef.current = status;
      setMapStatus(status);
    };
    const retry = () => {
      if (!disposed) setMapAttempt((attempt) => attempt + 1);
    };
    retryMapRef.current = retry;
    readyRef.current = false;
    updateStatus("loading");

    const initialIsDarkTheme =
      theme === "dark" ||
      (theme === "auto" && mediaMatches("(prefers-color-scheme: dark)"));
    let map: MapLibreMap;
    try {
      map = createMap(containerRef.current, initialIsDarkTheme ? MAP_STYLE_DARK_URL : MAP_STYLE_URL);
    } catch (error) {
      console.error("map initialization failed", error);
      updateStatus("error");
      return;
    }
    mapRef.current = map;
    const reduceSpaceMotion = prefersReducedMotion();

    const updateSpacePosition = () => {
      if (spaceFrame) return;
      spaceFrame = window.requestAnimationFrame(() => {
        spaceFrame = 0;
        const space = spaceRef.current;
        if (!space) return;
        if (reduceSpaceMotion) {
          space.style.transform = "translate3d(0, 0, 0) scale(1.06)";
          return;
        }
        const center = map.getCenter();
        const offset = spaceParallaxOffset(center.lng, center.lat);
        space.style.transform = `translate3d(${offset.x.toFixed(2)}px, ${offset.y.toFixed(2)}px, 0) scale(1.06)`;
      });
    };
    updateSpacePosition();
    map.on("move", updateSpacePosition);

    map.on("styleimagemissing", (event) => {
      const imageId = event.id;
      if (!imageId.startsWith("pin-") || map.hasImage(imageId)) return;
      const categoryId = Number(imageId.slice("pin-".length));
      const category = categoriesRef.current.find((c) => c.id === categoryId);
      if (!category) return;
      void addCategoryGlyphImages(map, [category], lifecycleAbort.signal)
        .then(() => {
          if (!disposed && readyRef.current) {
            updateStoryData(map, storiesToGeoJson(storiesRef.current));
          }
        })
        .catch((error) => {
          if (error instanceof Error && error.name !== "AbortError") {
            console.warn("map marker image failed", error);
          }
        });
    });

    const emitBounds = () => {
      if (disposed || !readyRef.current) return;
      const bounds = map.getBounds();
      onBoundsChange({
        minLat: Math.max(-90, bounds.getSouth()),
        minLon: bounds.getWest(),
        maxLat: Math.min(90, bounds.getNorth()),
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
    const emitThrottled = () => {
      if (moveTimer) return;
      moveTimer = window.setTimeout(() => {
        moveTimer = 0;
        emitBounds();
      }, MOVE_THROTTLE_MS);
    };
    map.on("move", emitThrottled);

    const revealMap = () => {
      if (disposed || !styleReady) return;
      if (revealTimer) window.clearTimeout(revealTimer);
      if (revealFrame) window.cancelAnimationFrame(revealFrame);
      revealTimer = 0;
      revealFrame = 0;
      updateStatus("ready");
    };

    const initializeStyle = () => {
      if (disposed || styleReady) return;
      try {
        const state = useUiStore.getState();
        const darkNow = state.theme === "dark" ||
          (state.theme === "auto" && mediaMatches("(prefers-color-scheme: dark)"));
        applyMapTheme(map, darkNow, false);
        applyMapAppearance(map, state.mapStyle === "bright", false);
        setMapLabelDensity(map, state.mapLabelDensity);
        addStoryLayers(map, handleStoryClick, !showAllPinsRef.current);
        styleReady = true;
        readyRef.current = true;
        updateStoryData(map, storiesToGeoJson(storiesRef.current));
        setSelectedStory(map, state.openStoryId);
        updateServerClusterData(map, clustersToGeoJson(clustersRef.current));
        setMapLanguage(map, state.locale);
        if (loadTimer) window.clearTimeout(loadTimer);
        loadTimer = 0;
        emitBounds();
        revealFrame = window.requestAnimationFrame(revealMap);
        revealTimer = window.setTimeout(revealMap, 250);
        void addCategoryGlyphImages(map, categoriesRef.current, lifecycleAbort.signal)
          .then(() => {
            if (!disposed && readyRef.current) {
              updateStoryData(map, storiesToGeoJson(storiesRef.current));
            }
          })
          .catch((error) => {
            if (error instanceof Error && error.name !== "AbortError") {
              console.warn("map marker setup failed", error);
            }
          });
      } catch (error) {
        styleReady = false;
        readyRef.current = false;
        console.error("map style setup failed", error);
        updateStatus("error");
      }
    };

    const startLoadTimeout = () => {
      if (loadTimer) window.clearTimeout(loadTimer);
      loadTimer = window.setTimeout(() => {
        if (!styleReady) updateStatus("error");
      }, MAP_LOAD_TIMEOUT_MS);
    };

    map.on("style.load", initializeStyle);
    startLoadTimeout();
    if (map.isStyleLoaded()) initializeStyle();

    // without a listener MapLibre console.errors every failed tile/sprite
    // request. Those come from the external tile host, are transient, and the
    // map retries on its own — so they stay a warning and only real map errors
    // are raised as errors.
    map.on("error", (event) => {
      const error = event.error as (Error & { status?: number }) | undefined;
      const isTransientFetch = error instanceof TypeError || typeof error?.status === "number";
      if (isTransientFetch) {
        console.warn("map tile request failed", error);
        return;
      }
      console.error("map error", error ?? event);
      if (/webgl|context|worker/i.test(error?.message ?? "")) updateStatus("error");
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

    const recover = () => {
      if (disposed || document.visibilityState !== "visible") return;
      map.resize();
      map.triggerRepaint();
      if (!styleReady && map.isStyleLoaded()) initializeStyle();
      if (statusRef.current !== "error") return;
      const now = Date.now();
      if (now - lastRecoveryAt < MAP_RECOVERY_COOLDOWN_MS) return;
      lastRecoveryAt = now;
      retry();
    };
    document.addEventListener("visibilitychange", recover);
    window.addEventListener("online", recover);

    return () => {
      disposed = true;
      lifecycleAbort.abort();
      if (moveTimer) clearTimeout(moveTimer);
      if (loadTimer) clearTimeout(loadTimer);
      if (revealTimer) clearTimeout(revealTimer);
      if (revealFrame) cancelAnimationFrame(revealFrame);
      if (spaceFrame) cancelAnimationFrame(spaceFrame);
      if (locateAnimationTimerRef.current !== null) {
        clearTimeout(locateAnimationTimerRef.current);
        locateAnimationTimerRef.current = null;
      }
      map.off("move", updateSpacePosition);
      document.removeEventListener("visibilitychange", recover);
      window.removeEventListener("online", recover);
      map.remove();
      if (mapRef.current === map) mapRef.current = null;
      userMarkerRef.current = null;
      pickMarkerRef.current = null;
      readyRef.current = false;
    };
    // map lifecycle reads current store state inside async handlers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapAttempt]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || categories.length === 0) return;
    const controller = new AbortController();
    const addImages = () => {
      if (controller.signal.aborted) return;
      void addCategoryGlyphImages(map, categories, controller.signal)
        .then(() => {
          // re-push story data so the point layer resolves its now-registered
          // pin-<id> glyphs (categories can arrive after the style/layers do)
          if (!controller.signal.aborted && readyRef.current) {
            updateStoryData(map, storiesToGeoJson(storiesRef.current));
          }
        })
        .catch((error) => {
          if (error instanceof Error && error.name !== "AbortError") {
            console.warn("map marker setup failed", error);
          }
        });
    };
    if (readyRef.current) addImages();
    return () => {
      controller.abort();
    };
  }, [categories]);

  useEffect(() => {
    if (mapRef.current && readyRef.current) {
      updateStoryData(mapRef.current, storiesToGeoJson(stories));
    }
  }, [stories]);

  useEffect(() => {
    if (mapRef.current && readyRef.current) setSelectedStory(mapRef.current, openStoryId);
  }, [openStoryId]);

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
    if (!mapRef.current || !readyRef.current) return;
    const timer = setMapLanguage(mapRef.current, locale, !prefersReducedMotion());
    return () => {
      if (timer !== null) window.clearTimeout(timer);
    };
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
    setSelectedStory(map, useUiStore.getState().openStoryId);
  }, [showAllPins, handleStoryClick]);

  // Light and dark share the same base style, so a theme swap is a direct paint
  // mutation — it lands on the same frame as the app's own theme change and
  // crossfades smoothly, instead of refetching the style (slow, laggy, flashy).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const isDarkTheme = theme === "dark" || (theme === "auto" && mediaMatches("(prefers-color-scheme: dark)"));
    applyMapTheme(map, isDarkTheme, !prefersReducedMotion());
    applyMapAppearance(map, mapStyle === "bright", !prefersReducedMotion());
    // re-derive label colours (halo/text) for the new theme
    setMapLabelDensity(map, useUiStore.getState().mapLabelDensity);
  }, [mapStyle, theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    setMapLabelDensity(map, mapLabelDensity);
    const frame = requestAnimationFrame(() => {
      if (mapRef.current === map) setMapLabelDensity(map, mapLabelDensity);
    });
    return () => cancelAnimationFrame(frame);
  }, [mapLabelDensity]);

  const panRequest = useUiStore((state) => state.panRequest);

  useEffect(() => {
    if (mapRef.current && panRequest) {
      // maplibre easeTo keys on `'padding' in options`, not a null check, so the
      // padding key must be omitted entirely when absent — passing
      // `padding: undefined` makes it read `undefined.top` and throw
      mapRef.current.easeTo({
        center: [panRequest.lon, panRequest.lat],
        zoom: panRequest.zoom ?? mapRef.current.getZoom(),
        ...(panRequest.paddingBottom !== undefined ||
        (openStoryId !== null && mediaMatches("(min-width: 1024px)"))
          ? {
              padding: {
                top: mediaMatches("(min-width: 1024px)")
                  ? 0
                  : document.querySelector<HTMLElement>("[data-map-controls]")?.getBoundingClientRect().bottom ?? 0,
                right: 0,
                bottom: panRequest.paddingBottom ?? 0,
                left: mediaMatches("(min-width: 1024px)") ? desktopLeftInset : 0,
              },
            }
          : {}),
        duration: prefersReducedMotion() ? 0 : 500,
      });
    }
  }, [desktopLeftInset, openStoryId, panRequest]);

  useEffect(() => {
    if (!mapRef.current || openStoryId) return;
    mapRef.current.easeTo({
      padding: { top: 0, right: 0, bottom: 0, left: desktopLeftInset },
      duration: prefersReducedMotion() ? 0 : 250,
    });
  }, [desktopLeftInset, openStoryId]);

  const isDark =
    theme === "dark" ||
    (theme === "auto" &&
      typeof window !== "undefined" &&
      mediaMatches("(prefers-color-scheme: dark)"));

  return (
    <div className="absolute inset-0">
      <div ref={spaceRef} aria-hidden="true" className="lm-map-space absolute inset-0" data-testid="map-space" />
      <div ref={containerRef} className="absolute inset-0" data-testid="map" />
      <div
        suppressHydrationWarning
        className="pointer-events-none absolute inset-0 motion-safe:transition-opacity motion-safe:duration-200"
        style={{ backgroundColor: isDark ? "#121416" : "#f8f8f8", opacity: mapStatus === "ready" ? 0 : 1 }}
      />
      {mapStatus === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted" aria-live="polite">
          <div className="flex items-center gap-2 text-[13px]">
            <Loader2 size={18} className="motion-safe:animate-spin" />
            <span>{t.loading}</span>
          </div>
        </div>
      )}
      {mapStatus === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div role="alert" className="flex max-w-xs flex-col items-center gap-3 rounded-lg border border-border bg-bg p-4 text-center">
            <MapPinOff size={24} className="text-muted" />
            <p className="text-[15px]">{t.mapUnavailable}</p>
            <button
              type="button"
              onClick={() => retryMapRef.current()}
              className="flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-[14px] font-semibold text-accent-text"
            >
              <RefreshCw size={16} />
              {t.retry}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
