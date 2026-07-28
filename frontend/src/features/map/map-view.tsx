"use client";

import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { MapPinOff, RefreshCw } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import type { Category, MapCluster, StoryPin } from "@/features/stories/api";
import { useDict } from "@/lib/i18n/use-dict";
import {
  addCategoryGlyphImages,
  applyGlobeAtmosphere,
  applyMapAppearance,
  applyMapTheme,
  createMap,
  type MapLabelDensity,
  MAP_STYLE_DARK_URL,
  MAP_STYLE_URL,
  saveCamera,
  setMapLabelDensity,
  setMapLanguage,
} from "@/lib/map/setup";
import { MapDiagnostics, shouldEnableMapDiagnostics } from "@/lib/map/map-diagnostics";
import { createSpaceRenderer, type SpaceRenderer } from "@/lib/map/space-renderer";
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
  // Fires once the globe has settled — either interactive ("ready") or given up
  // ("error") — so the launch curtain knows it can lift without revealing a
  // half-drawn map.
  onSettled?: () => void;
}

export const MapView = forwardRef<MapViewHandle, MapViewProps>(function MapView(
  { categories, stories, clusters, onBoundsChange, desktopLeftInset = 0, onSettled },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const spaceCanvasRef = useRef<HTMLCanvasElement>(null);
  const spaceRendererRef = useRef<SpaceRenderer | null>(null);
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
  const settledRef = useRef(false);
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;
  const t = useDict();

  // Tell the launch overlay the globe has settled, exactly once, the first time
  // it reaches an interactive or error state.
  useEffect(() => {
    if (settledRef.current) return;
    if (mapStatus === "ready" || mapStatus === "error") {
      settledRef.current = true;
      onSettledRef.current?.();
    }
  }, [mapStatus]);

  const replaceSpaceRenderer = useCallback((map: MapLibreMap) => {
    spaceRendererRef.current?.dispose();
    spaceRendererRef.current = null;
    const canvas = spaceCanvasRef.current;
    if (!canvas) return;
    const result = createSpaceRenderer(canvas, (level) => {
      if (mapRef.current === map) applyGlobeAtmosphere(map, level);
    });
    spaceRendererRef.current = result.renderer;
    applyGlobeAtmosphere(map, result.level);
    const center = map.getCenter();
    result.renderer?.setOrientation(center.lng, center.lat);
    result.renderer?.setGlobeVisible(map.getZoom() <= 5.5);
  }, []);

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

      // Cinematic locate in three smooth phases, like Google Earth:
      //   1. pull back until the whole planet is in view
      //   2. spin the globe around so the user's location rotates to the front
      //   3. glide down into the location
      const PLANET_ZOOM = 1.4;
      const startZoom = map.getZoom();
      const pullBackDuration = startZoom > PLANET_ZOOM + 0.2 ? 900 : 300;

      map.easeTo({ zoom: PLANET_ZOOM, duration: pullBackDuration });
      locateAnimationTimerRef.current = window.setTimeout(() => {
        if (mapRef.current !== map) return;
        // rotate to the target while staying zoomed out — the globe spins in place
        map.easeTo({ center: [lon, lat], zoom: PLANET_ZOOM, duration: 1_500 });
        locateAnimationTimerRef.current = window.setTimeout(() => {
          locateAnimationTimerRef.current = null;
          if (mapRef.current !== map) return;
          map.flyTo({ center: [lon, lat], zoom: 15, duration: 1_800, curve: 1.3 });
        }, 1_500);
      }, pullBackDuration);
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
    let styleReady = false;
    let lastRecoveryAt = 0;
    let diagnostics: MapDiagnostics | null = null;
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

    const updateSpacePosition = () => {
      const center = map.getCenter();
      spaceRendererRef.current?.setOrientation(center.lng, center.lat);
      spaceRendererRef.current?.setGlobeVisible(map.getZoom() <= 5.5);
    };
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

    const checkReveal = () => {
      if (disposed || !styleReady) return;
      if (map.isStyleLoaded() && map.loaded() && map.areTilesLoaded()) {
        window.requestAnimationFrame(() => {
          if (disposed) return;
          window.requestAnimationFrame(() => {
            if (!disposed) updateStatus("ready");
          });
        });
      } else {
        map.once("render", checkReveal);
      }
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
        replaceSpaceRenderer(map);
        if (!diagnostics && shouldEnableMapDiagnostics()) diagnostics = new MapDiagnostics(map);
        styleReady = true;
        readyRef.current = true;
        updateStoryData(map, storiesToGeoJson(storiesRef.current));
        setSelectedStory(map, state.openStoryId);
        updateServerClusterData(map, clustersToGeoJson(clustersRef.current));
        setMapLanguage(map, state.locale);
        if (loadTimer) window.clearTimeout(loadTimer);
        loadTimer = 0;
        emitBounds();
        checkReveal();
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
      spaceRendererRef.current?.setInteractionActive(false);
      updateSpacePosition();
      if (moveTimer) {
        clearTimeout(moveTimer);
        moveTimer = 0;
      }
      emitBounds();
      saveCamera(map);
    });
    map.on("movestart", () => {
      spaceRendererRef.current?.setInteractionActive(true);
      useUiStore.getState().setMapViewOpen(false);
    });
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
      diagnostics?.dispose();
      diagnostics = null;
      spaceRendererRef.current?.dispose();
      spaceRendererRef.current = null;
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
  }, [mapAttempt, replaceSpaceRenderer]);

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
    <div className="absolute inset-0 bg-[#0a0a0c]">
      {/* The globe stays perfectly still behind the loading cover — no scale-in,
          no camera move — so the reveal feels like uncovering something that was
          always there rather than the map "arriving". */}
      <div className="absolute inset-0">
        <div aria-hidden="true" className="lm-map-space absolute inset-0" data-testid="map-space">
          <canvas ref={spaceCanvasRef} className="absolute inset-0 h-full w-full" data-testid="space-canvas" />
        </div>
        <div ref={containerRef} className="absolute inset-0" data-testid="map" />
      </div>

      {mapStatus === "error" && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center" aria-live="polite">
          <div role="alert" className="pointer-events-auto flex max-w-xs flex-col items-center gap-4 text-center text-white">
            <MapPinOff size={32} className="text-white/50" />
            <p className="text-[15px] font-medium text-white/90">{t.mapUnavailable}</p>
            <button
              type="button"
              onClick={() => retryMapRef.current()}
              className="flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-[14px] font-semibold text-white backdrop-blur transition-colors hover:bg-white/20 active:scale-95"
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
