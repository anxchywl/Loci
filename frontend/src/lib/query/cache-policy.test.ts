import { afterEach, describe, expect, it } from "vitest";

import { useAuthStore } from "@/stores/auth-store";
import { queryKeys } from "./cache-policy";

function signIn(id: number) {
  useAuthStore.setState({ user: { id } as never, status: "authenticated" });
}

afterEach(() => {
  useAuthStore.setState({ user: null, status: "signed-out" });
});

describe("query keys", () => {
  it("is stable for equivalent parameter objects", () => {
    expect(queryKeys.stories.map({ minLat: 1, minLon: 2, maxLat: 3, maxLon: 4, categoryId: null }))
      .toEqual(queryKeys.stories.map({ minLat: 1, minLon: 2, maxLat: 3, maxLon: 4, categoryId: null }));
  });

  it("keeps account-scoped data in explicit namespaces", () => {
    signIn(42);
    expect(queryKeys.profile.stories).toEqual(["account", 42, "profile", "stories"]);
    expect(queryKeys.profile.bookmarks).toEqual(["account", 42, "profile", "bookmarks"]);
    expect(queryKeys.identities).toEqual(["account", 42, "identities"]);
    expect(queryKeys.story("s1")).toEqual(["account", 42, "story", "s1"]);
  });

  it("gives two accounts disjoint namespaces", () => {
    signIn(1);
    const first = queryKeys.profile.stories;
    signIn(2);
    expect(queryKeys.profile.stories).not.toEqual(first);
  });

  it("scopes signed-out reads separately from any account", () => {
    expect(queryKeys.stories.trending).toEqual(["account", "anonymous", "stories", "trending"]);
  });

  it("leaves genuinely public data unscoped", () => {
    signIn(7);
    expect(queryKeys.categories).toEqual(["categories"]);
    expect(queryKeys.authProviders).toEqual(["auth-providers"]);
  });
});
