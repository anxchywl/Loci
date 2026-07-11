import type { ModerationStatus, StoryAuthor, StoryPhoto } from "@/features/stories/api";
import { apiFetch } from "@/lib/api";

export interface ModerationQueueItem {
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
  moderation_status: ModerationStatus;
  created_at: string;
  author: StoryAuthor | null;
  photos: StoryPhoto[];
}

export interface ModerationQueue {
  items: ModerationQueueItem[];
  next_cursor: string | null;
}

export function fetchModerationQueue(
  status: ModerationStatus = "pending",
  cursor: string | null = null,
): Promise<ModerationQueue> {
  const query = new URLSearchParams({ status });
  if (cursor) query.set("cursor", cursor);
  return apiFetch<ModerationQueue>(`/admin/moderation/queue?${query}`);
}

export function approveStory(storyId: string): Promise<void> {
  return apiFetch<void>(`/admin/moderation/${storyId}/approve`, { method: "POST" });
}

export function rejectStory(storyId: string, reason: string): Promise<void> {
  return apiFetch<void>(`/admin/moderation/${storyId}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
