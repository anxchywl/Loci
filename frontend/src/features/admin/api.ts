import type { ModerationStatus, StoryAuthor, StoryPhoto } from "@/features/stories/api";
import { apiFetch } from "@/lib/api";
import type { Story } from "@/features/stories/api";

export interface AdminUserItem {
  id: number;
  telegram_id: number;
  username: string | null;
  display_name: string;
  photo_url: string | null;
  created_at: string;
  last_active_at: string | null;
  status: "active" | "blocked" | "deleted";
  is_admin: boolean;
  stories_count: number;
  approved_stories: number;
  pending_stories: number;
  rejected_stories: number;
  saved_stories_count: number;
  reports_received: number;
  warnings: number;
}

export interface AdminUsersResponse {
  items: AdminUserItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminUserProfile extends AdminUserItem {
  first_name: string | null;
  last_name: string | null;
  language_code: string | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  sessions: Array<{ id: string; created_at: string; last_used_at: string; user_agent_summary: string | null; device_type: string | null; browser: string | null; operating_system: string | null; active: boolean }>;
  moderation_history: Array<{ id: number; user_id: number; admin_id: number; action: string; reason: string; created_at: string }>;
}

export interface AdminDashboard {
  from_date: string;
  to_date: string;
  total_users: number;
  active_users: number;
  new_users: number;
  pending_moderation: number;
  approved_stories: number;
  rejected_stories: number;
  published_stories: number;
  activity: Array<Record<string, string | number>>;
  moderation: Array<Record<string, string | number>>;
  recent_actions: Array<Record<string, string | number | null>>;
}

export interface AuditLogsResponse {
  items: Array<{ id: number; admin_id: number; target_user_id: number | null; target_story_id: string | null; action: string; reason: string | null; metadata_json: Record<string, unknown> | null; created_at: string }>;
  total: number;
  limit: number;
  offset: number;
}

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

export function fetchAdminDashboard(from?: string, to?: string): Promise<AdminDashboard> {
  const query = new URLSearchParams();
  if (from) query.set("from_date", from);
  if (to) query.set("to_date", to);
  return apiFetch<AdminDashboard>(`/admin/dashboard?${query}`);
}

export function fetchAdminUsers(params: { q: string; status: string; sortBy: string; sortOrder: string; limit: number; offset: number }): Promise<AdminUsersResponse> {
  const query = new URLSearchParams({ q: params.q, status: params.status, sort_by: params.sortBy, sort_order: params.sortOrder, limit: String(params.limit), offset: String(params.offset) });
  return apiFetch<AdminUsersResponse>(`/admin/users?${query}`);
}

export function fetchAdminUser(userId: number): Promise<AdminUserProfile> {
  return apiFetch<AdminUserProfile>(`/admin/users/${userId}`);
}

export function moderateAdminUser(userId: number, action: "block" | "unblock" | "warning", reason: string): Promise<void> {
  return apiFetch<void>(`/admin/users/${userId}/${action}`, { method: "POST", body: JSON.stringify({ reason }) });
}

export function setAdminUserDeleted(userId: number, deleted: boolean, reason: string): Promise<void> {
  return apiFetch<void>(`/admin/users/${userId}/${deleted ? "delete" : "restore"}`, { method: "POST", body: JSON.stringify({ reason }) });
}

export function fetchAdminAuditLogs(limit = 50, offset = 0): Promise<AuditLogsResponse> {
  return apiFetch<AuditLogsResponse>(`/admin/audit-logs?limit=${limit}&offset=${offset}`);
}

export function fetchAdminUserStories(userId: number, status?: string): Promise<Story[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<Story[]>(`/admin/users/${userId}/stories${query}`);
}

export function deleteAdminStory(storyId: string, reason: string): Promise<void> {
  return apiFetch<void>(`/admin/stories/${storyId}`, { method: "DELETE", body: JSON.stringify({ reason }) });
}
