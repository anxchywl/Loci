import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";

export const STORIES_SOURCE = "stories";
export const SERVER_CLUSTERS_SOURCE = "server-clusters";
const CLUSTER_LAYER = "story-clusters";
const CLUSTER_COUNT_LAYER = "story-cluster-counts";
const POINT_LAYER = "story-points";
const SERVER_CLUSTER_LAYER = "server-cluster-circles";
const SERVER_CLUSTER_COUNT_LAYER = "server-cluster-counts";

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

export function addStoryLayers(
  map: MapLibreMap,
  onStoryClick: (storyId: string, lat?: number, lon?: number) => void,
): void {
  map.addSource(STORIES_SOURCE, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
    cluster: true,
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
    },
    paint: { "text-color": "#ffffff" },
  });

  map.addLayer({
    id: POINT_LAYER,
    type: "symbol",
    source: STORIES_SOURCE,
    filter: ["!", ["has", "point_count"]],
    layout: {
      "icon-image": ["concat", "pin-", ["to-string", ["get", "category_id"]]],
      "icon-size": 0.9,
      // anchor at the tip so the pin points at the exact coordinate
      "icon-anchor": "bottom",
      "icon-allow-overlap": true,
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
    },
    paint: { "text-color": "#ffffff" },
  });

  map.on("click", SERVER_CLUSTER_LAYER, (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    map.easeTo({
      center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
      zoom: map.getZoom() + 2,
      duration: 250,
    });
  });

  map.on("click", CLUSTER_LAYER, (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    const clusterId = feature.properties?.cluster_id as number;
    const source = map.getSource(STORIES_SOURCE);
    if (source && "getClusterExpansionZoom" in source) {
      (source as GeoJSONSource)
        .getClusterExpansionZoom(clusterId)
        .then((zoom) => {
          map.easeTo({
            center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
            zoom,
            duration: 250,
          });
        });
    }
  });

  map.on("click", POINT_LAYER, (event) => {
    const feature = event.features?.[0];
    const storyId = feature?.properties?.id as string | undefined;
    const coordinates = (feature?.geometry as GeoJSON.Point)?.coordinates;
    if (storyId) onStoryClick(storyId, coordinates?.[1], coordinates?.[0]);
  });

  for (const layer of [CLUSTER_LAYER, POINT_LAYER, SERVER_CLUSTER_LAYER]) {
    map.on("mouseenter", layer, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", layer, () => {
      map.getCanvas().style.cursor = "";
    });
  }
}

export function updateStoryData(map: MapLibreMap, data: GeoJSON.FeatureCollection): void {
  const source = map.getSource(STORIES_SOURCE);
  if (source && "setData" in source) {
    (source as GeoJSONSource).setData(data);
  }
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
