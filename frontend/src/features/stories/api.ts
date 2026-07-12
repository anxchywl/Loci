import { apiFetch } from "@/lib/api";
import type { CategorySlug } from "@/lib/i18n/dict";

export interface Category {
  id: number;
  slug: CategorySlug;
  color: string;
  icon: string;
  position: number;
}

export interface StoryAuthor {
  id: number;
  username: string | null;
  first_name: string | null;
  photo_url: string | null;
}

export interface StoryPhoto {
  id: string;
  url: string;
  thumb_url: string | null;
  width: number | null;
  height: number | null;
}

export type ModerationStatus = "pending" | "approved" | "rejected";

export interface Story {
  id: string;
  category_id: number;
  title: string;
  body: string;
  happened_on: string | null;
  lat: number;
  lon: number;
  location_precision: "exact" | "approx";
  visibility: "public" | "private";
  is_anonymous: boolean;
  created_at: string;
  moderation_status: ModerationStatus;
  rejection_reason: string | null;
  viewer_is_owner: boolean;
  author: StoryAuthor | null;
  reaction_count: number;
  comment_count: number;
  viewer_reacted: boolean;
  viewer_bookmarked: boolean;
  photos: StoryPhoto[];
}

export interface UpdateStoryInput {
  category_id?: number;
  title?: string;
  body?: string;
  visibility?: "public" | "private";
  is_anonymous?: boolean;
  happened_on?: string | null;
}

export interface StoryComment {
  id: string;
  body: string;
  created_at: string;
  author: StoryAuthor | null;
}

export interface CreateStoryInput {
  category_id: number;
  title: string;
  body: string;
  lat: number;
  lon: number;
  location_precision: "exact" | "approx";
  visibility: "public" | "private";
  is_anonymous: boolean;
  happened_on: string | null;
}

export interface BboxParams {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
  categoryId: number | null;
}

export function fetchCategories(): Promise<Category[]> {
  return apiFetch<Category[]>("/categories");
}

export function fetchBboxStories(params: BboxParams): Promise<Story[]> {
  const query = new URLSearchParams({
    min_lat: String(params.minLat),
    min_lon: String(params.minLon),
    max_lat: String(params.maxLat),
    max_lon: String(params.maxLon),
  });
  if (params.categoryId !== null) query.set("category_id", String(params.categoryId));
  return apiFetch<Story[]>(`/stories/bbox?${query}`);
}

export function fetchTrending(): Promise<Story[]> {
  return apiFetch<Story[]>("/stories/trending");
}

export function searchStories(q: string): Promise<Story[]> {
  return apiFetch<Story[]>(`/stories/search?${new URLSearchParams({ q })}`);
}

export function fetchStory(id: string): Promise<Story> {
  return apiFetch<Story>(`/stories/${id}`);
}

export function createStory(input: CreateStoryInput): Promise<Story> {
  return apiFetch<Story>("/stories", { method: "POST", body: JSON.stringify(input) });
}

export function updateStory(id: string, input: UpdateStoryInput): Promise<Story> {
  return apiFetch<Story>(`/stories/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function resubmitStory(id: string): Promise<Story> {
  return apiFetch<Story>(`/stories/${id}/resubmit`, { method: "POST" });
}

export function deleteStory(id: string): Promise<void> {
  return apiFetch<void>(`/stories/${id}`, { method: "DELETE" });
}

export function addReaction(storyId: string): Promise<void> {
  return apiFetch<void>(`/stories/${storyId}/reactions`, { method: "POST" });
}

export function removeReaction(storyId: string): Promise<void> {
  return apiFetch<void>(`/stories/${storyId}/reactions`, { method: "DELETE" });
}

export function addBookmark(storyId: string): Promise<void> {
  return apiFetch<void>(`/stories/${storyId}/bookmark`, { method: "POST" });
}

export function removeBookmark(storyId: string): Promise<void> {
  return apiFetch<void>(`/stories/${storyId}/bookmark`, { method: "DELETE" });
}

export function fetchComments(storyId: string): Promise<StoryComment[]> {
  return apiFetch<StoryComment[]>(`/stories/${storyId}/comments`);
}

export function postComment(storyId: string, body: string): Promise<StoryComment> {
  return apiFetch<StoryComment>(`/stories/${storyId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function reportStory(storyId: string, reason: string | null): Promise<void> {
  return apiFetch<void>(`/stories/${storyId}/report`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

interface UploadUrlResponse {
  photo_id: string;
  upload_url: string;
  expires_in: number;
}

export class UploadCancelledError extends Error {
  constructor() {
    super("upload cancelled");
    this.name = "UploadCancelledError";
  }
}

interface UploadOptions {
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

// PUT the file with real upload progress and cancellation. Resolves on a 2xx,
// rejects on network error, non-2xx, or abort — the caller decides whether to
// fall back. Used for the direct-to-storage path (the production default).
function putWithProgress(
  url: string,
  file: File,
  contentType: string,
  options: UploadOptions,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new UploadCancelledError());
      return;
    }
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", contentType);
    const onAbort = () => request.abort();
    options.signal?.addEventListener("abort", onAbort);
    const cleanup = () => options.signal?.removeEventListener("abort", onAbort);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
    };
    request.onload = () => {
      cleanup();
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error(`storage responded ${request.status}`));
    };
    request.onerror = () => {
      cleanup();
      reject(new Error("network error reaching storage"));
    };
    request.onabort = () => {
      cleanup();
      reject(new UploadCancelledError());
    };
    request.send(file);
  });
}

/**
 * Upload one photo. Tries the direct-to-storage presigned PUT first (fast path),
 * and on ANY failure that isn't a user cancellation, transparently falls back to
 * the backend proxy. The chosen path, duration, and fallback reason are reported
 * to /complete purely for observability. Throws if both paths fail.
 */
export async function uploadStoryPhoto(
  storyId: string,
  file: File,
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const contentType = file.type === "image/heic" ? "image/heic" : file.type;
  const presigned = await apiFetch<UploadUrlResponse>(`/stories/${storyId}/photos`, {
    method: "POST",
    body: JSON.stringify({ content_type: contentType }),
    signal,
  });

  const startedAt =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  let uploadPath: "direct" | "proxy" = "direct";
  let fallbackReason: string | null = null;

  try {
    await putWithProgress(presigned.upload_url, file, contentType, { onProgress, signal });
  } catch (error) {
    if (error instanceof UploadCancelledError) throw error;
    // direct path failed (network, CORS, timeout, 5xx…): fall back to the proxy.
    // The user never sees this — same file, same result, different transport.
    uploadPath = "proxy";
    fallbackReason = error instanceof Error ? error.message : "direct upload failed";
    await apiFetch<void>(`/stories/${storyId}/photos/${presigned.photo_id}/upload`, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": contentType },
      signal,
    });
    onProgress?.(1);
  }

  const durationMs = Math.round(
    (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
  );
  await apiFetch<void>(`/stories/${storyId}/photos/${presigned.photo_id}/complete`, {
    method: "POST",
    body: JSON.stringify({
      upload_path: uploadPath,
      duration_ms: durationMs,
      fallback_reason: fallbackReason,
    }),
    signal,
  });
}
