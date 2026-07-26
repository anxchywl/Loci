import type {
  ExpressionSpecification,
  GeoJSONSource,
  LngLat,
  Map as MapLibreMap,
  MapLayerMouseEvent,
} from "maplibre-gl";

export const STORIES_SOURCE = "stories";
export const SERVER_CLUSTERS_SOURCE = "server-clusters";
const CLUSTER_LAYER = "story-clusters";
const CLUSTER_COUNT_LAYER = "story-cluster-counts";
const POINT_LAYER = "story-points";
const POINT_HIT_LAYER = "story-point-hit-targets";
const SERVER_CLUSTER_LAYER = "server-cluster-circles";
const SERVER_CLUSTER_COUNT_LAYER = "server-cluster-counts";
const GLOBE_MAX_ZOOM = 5.5;

interface StoryLayerHandlers {
  serverClusterClick: (event: MapLayerMouseEvent) => void;
  clusterClick: (event: MapLayerMouseEvent) => void;
  pointClick: (event: MapLayerMouseEvent) => void;
  pointerEnter: () => void;
  pointerLeave: () => void;
  render: () => void;
}

const STORY_LAYER_HANDLERS = new WeakMap<MapLibreMap, StoryLayerHandlers>();
const STORY_HORIZON_STATE = new WeakMap<
  MapLibreMap,
  {
    cameraKey: string;
    points: StoryHorizonPoint[];
    visibility: Map<string, boolean>;
  }
>();

interface StoryHorizonPoint {
  id: string;
  lat: number;
  lon: number;
}

function cameraDuration(duration: number): number {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? 0
    : duration;
}

// visual constants shared by client clusters and server-aggregated clusters so
// the two render identically and switching zoom bands is seamless
const CLUSTER_CIRCLE_PAINT = {
  "circle-color": "#3390ec",
  "circle-opacity": 0.9,
  "circle-stroke-width": 2,
  "circle-stroke-color": "#ffffff",
} as const;

function abbreviateCount(count: number): string {
  if (count >= 1000) return `${Math.round(count / 100) / 10}k`;
  return String(count);
}

export interface StoryPointProperties {
  id: string;
  category_id: number;
}

export function storiesToGeoJson(
  stories: { id: string; category_id: number; lat: number; lon: number }[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: stories.map((story) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [story.lon, story.lat] },
      properties: { id: story.id, category_id: story.category_id },
    })),
  };
}

const POINT_ICON_SIZE = [
  "interpolate", ["linear"], ["zoom"],
  1, 0.46,
  4, 0.68,
  8, 0.8,
  12, 0.9,
  15, 1.0,
] as unknown as ExpressionSpecification;

export function isStoryPointVisibleOnGlobe(
  map: MapLibreMap,
  point: StoryHorizonPoint,
): boolean {
  if (map.getZoom() > GLOBE_MAX_ZOOM) return true;
  const location = { lng: point.lon, lat: point.lat } as LngLat;
  return !map.transform.isLocationOccluded(location);
}

function horizonCameraKey(map: MapLibreMap): string {
  const center = map.getCenter();
  return [
    center.lng.toFixed(5),
    center.lat.toFixed(5),
    map.getZoom().toFixed(4),
    map.getBearing().toFixed(3),
    map.getPitch().toFixed(3),
    map.getCanvas().width,
    map.getCanvas().height,
  ].join(":");
}

function updateStoryHorizonVisibility(map: MapLibreMap): void {
  const state = STORY_HORIZON_STATE.get(map);
  if (!state || !map.getSource(STORIES_SOURCE)) return;
  const cameraKey = horizonCameraKey(map);
  if (state.cameraKey === cameraKey) return;
  state.cameraKey = cameraKey;

  for (const point of state.points) {
    const visible = isStoryPointVisibleOnGlobe(map, point);
    if (state.visibility.get(point.id) === visible) continue;
    map.setFeatureState(
      { source: STORIES_SOURCE, id: point.id },
      { horizonVisible: visible },
    );
    state.visibility.set(point.id, visible);
  }
}

export function pointIconSizeExpression(
  storyId: string | null,
): ExpressionSpecification {
  if (!storyId) return POINT_ICON_SIZE;
  return [
    "interpolate", ["linear"], ["zoom"],
    1, ["case", ["==", ["get", "id"], storyId], 0.52, 0.46],
    4, ["case", ["==", ["get", "id"], storyId], 0.76, 0.68],
    8, ["case", ["==", ["get", "id"], storyId], 0.9, 0.8],
    12, ["case", ["==", ["get", "id"], storyId], 1.02, 0.9],
    15, ["case", ["==", ["get", "id"], storyId], 1.12, 1.0],
  ] as unknown as ExpressionSpecification;
}

