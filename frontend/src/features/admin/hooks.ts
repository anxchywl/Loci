"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  approveStory,
  fetchModerationQueue,
  rejectStory,
  type ModerationQueueItem,
} from "@/features/admin/api";
import { deleteAdminStory, fetchAdminAuditLogs, fetchAdminDashboard, fetchAdminUser, fetchAdminUserStories, fetchAdminUsers, fetchReportedStories, fetchReportedStory, moderateAdminUser, resolveReports, setAdminUserDeleted, type ResolutionAction } from "@/features/admin/api";
import { ApiError } from "@/lib/api";

interface QueueState {
  items: ModerationQueueItem[];
  nextCursor: string | null;
  loading: boolean;
  error: string | null;
  loadMore: () => void;
  hasMore: boolean;
  // false until the first page settles, so the UI can avoid flashing an empty
  // state before the gated fetch has had a chance to run
  initialized: boolean;
}

/**
 * Cursor-paginated moderation queue. Keeps already-loaded pages and appends the
 * next one on demand, de-duplicating by id so a story can never appear twice
 * even if the underlying list shifts between page loads.
 */
export function useModerationQueue(enabled = true): QueueState {
  const [items, setItems] = useState<ModerationQueueItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const started = useRef(false);

  const load = useCallback(async (cursor: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchModerationQueue("pending", cursor);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...page.items.filter((i) => !seen.has(i.id))];
      });
      setNextCursor(page.next_cursor);
      setHasMore(page.next_cursor !== null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load queue");
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    void load(null);
  }, [enabled, load]);

  const loadMore = useCallback(() => {
    if (!loading && nextCursor) void load(nextCursor);
  }, [load, loading, nextCursor]);

  return { items, nextCursor, loading, error, loadMore, hasMore, initialized };
}

export function useModerate(onDone: (storyId: string) => void) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["stories"] });
  };

  const approve = useMutation({
    mutationFn: approveStory,
    onSuccess: (_data, storyId) => {
      invalidate();
      onDone(storyId);
    },
  });

  const reject = useMutation({
    mutationFn: ({ storyId, reason }: { storyId: string; reason: string | null }) =>
      rejectStory(storyId, reason),
    onSuccess: (_data, { storyId }) => {
      invalidate();
      onDone(storyId);
    },
  });

  return { approve, reject };
}

export function useAdminDashboard(from?: string, to?: string) {
  return useQuery({ queryKey: ["admin", "dashboard", from, to], queryFn: () => fetchAdminDashboard(from, to), staleTime: 30_000 });
}

export function useAdminUsers(params: { q: string; status: string; sortBy: string; sortOrder: string; limit: number; offset: number }) {
  return useQuery({ queryKey: ["admin", "users", params], queryFn: () => fetchAdminUsers(params), placeholderData: (previous) => previous });
}

export function useAdminUser(userId: number | null) {
  return useQuery({ queryKey: ["admin", "user", userId], queryFn: () => fetchAdminUser(userId!), enabled: userId !== null });
}

export function useAdminUserAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, action, reason }: { userId: number; action: "block" | "unblock" | "warning"; reason: string }) => moderateAdminUser(userId, action, reason),
    onSuccess: (_data, variables) => { void queryClient.invalidateQueries({ queryKey: ["admin"] }); void queryClient.invalidateQueries({ queryKey: ["admin", "user", variables.userId] }); },
  });
}

export function useAdminUserDeletion() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ userId, deleted, reason }: { userId: number; deleted: boolean; reason: string }) => setAdminUserDeleted(userId, deleted, reason), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin"] }); } });
}

export function useAdminAuditLogs(limit = 50, offset = 0) {
  return useQuery({ queryKey: ["admin", "audit-logs", limit, offset], queryFn: () => fetchAdminAuditLogs(limit, offset) });
}

export function useAdminUserStories(userId: number | null, status?: string) {
  return useQuery({ queryKey: ["admin", "user-stories", userId, status], queryFn: () => fetchAdminUserStories(userId!, status), enabled: userId !== null });
}

export function useReportedStories(params: { q: string; filter: string; sort: string; limit: number; offset: number }) {
  return useQuery({ queryKey: ["admin", "reports", params], queryFn: () => fetchReportedStories(params), placeholderData: (previous) => previous });
}

export function useReportedStory(storyId: string | null) {
  return useQuery({ queryKey: ["admin", "report", storyId], queryFn: () => fetchReportedStory(storyId!), enabled: storyId !== null });
}

export function useResolveReports() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ storyId, action, reason }: { storyId: string; action: ResolutionAction; reason?: string }) => resolveReports(storyId, action, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "reports"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "report"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["stories"] });
    },
  });
}

export function useAdminStoryDeletion() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: ({ storyId, reason }: { storyId: string; reason: string }) => deleteAdminStory(storyId, reason), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["admin", "user-stories"] }); void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] }); } });
}
