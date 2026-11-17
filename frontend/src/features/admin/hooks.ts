"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  approveStory,
  fetchModerationQueue,
  rejectStory,
  type ModerationQueueItem,
} from "@/features/admin/api";
import { deleteAdminStory, fetchAdminAuditLogs, fetchAdminDashboard, fetchAdminUser, fetchAdminUserStories, fetchAdminUsers, fetchReportedStories, fetchReportedStory, moderateAdminUser, resolveReports, setAdminUserDeleted, type ResolutionAction } from "@/features/admin/api";
import { ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/query/cache-policy";
import { useAccountMutation } from "@/lib/query/account-mutation";

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
  // drop a story the admin just moderated; a later refresh brings it back only
  // if it has genuinely re-entered review
  remove: (storyId: string) => void;
}

export const MODERATION_QUEUE_REFRESH_MS = 30_000;

function dedupe(items: ModerationQueueItem[]): ModerationQueueItem[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
}

/**
 * Cursor-paginated moderation queue that stays live: it re-reads the pages
 * already on screen every 30 seconds and whenever the tab regains focus, so new
 * submissions appear without a reload and stories another admin handled drop out.
 */
export function useModerationQueue(enabled = true): QueueState {
  const [items, setItems] = useState<ModerationQueueItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const fetching = useRef(false);
  const loadedCount = useRef(0);
  // bumped on every local change so a refresh that started earlier is discarded
  const revision = useRef(0);

  const refresh = useCallback(async (initial: boolean) => {
    if (fetching.current) return;
    fetching.current = true;
    const startedAt = revision.current;
    if (initial) setLoading(true);
    try {
      const collected: ModerationQueueItem[] = [];
      let cursor: string | null = null;
      do {
        const page = await fetchModerationQueue("pending", cursor);
        collected.push(...page.items);
        cursor = page.next_cursor;
      } while (cursor && collected.length < loadedCount.current);
      if (revision.current !== startedAt) return;
      const next = dedupe(collected);
      loadedCount.current = next.length;
      setItems(next);
      setNextCursor(cursor);
      setHasMore(cursor !== null);
      setError(null);
    } catch (err) {
      // a failed background refresh keeps the list the admin is working through
      if (initial) setError(err instanceof ApiError ? err.message : "Failed to load queue");
    } finally {
      fetching.current = false;
      if (initial) {
        setLoading(false);
        setInitialized(true);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh(true);
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") void refresh(false);
    };
    const timer = window.setInterval(refreshIfVisible, MODERATION_QUEUE_REFRESH_MS);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [enabled, refresh]);

  const loadMore = useCallback(() => {
    if (fetching.current || !nextCursor) return;
    fetching.current = true;
    revision.current += 1;
    setLoading(true);
    setError(null);
    fetchModerationQueue("pending", nextCursor)
      .then((page) => {
        setItems((prev) => {
          const next = dedupe([...prev, ...page.items]);
          loadedCount.current = next.length;
          return next;
        });
        setNextCursor(page.next_cursor);
        setHasMore(page.next_cursor !== null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load queue"))
      .finally(() => {
        fetching.current = false;
        setLoading(false);
      });
  }, [nextCursor]);

  const remove = useCallback((storyId: string) => {
    revision.current += 1;
    setItems((prev) => prev.filter((item) => item.id !== storyId));
  }, []);

  return { items, nextCursor, loading, error, loadMore, hasMore, initialized, remove };
}

export function useModerate(onDone: (storyId: string) => void) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.stories.root });
  };

  const approve = useAccountMutation({
    mutationFn: approveStory,
    onSuccess: (_data, storyId) => {
      invalidate();
      onDone(storyId);
    },
  });

  const reject = useAccountMutation({
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
  return useQuery({ queryKey: queryKeys.adminSection("dashboard", from, to), queryFn: () => fetchAdminDashboard(from, to), staleTime: 30_000 });
}

export function useAdminUsers(params: { q: string; status: string; sortBy: string; sortOrder: string; limit: number; offset: number }) {
  return useQuery({ queryKey: queryKeys.adminSection("users", params), queryFn: () => fetchAdminUsers(params), placeholderData: (previous) => previous });
}

export function useAdminUser(userId: number | null) {
  return useQuery({ queryKey: queryKeys.adminSection("user", userId), queryFn: () => fetchAdminUser(userId!), enabled: userId !== null });
}

export function useAdminUserAction() {
  const queryClient = useQueryClient();
  return useAccountMutation({
    mutationFn: ({ userId, action, reason }: { userId: number; action: "block" | "unblock" | "warning"; reason: string }) => moderateAdminUser(userId, action, reason),
    onSuccess: (_data, variables) => { void queryClient.invalidateQueries({ queryKey: queryKeys.admin }); void queryClient.invalidateQueries({ queryKey: queryKeys.adminSection("user", variables.userId) }); },
  });
}

export function useAdminUserDeletion() {
  const queryClient = useQueryClient();
  return useAccountMutation({ mutationFn: ({ userId, deleted, reason }: { userId: number; deleted: boolean; reason: string }) => setAdminUserDeleted(userId, deleted, reason), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: queryKeys.admin }); } });
}

export function useAdminAuditLogs(limit = 50, offset = 0) {
  return useQuery({ queryKey: queryKeys.adminSection("audit-logs", limit, offset), queryFn: () => fetchAdminAuditLogs(limit, offset) });
}

export function useAdminUserStories(userId: number | null, status?: string) {
  return useQuery({ queryKey: queryKeys.adminSection("user-stories", userId, status), queryFn: () => fetchAdminUserStories(userId!, status), enabled: userId !== null });
}

export function useReportedStories(params: { q: string; filter: string; sort: string; limit: number; offset: number }) {
  return useQuery({ queryKey: queryKeys.adminSection("reports", params), queryFn: () => fetchReportedStories(params), placeholderData: (previous) => previous });
}

export function useReportedStory(storyId: string | null) {
  return useQuery({ queryKey: queryKeys.adminSection("report", storyId), queryFn: () => fetchReportedStory(storyId!), enabled: storyId !== null });
}

export function useResolveReports() {
  const queryClient = useQueryClient();
  return useAccountMutation({
    mutationFn: ({ storyId, action, reason }: { storyId: string; action: ResolutionAction; reason?: string }) => resolveReports(storyId, action, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminSection("reports") });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminSection("report") });
      void queryClient.invalidateQueries({ queryKey: queryKeys.adminSection("dashboard") });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stories.root });
    },
  });
}

export function useAdminStoryDeletion() {
  const queryClient = useQueryClient();
  return useAccountMutation({ mutationFn: ({ storyId, reason }: { storyId: string; reason: string }) => deleteAdminStory(storyId, reason), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: queryKeys.adminSection("user-stories") }); void queryClient.invalidateQueries({ queryKey: queryKeys.adminSection("dashboard") }); } });
}
