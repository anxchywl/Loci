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

export async function uploadStoryPhoto(storyId: string, file: File): Promise<void> {
  const contentType = file.type === "image/heic" ? "image/heic" : file.type;
  const presigned = await apiFetch<UploadUrlResponse>(`/stories/${storyId}/photos`, {
    method: "POST",
    body: JSON.stringify({ content_type: contentType }),
  });

  const put = await fetch(presigned.upload_url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": contentType },
  });
  if (!put.ok) throw new Error("photo upload failed");

  await apiFetch<void>(`/stories/${storyId}/photos/${presigned.photo_id}/complete`, {
    method: "POST",
  });
}
