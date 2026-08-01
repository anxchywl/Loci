"use client";

import {
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";

import {
  addBookmark,
  addReaction,
  createStory,
  deleteStory,
  deleteStoryPhoto,
  fetchBboxStories,
  fetchCategories,
  fetchComments,
  fetchMapClusters,
  fetchMapPins,
  fetchNearbyStories,
  fetchWorldMapPins,
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
import { cachePolicy, queryKeys } from "@/lib/query/cache-policy";
import { useAccountMutation } from "@/lib/query/account-mutation";

export function useCategories() {
  return useQuery({ queryKey: queryKeys.categories, queryFn: fetchCategories, ...cachePolicy.categories });
}

export function useBboxStories(params: BboxParams | null) {
  return useQuery({
    queryKey: queryKeys.stories.bbox(params),
    queryFn: ({ signal }) => fetchBboxStories(params!, signal),
    enabled: params !== null,
    ...cachePolicy.discovery,
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

function normalizeLongitude(longitude: number): number {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

export function canonicalizeBounds<T extends BboxParams>(params: T): T {
  const rawSpan = params.maxLon - params.minLon;
  if (Math.abs(rawSpan) >= 360) {
    return { ...params, minLon: -180, maxLon: 180 };
  }
  const span = rawSpan >= 0 ? rawSpan : ((rawSpan % 360) + 360) % 360;
  const minLon = normalizeLongitude(params.minLon);
  return { ...params, minLon, maxLon: minLon + span };
}

export function quantizeBounds<T extends BboxParams>(params: T): T {
  const canonical = canonicalizeBounds(params);
  const latStep = gridStep(canonical.maxLat - canonical.minLat);
  const lonStep = gridStep(canonical.maxLon - canonical.minLon);
  return {
    ...canonical,
    minLat: Math.max(-90, snap(canonical.minLat, latStep, false)),
    maxLat: Math.min(90, snap(canonical.maxLat, latStep, true)),
    minLon: Math.max(-540, snap(canonical.minLon, lonStep, false)),
    maxLon: Math.min(540, snap(canonical.maxLon, lonStep, true)),
  };
}

export function useMapPins(params: BboxParams | null) {
  const quantized = params && quantizeBounds(params);
  return useQuery({
    // quantized bounds make consecutive small pans hit the cache instead of the
    // network; the abort signal cancels superseded requests during fast panning
    queryKey: queryKeys.stories.map(quantized),
    queryFn: ({ signal }) => fetchMapPins(quantized!, signal),
    enabled: quantized !== null,
    ...cachePolicy.map,
    placeholderData: (previous) => previous,
  });
}

export function useWorldMapPins(enabled: boolean, categoryId: number | null) {
  return useQuery({
    queryKey: queryKeys.stories.worldMap(categoryId),
    queryFn: ({ signal }) => fetchWorldMapPins(categoryId, signal),
    enabled,
    ...cachePolicy.map,
    placeholderData: (previous) => previous,
  });
}

export function useMapClusters(params: ClusterParams | null) {
  const quantized = params && { ...quantizeBounds(params), zoom: Math.round(params.zoom) };
  return useQuery({
    queryKey: queryKeys.stories.clusters(quantized),
    queryFn: ({ signal }) => fetchMapClusters(quantized!, signal),
    enabled: quantized !== null,
    // server-side cache is 60s; matching staleTime avoids pointless refetches
    ...cachePolicy.clusters,
    placeholderData: (previous) => previous,
  });
}

export function useTrending(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.stories.trending, queryFn: fetchTrending, enabled, ...cachePolicy.discovery });
}

/**
 * Widening rings for the Nearby list, in meters. Scrolling to the end of the
 * list steps up to the next ring, ending at the API's 50 km ceiling — roughly
 * "this neighbourhood" through "this whole city and then some".
 */
export const NEARBY_RADII = [1_000, 3_000, 10_000, 25_000, 50_000] as const;

export function useNearbyStories(
  location: { lat: number; lon: number } | null,
  radiusMeters: number,
) {
  const params = location ? { lat: location.lat, lon: location.lon, radiusMeters } : null;
  return useQuery({
    queryKey: queryKeys.stories.nearby(params),
    queryFn: ({ signal }) => fetchNearbyStories(params!, signal),
    enabled: params !== null,
    // keep the narrower ring on screen while the wider one loads
    placeholderData: (previous) => previous,
    ...cachePolicy.discovery,
  });
}

export function useSearch(query: string) {
  // normalise before it reaches the cache key or the network: strip leading/
  // trailing space, collapse internal runs, and cap length. keeps " foo",
  // "foo " and "foo" as one cached query and never sends an over-length value.
  const normalized = query.trim().replace(/\s+/g, " ").slice(0, 100);
  return useQuery({
    queryKey: queryKeys.stories.search(normalized),
    queryFn: ({ signal }) => searchStories(normalized, signal),
    enabled: normalized.length >= 2,
    ...cachePolicy.discovery,
  });
}

export function useStory(id: string | null) {
  return useQuery({
    queryKey: queryKeys.story(id),
    queryFn: () => fetchStory(id!),
    enabled: id !== null,
  });
}

export function useComments(storyId: string | null) {
  return useQuery({
    queryKey: queryKeys.comments(storyId),
    queryFn: () => fetchComments(storyId!),
    ...cachePolicy.comments,
    enabled: storyId !== null,
  });
}

export function useCreateStory() {
  const queryClient = useQueryClient();
  return useAccountMutation({
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.stories.root });
      // a new story shows up in My Stories (as pending) right away
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile.stories });
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile.root });
    },
  });
}

