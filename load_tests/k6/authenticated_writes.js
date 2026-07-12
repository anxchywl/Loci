import http from "k6/http";
import exec from "k6/execution";
import { check, sleep } from "k6";

const baseUrl = (__ENV.BASE_URL || "").replace(/\/$/, "");
const tokens = (__ENV.ACCESS_TOKENS || "").split(",").filter(Boolean);
const storyIds = (__ENV.STORY_IDS || "").split(",").filter(Boolean);
const targetVus = Number.parseInt(__ENV.TARGET_VUS || "5", 10);

export const options = {
  scenarios: {
    writes: {
      executor: "constant-vus",
      vus: targetVus,
      duration: __ENV.DURATION || "3m",
      gracefulStop: "15s",
    },
  },
  thresholds: {
    checks: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
    "http_req_duration{workload:writes}": ["p(95)<500"],
  },
};

function requireSafeTarget() {
  if (!baseUrl || __ENV.ALLOW_WRITES !== "true") {
    throw new Error("BASE_URL and ALLOW_WRITES=true are required");
  }
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseUrl);
  if (!local && __ENV.ALLOW_REMOTE_LOAD_TEST !== "true") {
    throw new Error("remote load tests require ALLOW_REMOTE_LOAD_TEST=true");
  }
  if (targetVus < 1 || tokens.length < targetVus || storyIds.length < targetVus) {
    throw new Error("provide one ACCESS_TOKENS and STORY_IDS entry per VU");
  }
}

export function setup() {
  requireSafeTarget();
  const response = http.get(`${baseUrl}/health`, { timeout: "5s" });
  if (response.status !== 200) {
    throw new Error(`health check failed with status ${response.status}`);
  }
}

export default function () {
  const index = exec.vu.idInTest - 1;
  const storyId = storyIds[index];
  const headers = {
    Authorization: `Bearer ${tokens[index]}`,
    "Content-Type": "application/json",
  };
  const params = { headers, tags: { workload: "writes" }, timeout: "10s" };
  const roll = Math.random();

  if (roll < 0.4) {
    const method = exec.scenario.iterationInTest % 2 === 0 ? "post" : "del";
    const response = http[method](
      `${baseUrl}/api/v1/stories/${storyId}/reactions`,
      null,
      { ...params, tags: { workload: "writes", name: "reaction mutation" } },
    );
    check(response, { "reaction mutation succeeded": (result) => result.status === 204 });
  } else if (roll < 0.8) {
    const method = exec.scenario.iterationInTest % 2 === 0 ? "post" : "del";
    const response = http[method](
      `${baseUrl}/api/v1/stories/${storyId}/bookmark`,
      null,
      { ...params, tags: { workload: "writes", name: "bookmark mutation" } },
    );
    check(response, { "bookmark mutation succeeded": (result) => result.status === 204 });
  } else {
    const key = `k6-${exec.vu.idInTest}-${exec.scenario.iterationInTest}`;
    const created = http.post(
      `${baseUrl}/api/v1/stories/${storyId}/comments`,
      JSON.stringify({ body: "Disposable load-test comment" }),
      {
        ...params,
        headers: { ...headers, "Idempotency-Key": key },
        tags: { workload: "writes", name: "comment create" },
      },
    );
    const valid = check(created, {
      "comment create succeeded": (result) => result.status === 201 && Boolean(result.json("id")),
    });
    if (valid) {
      const removed = http.del(
        `${baseUrl}/api/v1/comments/${created.json("id")}`,
        null,
        { ...params, tags: { workload: "writes", name: "comment delete" } },
      );
      check(removed, { "comment delete succeeded": (result) => result.status === 204 });
    }
  }
  sleep(2.5 + Math.random());
}
