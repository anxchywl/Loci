import type { ModerationStatus, StoryAuthor, StoryPhoto } from "@/features/stories/api";
import { apiFetch } from "@/lib/api";
import type { Story } from "@/features/stories/api";

export interface AdminUserItem {
  id: number;
  telegram_id: number | null;
  username: string | null;
  display_name: string;
  photo_url: string | null;
  created_at: string;
  last_active_at: string | null;
  status: "active" | "blocked" | "deleted";
  is_admin: boolean;
  erased_at: string | null;
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
  pending_reports: number;
  auto_hidden_stories: number;
  resolved_reports: number;
  deleted_after_reports: number;
  restored_after_review: number;
  avg_review_seconds: number | null;
  most_reported_categories: Array<{ category_id: number; count: number }>;
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

export function rejectStory(storyId: string, reason: string | null): Promise<void> {
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
  const query = new URLSearchParams({ sort_by: params.sortBy, sort_order: params.sortOrder, limit: String(params.limit), offset: String(params.offset) });
  if (params.q.trim()) query.set("q", params.q.trim());
  if (params.status) query.set("status", params.status);
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

export interface AdminUserStory extends Story {
  report_count: number;
}

export function fetchAdminUserStories(userId: number, status?: string): Promise<AdminUserStory[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<AdminUserStory[]>(`/admin/users/${userId}/stories${query}`);
}

export function deleteAdminStory(storyId: string, reason: string): Promise<void> {
  return apiFetch<void>(`/admin/stories/${storyId}`, { method: "DELETE", body: JSON.stringify({ reason }) });
}

// --- reported content -------------------------------------------------------

export interface ReportedStoryItem {
  id: string;
  category_id: number;
  title: string;
  body: string;
  moderation_status: ModerationStatus;
  is_hidden: boolean;
  auto_hidden_at: string | null;
  created_at: string;
  author: StoryAuthor | null;
  report_count: number;
  reporter_count: number;
  pending_count: number;
  report_threshold: number;
  latest_report_at: string | null;
  first_report_at: string | null;
  photos: StoryPhoto[];
}

export interface ReportedStoriesResponse {
  items: ReportedStoryItem[];
  total: number;
  limit: number;
  offset: number;
  report_threshold: number;
}

export interface ReportDetail {
  id: string;
  reason: string | null;
  status: "pending" | "reviewed" | "resolved";
  created_at: string;
  resolved_at: string | null;
  resolved_by: number | null;
  resolution_action: string | null;
  reporter: { id: number | null; username: string | null; first_name: string | null };
}

export interface ReportedStoryDetail {
  story: ReportedStoryItem;
  reports: ReportDetail[];
}

export type ResolutionAction = "restore" | "keep_hidden" | "delete" | "ignore";

export function fetchReportedStories(params: {
  q: string;
  filter: string;
  sort: string;
  limit: number;
  offset: number;
}): Promise<ReportedStoriesResponse> {
  const query = new URLSearchParams({
    filter: params.filter,
    sort: params.sort,
    limit: String(params.limit),
    offset: String(params.offset),
  });
  if (params.q) query.set("q", params.q);
  return apiFetch<ReportedStoriesResponse>(`/admin/reports?${query}`);
}

export function fetchReportedStory(storyId: string): Promise<ReportedStoryDetail> {
  return apiFetch<ReportedStoryDetail>(`/admin/reports/${storyId}`);
}

export function resolveReports(storyId: string, action: ResolutionAction, reason?: string): Promise<void> {
  return apiFetch<void>(`/admin/reports/${storyId}/resolve`, {
    method: "POST",
    body: JSON.stringify({ action, reason: reason ?? null }),
  });
}
