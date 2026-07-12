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
    queryFn: () => fetchBboxStories(params!),
    enabled: params !== null,
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
    queryFn: () => searchStories(normalized),
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
