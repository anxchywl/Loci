"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";

import {
  addBookmark,
  addReaction,
  createStory,
  deleteStory,
  fetchBboxStories,
  fetchCategories,
  fetchComments,
  fetchMapClusters,
  fetchMapPins,
  fetchStory,
  fetchTrending,
  postComment,
  removeBookmark,
  removeReaction,
  reportStory,
  resubmitStory,
  searchStories,
  updateStory,
  uploadStoryPhoto,
  type BboxParams,
  type ClusterParams,
  type CreateStoryInput,
  type Story,
  type UpdateStoryInput,
} from "@/features/stories/api";

export function useCategories() {
  return useQuery({ queryKey: ["categories"], queryFn: fetchCategories, staleTime: Infinity });
}

export function useBboxStories(params: BboxParams | null) {
  return useQuery({
    queryKey: ["stories", "bbox", params],
    queryFn: ({ signal }) => fetchBboxStories(params!, signal),
    enabled: params !== null,
    placeholderData: (previous) => previous,
  });
}

// grid step that snaps viewport edges outward so small pans reuse one cache key
function gridStep(span: number): number {
  const raw = Math.max(span / 2, 1e-5);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / pow;
  return (unit >= 5 ? 5 : unit >= 2 ? 2 : 1) * pow;
}

function snap(value: number, step: number, up: boolean): number {
  const snapped = (up ? Math.ceil(value / step) : Math.floor(value / step)) * step;
  // fixed precision keeps float noise out of the query key
  return Number(snapped.toFixed(5));
}

export function quantizeBounds<T extends BboxParams>(params: T): T {
  const latStep = gridStep(params.maxLat - params.minLat);
  const lonStep = gridStep(params.maxLon - params.minLon);
  return {
    ...params,
    minLat: Math.max(-90, snap(params.minLat, latStep, false)),
    maxLat: Math.min(90, snap(params.maxLat, latStep, true)),
    minLon: Math.max(-540, snap(params.minLon, lonStep, false)),
    maxLon: Math.min(540, snap(params.maxLon, lonStep, true)),
  };
}

export function useMapPins(params: BboxParams | null) {
  const quantized = params && quantizeBounds(params);
  return useQuery({
    // quantized bounds make consecutive small pans hit the cache instead of the
    // network; the abort signal cancels superseded requests during fast panning
    queryKey: ["stories", "map", quantized],
    queryFn: ({ signal }) => fetchMapPins(quantized!, signal),
    enabled: quantized !== null,
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });
}

export function useMapClusters(params: ClusterParams | null) {
  const quantized = params && { ...quantizeBounds(params), zoom: Math.round(params.zoom) };
  return useQuery({
    queryKey: ["stories", "map-clusters", quantized],
    queryFn: ({ signal }) => fetchMapClusters(quantized!, signal),
    enabled: quantized !== null,
    // server-side cache is 60s; matching staleTime avoids pointless refetches
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
}

export function useTrending(enabled: boolean) {
  return useQuery({ queryKey: ["stories", "trending"], queryFn: fetchTrending, enabled });
}

export function useSearch(query: string) {
  // normalise before it reaches the cache key or the network: strip leading/
  // trailing space, collapse internal runs, and cap length. keeps " foo",
  // "foo " and "foo" as one cached query and never sends an over-length value.
  const normalized = query.trim().replace(/\s+/g, " ").slice(0, 100);
  return useQuery({
    queryKey: ["stories", "search", normalized],
    queryFn: ({ signal }) => searchStories(normalized, signal),
    enabled: normalized.length >= 2,
    placeholderData: (previous) => previous,
  });
}

export function useStory(id: string | null) {
  return useQuery({
    queryKey: ["story", id],
    queryFn: () => fetchStory(id!),
    enabled: id !== null,
  });
}

export function useComments(storyId: string | null) {
  return useQuery({
    queryKey: ["comments", storyId],
    queryFn: () => fetchComments(storyId!),
    enabled: storyId !== null,
  });
}

export function useCreateStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateStoryInput & { photos: File[]; onUploadProgress?: (progress: number) => void }) => {
      const { photos, onUploadProgress, ...payload } = input;
      const story = await createStory(payload);
      let photoUploadFailed = false;
      for (const [index, file] of photos.entries()) {
        try {
          await uploadStoryPhoto(story.id, file, (progress) => onUploadProgress?.((index + progress) / photos.length));
        } catch {
          photoUploadFailed = true;
        }
      }
      onUploadProgress?.(1);
      return { story, photoUploadFailed };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["stories"] });
      // a new story shows up in My Stories (as pending) right away
      void queryClient.invalidateQueries({ queryKey: ["profile", "stories"] });
    },
  });
}

