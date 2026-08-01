import type { BboxParams, ClusterParams, NearbyParams } from "@/features/stories/api";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Every private key is prefixed with the account it belongs to, so one account's
 * entries can never be read under another's key even if a clear is missed. This
 * is defence in depth, not the primary control: the cache is still cleared
 * outright on an identity change (see `Providers`).
 *
 * Two Telegram accounts linked to the same `users.id` share a scope on purpose —
 * they are one Loci account and must see the same data.
 */
function scope(): readonly [string, number | "anonymous"] {
  return ["account", useAuthStore.getState().user?.id ?? "anonymous"] as const;
}

export const queryKeys = {
  // public and identical for every viewer, so deliberately unscoped
  categories: ["categories"] as const,
  authProviders: ["auth-providers"] as const,
  get identities() {
    return [...scope(), "identities"] as const;
  },
  get sessions() {
    return [...scope(), "sessions"] as const;
  },
  story: (id: string | null) => [...scope(), "story", id] as const,
  comments: (storyId: string | null) => [...scope(), "comments", storyId] as const,
  stories: {
    get root() {
      return [...scope(), "stories"] as const;
    },
    bbox: (params: BboxParams | null) => [...scope(), "stories", "bbox", params] as const,
    map: (params: BboxParams | null) => [...scope(), "stories", "map", params] as const,
    worldMap: (categoryId: number | null) =>
      [...scope(), "stories", "world-map", categoryId] as const,
    clusters: (params: ClusterParams | null) =>
      [...scope(), "stories", "map-clusters", params] as const,
    get trending() {
      return [...scope(), "stories", "trending"] as const;
    },
    nearby: (params: NearbyParams | null) => [...scope(), "stories", "nearby", params] as const,
    search: (query: string) => [...scope(), "stories", "search", query] as const,
  },
  profile: {
    get root() {
      return [...scope(), "profile"] as const;
    },
    get stories() {
      return [...scope(), "profile", "stories"] as const;
    },
    get bookmarks() {
      return [...scope(), "profile", "bookmarks"] as const;
    },
  },
  get admin() {
    return [...scope(), "admin"] as const;
  },
  adminSection: (...parts: readonly (string | number | object | null | undefined)[]) =>
    [...scope(), "admin", ...parts] as const,
} as const;

export const cachePolicy = {
  categories: { staleTime: Infinity, gcTime: 24 * 60 * 60 * 1000 },
  story: { staleTime: 30_000, gcTime: 10 * 60_000 },
  comments: { staleTime: 15_000, gcTime: 5 * 60_000 },
  map: { staleTime: 30_000, gcTime: 5 * 60_000 },
  clusters: { staleTime: 60_000, gcTime: 5 * 60_000 },
  discovery: { staleTime: 30_000, gcTime: 5 * 60_000 },
  profile: { staleTime: 15_000, gcTime: 5 * 60_000 },
} as const;
