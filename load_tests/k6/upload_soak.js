import encoding from "k6/encoding";
import http from "k6/http";
import exec from "k6/execution";
import { check, sleep } from "k6";

const baseUrl = (__ENV.BASE_URL || "").replace(/\/$/, "");
const tokens = (__ENV.ACCESS_TOKENS || "").split(",").filter(Boolean);
const storyIds = (__ENV.STORY_IDS || "").split(",").filter(Boolean);
const targetVus = Number.parseInt(__ENV.TARGET_VUS || "1", 10);
const uploadsPerStory = Number.parseInt(__ENV.UPLOADS_PER_STORY || "5", 10);
const jpeg = encoding.b64decode(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAQABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDxuiiitjI//9k=",
  "std",
);

export const options = {
  scenarios: {
    upload_soak: {
      executor: "per-vu-iterations",
      vus: targetVus,
      iterations: uploadsPerStory,
      maxDuration: __ENV.MAX_DURATION || "10m",
    },
  },
  thresholds: {
    checks: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
    "http_req_duration{workload:upload}": ["p(95)<1000"],
  },
};

export function setup() {
  if (!baseUrl || __ENV.ALLOW_WRITES !== "true") {
    throw new Error("BASE_URL and ALLOW_WRITES=true are required");
  }
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseUrl);
  if (!local && __ENV.ALLOW_REMOTE_LOAD_TEST !== "true") {
    throw new Error("remote load tests require ALLOW_REMOTE_LOAD_TEST=true");
  }
  if (uploadsPerStory < 1 || uploadsPerStory > 5) {
    throw new Error("UPLOADS_PER_STORY must be between 1 and 5");
  }
  if (targetVus < 1 || tokens.length < targetVus || storyIds.length < targetVus) {
    throw new Error("provide one disposable owner token and empty private story per VU");
  }
}

export default function () {
  const index = exec.vu.idInTest - 1;
  const storyId = storyIds[index];
  const auth = { Authorization: `Bearer ${tokens[index]}` };
  const created = http.post(
    `${baseUrl}/api/v1/stories/${storyId}/photos`,
    JSON.stringify({ content_type: "image/jpeg" }),
    {
      headers: { ...auth, "Content-Type": "application/json" },
      tags: { workload: "upload", name: "photo create" },
      timeout: "10s",
    },
  );
  if (!check(created, { "photo slot created": (result) => result.status === 201 })) {
    return;
  }
  const photoId = created.json("photo_id");
  if (!photoId) {
    check(created, { "photo response has id": () => false });
    return;
  }
  const uploaded = http.put(
    `${baseUrl}/api/v1/stories/${storyId}/photos/${photoId}/upload`,
    jpeg,
    {
      headers: { ...auth, "Content-Type": "image/jpeg" },
      tags: { workload: "upload", name: "photo proxy upload" },
      timeout: "30s",
    },
  );
  if (!check(uploaded, { "photo bytes uploaded": (result) => result.status === 204 })) {
    return;
  }
  const completed = http.post(
    `${baseUrl}/api/v1/stories/${storyId}/photos/${photoId}/complete`,
    JSON.stringify({ upload_path: "proxy" }),
    {
      headers: { ...auth, "Content-Type": "application/json" },
      tags: { workload: "upload", name: "photo complete" },
      timeout: "10s",
    },
  );
  check(completed, { "photo queued": (result) => result.status === 202 });
  sleep(2);
}
