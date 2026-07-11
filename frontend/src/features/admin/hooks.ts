"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  approveStory,
  fetchModerationQueue,
  rejectStory,
  type ModerationQueueItem,
} from "@/features/admin/api";
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
    mutationFn: ({ storyId, reason }: { storyId: string; reason: string }) =>
      rejectStory(storyId, reason),
    onSuccess: (_data, { storyId }) => {
      invalidate();
      onDone(storyId);
    },
  });

  return { approve, reject };
}