export function addStoryLayers(
  map: MapLibreMap,
  onStoryClick: (storyId: string, lat?: number, lon?: number) => void,
  cluster = true,
): void {
  removeStoryLayerHandlers(map);
  map.addSource(STORIES_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    promoteId: "id",
    cluster,
    clusterRadius: 56,
    clusterMaxZoom: 15,
  });

  map.addLayer({
    id: CLUSTER_LAYER,
    type: "circle",
    source: STORIES_SOURCE,
    filter: ["has", "point_count"],
    paint: {
      ...CLUSTER_CIRCLE_PAINT,
      "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 26],
    },
  });

  map.addLayer({
    id: CLUSTER_COUNT_LAYER,
    type: "symbol",
    source: STORIES_SOURCE,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 13,
      "text-pitch-alignment": "map",
      "text-rotation-alignment": "viewport",
    },
    paint: { "text-color": "#ffffff" },
  });

  map.addLayer({
    id: POINT_HIT_LAYER,
    type: "circle",
    source: STORIES_SOURCE,
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        1,
        ["case", ["boolean", ["feature-state", "horizonVisible"], false], 14, 0],
        8,
        ["case", ["boolean", ["feature-state", "horizonVisible"], false], 18, 0],
        15,
        ["case", ["boolean", ["feature-state", "horizonVisible"], false], 22, 0],
      ],
      "circle-color": "#000000",
      "circle-opacity": 0.001,
    },
  });

  map.addLayer({
    id: POINT_LAYER,
    type: "symbol",
    source: STORIES_SOURCE,
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": ["concat", "pin-", ["to-string", ["get", "category_id"]]],
      "icon-size": POINT_ICON_SIZE,
      // anchor at the tip so the pin points at the exact coordinate
      "icon-anchor": "bottom",
      "icon-pitch-alignment": "viewport",
      "icon-rotation-alignment": "viewport",
      "icon-allow-overlap": true,
    },
    paint: {
      "icon-opacity": [
        "case",
        ["boolean", ["feature-state", "horizonVisible"], false],
        1,
        0,
      ],
      "icon-opacity-transition": { duration: 0, delay: 0 },
    },
  });

  // server-aggregated clusters for low zoom: same look as client clusters, but
  // counts come from the backend grid aggregation and stay correct at any volume
  map.addSource(SERVER_CLUSTERS_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });

  map.addLayer({
    id: SERVER_CLUSTER_LAYER,
    type: "circle",
    source: SERVER_CLUSTERS_SOURCE,
    paint: {
      ...CLUSTER_CIRCLE_PAINT,
      "circle-radius": ["step", ["get", "count"], 16, 10, 20, 50, 26],
    },
  });

  map.addLayer({
    id: SERVER_CLUSTER_COUNT_LAYER,
    type: "symbol",
    source: SERVER_CLUSTERS_SOURCE,
    layout: {
      "text-field": ["get", "count_label"],
      "text-font": ["Noto Sans Regular"],
      "text-size": 13,
      "text-pitch-alignment": "map",
      "text-rotation-alignment": "viewport",
    },
    paint: { "text-color": "#ffffff" },
  });

  const handlers: StoryLayerHandlers = {
    serverClusterClick: (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      map.easeTo({
        center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
        zoom: map.getZoom() + 2,
        duration: cameraDuration(250),
      });
    },

    clusterClick: (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const clusterId = feature.properties?.cluster_id as number;
      const source = map.getSource(STORIES_SOURCE);
      if (source && "getClusterExpansionZoom" in source) {
        (source as GeoJSONSource)
          .getClusterExpansionZoom(clusterId)
          .then((zoom) => {
            if (map.getSource(STORIES_SOURCE) !== source || !map.getLayer(CLUSTER_LAYER)) return;
            map.easeTo({
              center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
              zoom,
              duration: cameraDuration(250),
            });
          })
          .catch(() => {});
      }
    },

    pointClick: (event) => {
      const feature = event.features?.[0];
      const storyId = feature?.properties?.id as string | undefined;
      const coordinates = (feature?.geometry as GeoJSON.Point)?.coordinates;
      if (storyId) onStoryClick(storyId, coordinates?.[1], coordinates?.[0]);
    },

    pointerEnter: () => {
      map.getCanvas().style.cursor = "pointer";
    },

    pointerLeave: () => {
      map.getCanvas().style.cursor = "";
    },

    render: () => {
      updateStoryHorizonVisibility(map);
    },
  };

  map.on("click", SERVER_CLUSTER_LAYER, handlers.serverClusterClick);
  map.on("click", CLUSTER_LAYER, handlers.clusterClick);
  map.on("click", POINT_HIT_LAYER, handlers.pointClick);

  for (const layer of [CLUSTER_LAYER, POINT_HIT_LAYER, SERVER_CLUSTER_LAYER]) {
    map.on("mouseenter", layer, handlers.pointerEnter);
    map.on("mouseleave", layer, handlers.pointerLeave);
  }
  STORY_HORIZON_STATE.set(map, {
    cameraKey: "",
    points: [],
    visibility: new Map(),
  });
  map.on("render", handlers.render);
  STORY_LAYER_HANDLERS.set(map, handlers);
}

