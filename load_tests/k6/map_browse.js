import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = (__ENV.BASE_URL || "").replace(/\/$/, "");
const targetVus = Number.parseInt(__ENV.TARGET_VUS || "50", 10);
const storyIds = (__ENV.STORY_IDS || "").split(",").filter(Boolean);
const centers = [
  [43.2389, 76.8897],
  [51.1694, 71.4491],
  [40.7128, -74.006],
  [51.5072, -0.1276],
  [35.6762, 139.6503],
  [-33.8688, 151.2093],
  [0, 179.8],
];

export const options = {
  discardResponseBodies: true,
  scenarios: {
    map_browse: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: __ENV.RAMP_UP || "30s", target: targetVus },
        { duration: __ENV.HOLD || "3m", target: targetVus },
        { duration: __ENV.RAMP_DOWN || "30s", target: 0 },
      ],
      gracefulRampDown: "15s",
    },
  },
  thresholds: {
    checks: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
    "http_req_duration{endpoint:map}": ["p(95)<150"],
    "http_req_duration{endpoint:discovery}": ["p(95)<300"],
    "http_req_duration{endpoint:story}": ["p(95)<300"],
  },
};

function request(path, endpoint, name) {
  const response = http.get(`${baseUrl}${path}`, {
    tags: { endpoint, name },
    timeout: "10s",
  });
  check(response, { [`${name} succeeded`]: (result) => result.status === 200 });
}

export function setup() {
  if (!baseUrl) {
    throw new Error("BASE_URL is required");
  }
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseUrl);
  if (!local && __ENV.ALLOW_REMOTE_LOAD_TEST !== "true") {
    throw new Error("remote load tests require ALLOW_REMOTE_LOAD_TEST=true");
  }
  const response = http.get(`${baseUrl}/health`, { timeout: "5s" });
  if (response.status !== 200) {
    throw new Error(`health check failed with status ${response.status}`);
  }
}

export default function () {
  const roll = Math.random();
  if (roll < 0.8) {
    const [lat, lon] = centers[Math.floor(Math.random() * centers.length)];
    const zoom = Math.floor(Math.random() * 13);
    const span = zoom <= 4 ? 30 : zoom <= 9 ? 3 : 0.3;
    const minLat = Math.max(-90, lat - span);
    const maxLat = Math.min(90, lat + span);
    const minLon = lon - span;
    const maxLon = lon + span;
    const bounds = `min_lat=${minLat}&min_lon=${minLon}&max_lat=${maxLat}&max_lon=${maxLon}`;
    if (zoom <= 9) {
      request(
        `/api/v1/stories/map-clusters?${bounds}&zoom=${zoom}`,
        "map",
        "GET /api/v1/stories/map-clusters",
      );
    } else {
      request(
        `/api/v1/stories/map?${bounds}&limit=300`,
        "map",
        "GET /api/v1/stories/map",
      );
    }
  } else if (roll < 0.9) {
    if (Math.random() < 0.5) {
      request(
        "/api/v1/stories/trending?limit=20",
        "discovery",
        "GET /api/v1/stories/trending",
      );
    } else {
      request(
        "/api/v1/stories/search?q=memory&limit=20",
        "discovery",
        "GET /api/v1/stories/search",
      );
    }
  } else if (storyIds.length > 0) {
    const storyId = storyIds[Math.floor(Math.random() * storyIds.length)];
    request(`/api/v1/stories/${storyId}`, "story", "GET /api/v1/stories/{story_id}");
  } else {
    request(
      "/api/v1/stories/nearby?lat=43.2389&lon=76.8897&radius_meters=50000&limit=20",
      "story",
      "GET /api/v1/stories/nearby",
    );
  }
  sleep(0.1 + Math.random() * 0.4);
}