export function useDeleteStory() {
  const queryClient = useQueryClient();
  return useAccountMutation({
    mutationFn: deleteStory,
    onMutate: async (storyId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.stories.root });
      await queryClient.cancelQueries({ queryKey: queryKeys.profile.stories });
      const listSnapshots = queryClient.getQueriesData<Story[]>({ queryKey: queryKeys.stories.root });
      const profileSnapshots = queryClient.getQueriesData<Story[]>({ queryKey: queryKeys.profile.stories });
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
      queryClient.removeQueries({ queryKey: queryKeys.story(storyId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stories.root });
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile.root });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stories.trending });
    },
  });
}

export function useDeleteStoryPhoto(storyId: string) {
  const queryClient = useQueryClient();
  return useAccountMutation({
    mutationFn: (photoId: string) => deleteStoryPhoto(storyId, photoId),
    onMutate: async (photoId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.story(storyId) });
      const previous = queryClient.getQueryData<Story>(queryKeys.story(storyId));
      if (previous) {
        queryClient.setQueryData<Story>(queryKeys.story(storyId), {
          ...previous,
          photos: previous.photos.filter((photo) => photo.id !== photoId),
        });
      }
      return { previous };
    },
    onError: (_error, _photoId, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.story(storyId), context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.story(storyId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile.stories });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin });
    },
  });
}

export function useUpdateStory() {
  const queryClient = useQueryClient();
  return useAccountMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateStoryInput }) =>
      updateStory(id, input),
    onSuccess: (story) => {
      queryClient.setQueryData(["story", story.id], story);
      void queryClient.invalidateQueries({ queryKey: queryKeys.stories.root });
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile.root });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stories.trending });
    },
  });
}

export function useResubmitStory() {
  const queryClient = useQueryClient();
  return useAccountMutation({
    mutationFn: resubmitStory,
    onSuccess: (story) => {
      queryClient.setQueryData(["story", story.id], story);
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile.stories });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stories.root });
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

function patchCachedStoryLists(
  queryClient: ReturnType<typeof useQueryClient>,
  storyId: string,
  patch: (story: Story) => Story,
): void {
  for (const [key, stories] of queryClient.getQueriesData<Story[]>({ queryKey: queryKeys.stories.root })) {
    if (stories) queryClient.setQueryData(key, stories.map((story) => story.id === storyId ? patch(story) : story));
  }
  for (const [key, stories] of queryClient.getQueriesData<Story[]>({ queryKey: queryKeys.profile.root })) {
    if (stories) queryClient.setQueryData(key, stories.map((story) => story.id === storyId ? patch(story) : story));
  }
}

type StoryMutationContext = {
  detail: { key: QueryKey; previous: Story | undefined };
  lists: Array<[QueryKey, Story[] | undefined]>;
};

function patchStoryAndLists(
  queryClient: ReturnType<typeof useQueryClient>,
  storyId: string,
  patch: (story: Story) => Story,
): StoryMutationContext {
  const lists = [
    ...queryClient.getQueriesData<Story[]>({ queryKey: queryKeys.stories.root }),
    ...queryClient.getQueriesData<Story[]>({ queryKey: queryKeys.profile.root }),
  ];
  const detail = patchStory(queryClient, storyId, patch);
  patchCachedStoryLists(queryClient, storyId, patch);
  return { detail, lists };
}

function rollbackStoryMutation(
  queryClient: ReturnType<typeof useQueryClient>,
  context: StoryMutationContext | undefined,
): void {
  if (!context) return;
  queryClient.setQueryData(context.detail.key, context.detail.previous);
  context.lists.forEach(([key, stories]) => queryClient.setQueryData(key, stories));
}

export function useReaction(storyId: string) {
  const queryClient = useQueryClient();
  return useAccountMutation({
    mutationFn: (reacted: boolean) =>
      reacted ? removeReaction(storyId) : addReaction(storyId),
    onMutate: (reacted: boolean) => {
      const patch = (story: Story) => ({
        ...story,
        viewer_reacted: !reacted,
        reaction_count: story.reaction_count + (reacted ? -1 : 1),
      });
      return patchStoryAndLists(queryClient, storyId, patch);
    },
    onError: (_error, _variables, context) => rollbackStoryMutation(queryClient, context),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.story(storyId) });
    },
  });
}

export function useBookmark(storyId: string) {
  const queryClient = useQueryClient();
  return useAccountMutation({
    mutationFn: (bookmarked: boolean) =>
      bookmarked ? removeBookmark(storyId) : addBookmark(storyId),
    onMutate: (bookmarked: boolean) => {
      const patch = (story: Story) => ({
        ...story,
        viewer_bookmarked: !bookmarked,
      });
      return patchStoryAndLists(queryClient, storyId, patch);
    },
    onError: (_error, _variables, context) => rollbackStoryMutation(queryClient, context),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.story(storyId) });
      // keep the Saved tab in sync so an unsave disappears immediately and a
      // save shows up without a manual refresh
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile.bookmarks });
    },
  });
}

export function usePostComment(storyId: string) {
  const queryClient = useQueryClient();
  return useAccountMutation({
    mutationFn: (body: string) => postComment(storyId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.comments(storyId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.story(storyId) });
    },
  });
}

export function useReportStory(storyId: string) {
  return useAccountMutation({ mutationFn: (reason: string | null) => reportStory(storyId, reason) });
}