export function setSelectedStory(map: MapLibreMap, storyId: string | null): void {
  if (!map.getLayer(POINT_LAYER)) return;
  map.setLayoutProperty(POINT_LAYER, "icon-size", pointIconSizeExpression(storyId));
  map.setLayoutProperty(POINT_LAYER, "symbol-sort-key", storyId
    ? ["case", ["==", ["get", "id"], storyId], 1, 0]
    : 0);
}

function removeStoryLayerHandlers(map: MapLibreMap): void {
  const handlers = STORY_LAYER_HANDLERS.get(map);
  if (!handlers) return;
  map.off("click", SERVER_CLUSTER_LAYER, handlers.serverClusterClick);
  map.off("click", CLUSTER_LAYER, handlers.clusterClick);
  map.off("click", POINT_HIT_LAYER, handlers.pointClick);
  for (const layer of [CLUSTER_LAYER, POINT_HIT_LAYER, SERVER_CLUSTER_LAYER]) {
    map.off("mouseenter", layer, handlers.pointerEnter);
    map.off("mouseleave", layer, handlers.pointerLeave);
  }
  map.off("render", handlers.render);
  STORY_HORIZON_STATE.delete(map);
  STORY_LAYER_HANDLERS.delete(map);
}

// Remove the story source and its layers so they can be re-added with a
// different clustering mode (the geojson source's `cluster` flag is fixed at
// creation, so switching modes means rebuilding).
export function removeStoryLayers(map: MapLibreMap): void {
  removeStoryLayerHandlers(map);
  for (const layer of [
    CLUSTER_LAYER, CLUSTER_COUNT_LAYER, POINT_LAYER, POINT_HIT_LAYER,
    SERVER_CLUSTER_LAYER, SERVER_CLUSTER_COUNT_LAYER,
  ]) {
    if (map.getLayer(layer)) map.removeLayer(layer);
  }
  if (map.getSource(STORIES_SOURCE)) map.removeSource(STORIES_SOURCE);
  if (map.getSource(SERVER_CLUSTERS_SOURCE)) map.removeSource(SERVER_CLUSTERS_SOURCE);
}

export function updateStoryData(map: MapLibreMap, data: GeoJSON.FeatureCollection): void {
  const source = map.getSource(STORIES_SOURCE);
  if (source && "setData" in source) {
    (source as GeoJSONSource).setData(data);
  }
  const state = STORY_HORIZON_STATE.get(map);
  if (!state) return;
  state.cameraKey = "";
  state.visibility.clear();
  state.points = data.features.flatMap((feature) => {
    if (
      feature.geometry.type !== "Point" ||
      typeof feature.properties?.id !== "string"
    ) {
      return [];
    }
    const [lon, lat] = feature.geometry.coordinates;
    return [{ id: feature.properties.id, lat, lon }];
  });
  updateStoryHorizonVisibility(map);
}

export function clustersToGeoJson(
  clusters: { lat: number; lon: number; count: number }[],
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: clusters.map((cluster) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [cluster.lon, cluster.lat] },
      properties: { count: cluster.count, count_label: abbreviateCount(cluster.count) },
    })),
  };
}

export function updateServerClusterData(
  map: MapLibreMap,
  data: GeoJSON.FeatureCollection,
): void {
  const source = map.getSource(SERVER_CLUSTERS_SOURCE);
  if (source && "setData" in source) {
    (source as GeoJSONSource).setData(data);
  }
}