export function useDeleteStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteStory,
    onMutate: async (storyId) => {
      await queryClient.cancelQueries({ queryKey: ["stories"] });
      await queryClient.cancelQueries({ queryKey: ["profile", "stories"] });
      const listSnapshots = queryClient.getQueriesData<Story[]>({ queryKey: ["stories"] });
      const profileSnapshots = queryClient.getQueriesData<Story[]>({ queryKey: ["profile", "stories"] });
      const remove = (stories: Story[] | undefined) => stories?.filter((story) => story.id !== storyId);
      for (const [key, stories] of listSnapshots) queryClient.setQueryData(key, remove(stories));
      for (const [key, stories] of profileSnapshots) queryClient.setQueryData(key, remove(stories));
      return { listSnapshots, profileSnapshots };
    },
    onError: (_error, _storyId, context) => {
      context?.listSnapshots.forEach(([key, stories]) => queryClient.setQueryData(key, stories));
      context?.profileSnapshots.forEach(([key, stories]) => queryClient.setQueryData(key, stories));
    },
    onSuccess: (_data, storyId) => {
      // drop the detail cache and refresh the map + both profile lists so a
      // deleted story can't linger anywhere or leave an orphaned view
      queryClient.removeQueries({ queryKey: ["story", storyId] });
      void queryClient.invalidateQueries({ queryKey: ["stories"] });
      void queryClient.invalidateQueries({ queryKey: ["profile", "stories"] });
      void queryClient.invalidateQueries({ queryKey: ["profile", "bookmarks"] });
    },
  });
}

export function useUpdateStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStoryInput }) =>
      updateStory(id, input),
    onSuccess: (story) => {
      queryClient.setQueryData(["story", story.id], story);
      void queryClient.invalidateQueries({ queryKey: ["stories"] });
      void queryClient.invalidateQueries({ queryKey: ["profile", "stories"] });
    },
  });
}

export function useResubmitStory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resubmitStory,
    onSuccess: (story) => {
      queryClient.setQueryData(["story", story.id], story);
      void queryClient.invalidateQueries({ queryKey: ["profile", "stories"] });
    },
  });
}

function patchStory(
  queryClient: ReturnType<typeof useQueryClient>,
  storyId: string,
  patch: (story: Story) => Story,
): { key: QueryKey; previous: Story | undefined } {
  const key: QueryKey = ["story", storyId];
  const previous = queryClient.getQueryData<Story>(key);
  if (previous) queryClient.setQueryData(key, patch(previous));
  return { key, previous };
}

export function useReaction(storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reacted: boolean) =>
      reacted ? removeReaction(storyId) : addReaction(storyId),
    onMutate: (reacted: boolean) =>
      patchStory(queryClient, storyId, (story) => ({
        ...story,
        viewer_reacted: !reacted,
        reaction_count: story.reaction_count + (reacted ? -1 : 1),
      })),
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["story", storyId] });
    },
  });
}

export function useBookmark(storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookmarked: boolean) =>
      bookmarked ? removeBookmark(storyId) : addBookmark(storyId),
    onMutate: (bookmarked: boolean) =>
      patchStory(queryClient, storyId, (story) => ({
        ...story,
        viewer_bookmarked: !bookmarked,
      })),
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["story", storyId] });
      // keep the Saved tab in sync so an unsave disappears immediately and a
      // save shows up without a manual refresh
      void queryClient.invalidateQueries({ queryKey: ["profile", "bookmarks"] });
    },
  });
}

export function usePostComment(storyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => postComment(storyId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["comments", storyId] });
      void queryClient.invalidateQueries({ queryKey: ["story", storyId] });
    },
  });
}

export function useReportStory(storyId: string) {
  return useMutation({ mutationFn: (reason: string | null) => reportStory(storyId, reason) });
}
