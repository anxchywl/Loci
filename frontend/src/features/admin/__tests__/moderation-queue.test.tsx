import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ModerationQueueItem } from "@/features/admin/api";

vi.mock("@/features/admin/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/admin/api")>()),
  fetchModerationQueue: vi.fn(),
}));

import { fetchModerationQueue } from "@/features/admin/api";
import { MODERATION_QUEUE_REFRESH_MS, useModerationQueue } from "@/features/admin/hooks";

const item = (id: string) => ({ id }) as ModerationQueueItem;
const page = (...ids: string[]) => ({ items: ids.map(item), next_cursor: null });
const ids = (items: ModerationQueueItem[]) => items.map((entry) => entry.id);

describe("useModerationQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("picks up a new submission on the next refresh without a reload", async () => {
    vi.mocked(fetchModerationQueue).mockResolvedValueOnce(page("a"));
    const { result } = renderHook(() => useModerationQueue(true));
    await waitFor(() => expect(ids(result.current.items)).toEqual(["a"]));

    vi.mocked(fetchModerationQueue).mockResolvedValueOnce(page("a", "b"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MODERATION_QUEUE_REFRESH_MS);
    });

    await waitFor(() => expect(ids(result.current.items)).toEqual(["a", "b"]));
  });

  it("refreshes when the tab regains focus", async () => {
    vi.mocked(fetchModerationQueue).mockResolvedValueOnce(page());
    const { result } = renderHook(() => useModerationQueue(true));
    await waitFor(() => expect(result.current.initialized).toBe(true));

    vi.mocked(fetchModerationQueue).mockResolvedValueOnce(page("a"));
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => expect(ids(result.current.items)).toEqual(["a"]));
  });

  it("shows a moderated story again once it re-enters review", async () => {
    vi.mocked(fetchModerationQueue).mockResolvedValueOnce(page("a"));
    const { result } = renderHook(() => useModerationQueue(true));
    await waitFor(() => expect(ids(result.current.items)).toEqual(["a"]));

    act(() => result.current.remove("a"));
    expect(result.current.items).toEqual([]);

    vi.mocked(fetchModerationQueue).mockResolvedValueOnce(page("a"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MODERATION_QUEUE_REFRESH_MS);
    });

    await waitFor(() => expect(ids(result.current.items)).toEqual(["a"]));
  });

  it("keeps the list when a background refresh fails", async () => {
    vi.mocked(fetchModerationQueue).mockResolvedValueOnce(page("a"));
    const { result } = renderHook(() => useModerationQueue(true));
    await waitFor(() => expect(ids(result.current.items)).toEqual(["a"]));

    vi.mocked(fetchModerationQueue).mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MODERATION_QUEUE_REFRESH_MS);
    });

    expect(ids(result.current.items)).toEqual(["a"]);
    expect(result.current.error).toBeNull();
  });

  it("does not fetch until enabled", () => {
    renderHook(() => useModerationQueue(false));
    expect(fetchModerationQueue).not.toHaveBeenCalled();
  });
});
