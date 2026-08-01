/**
 * Account isolation: nothing belonging to one account may survive a switch to
 * another. Covers the Telegram TG1→TG2 case that motivated the fix, plus the
 * generic paths (logout, restore, in-flight replies) that share its machinery.
 */
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// statically imported so this shares a module graph with the store the tests
// drive; the dynamic imports below deliberately build fresh graphs of their own
import { Providers } from "@/app/providers";
import { applyAccountSignal, applySession } from "@/features/auth/hooks";
import { useAccountMutation } from "@/lib/query/account-mutation";
import { bumpAuthEpoch } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useUiStore } from "@/stores/ui-store";
import { renderWithQuery } from "@/test/utils";

const initTelegram = vi.fn();
vi.mock("@/lib/telegram/init", () => ({
  initTelegram: () => initTelegram(),
  isTelegramWebApp: () => false,
  openTelegramLink: () => false,
  openExternalLink: () => {},
}));

interface Routes {
  telegramUserId?: number;
  telegramFails?: boolean;
  refreshFails?: boolean;
  meUserId?: number;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function user(id: number) {
  return {
    id,
    username: `u${id}`,
    first_name: `User ${id}`,
    last_name: null,
    display_name: null,
    photo_url: null,
    language_code: "en",
  };
}

function stubFetch(routes: Routes) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    calls.push(url);
    if (url.includes("/auth/telegram")) {
      if (routes.telegramFails) return jsonResponse({ detail: "bad" }, 401);
      return jsonResponse({
        access_token: `tg-token-${routes.telegramUserId}`,
        access_token_expires_at: "2026-01-01T00:00:00Z",
        refresh_token_expires_at: "2026-01-01T00:00:00Z",
        user: user(routes.telegramUserId!),
      });
    }
    if (url.includes("/auth/refresh")) {
      if (routes.refreshFails) return jsonResponse({ detail: "no" }, 401);
      return jsonResponse({ access_token: `restored-token-${routes.meUserId}` });
    }
    if (url.includes("/profile/me")) return jsonResponse(user(routes.meUserId!));
    return jsonResponse({}, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

/** a fresh module graph, so the module-level bootstrap promise does not leak between tests */
async function freshBootstrap() {
  vi.resetModules();
  const hooks = await import("@/features/auth/hooks");
  const store = await import("@/stores/auth-store");
  const ui = await import("@/stores/ui-store");
  return { hooks, useAuthStore: store.useAuthStore, useUiStore: ui.useUiStore };
}

beforeEach(() => {
  initTelegram.mockReset();
  useAuthStore.setState({ status: "loading", user: null, accountEpoch: 0, returnNotice: null });
  useUiStore.getState().resetAccountState();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mini-app bootstrap", () => {
  it("authenticates with the launch data instead of a refresh cookie already in the webview", async () => {
    initTelegram.mockResolvedValue({ initDataRaw: "tg2-data", languageCode: "en", startParam: undefined });
    // the cookie would have restored TG1; the launch says TG2
    const calls = stubFetch({ telegramUserId: 2, meUserId: 1 });

    const { hooks, useAuthStore: store } = await freshBootstrap();
    render(<Bootstrapper useBootstrap={hooks.useAuthBootstrap} />);

    await waitFor(() => expect(store.getState().status).toBe("authenticated"));
    expect(store.getState().user?.id).toBe(2);
    // the session was established from init data, never from the stale cookie
    expect(calls.some((url) => url.includes("/auth/telegram"))).toBe(true);
    expect(calls.some((url) => url.includes("/auth/refresh"))).toBe(false);
  });

  it("never falls back to the cookie session when telegram auth fails", async () => {
    initTelegram.mockResolvedValue({ initDataRaw: "bad", languageCode: "en", startParam: undefined });
    // the cookie would restore account 7; the launch that failed may be someone else
    const calls = stubFetch({ telegramFails: true, meUserId: 7 });

    const { hooks, useAuthStore: store } = await freshBootstrap();
    render(<Bootstrapper useBootstrap={hooks.useAuthBootstrap} />);

    await waitFor(() => expect(store.getState().status).toBe("signed-out"));
    expect(store.getState().user).toBeNull();
    expect(store.getState().returnNotice).toBe("telegram-failed");
    expect(calls.some((url) => url.includes("/profile/me"))).toBe(false);
  });

  it("restores the browser session only when the user explicitly asks", async () => {
    initTelegram.mockResolvedValue({ initDataRaw: "bad", languageCode: "en", startParam: undefined });
    stubFetch({ telegramFails: true, meUserId: 7 });

    const { hooks, useAuthStore: store } = await freshBootstrap();
    render(<Bootstrapper useBootstrap={hooks.useAuthBootstrap} />);
    await waitFor(() => expect(store.getState().status).toBe("signed-out"));

    expect(await hooks.continueWithBrowserSession()).toBe(true);
    expect(store.getState().user?.id).toBe(7);
    expect(store.getState().returnNotice).toBeNull();
  });

  it("restores the cookie session outside telegram", async () => {
    initTelegram.mockResolvedValue(null);
    const calls = stubFetch({ meUserId: 5 });

    const { hooks, useAuthStore: store } = await freshBootstrap();
    render(<Bootstrapper useBootstrap={hooks.useAuthBootstrap} />);

    await waitFor(() => expect(store.getState().status).toBe("authenticated"));
    expect(store.getState().user?.id).toBe(5);
    expect(calls.some((url) => url.includes("/auth/telegram"))).toBe(false);
  });

  it("keeps a deep-linked story through the session resolving", async () => {
    window.history.replaceState(null, "", "/?story=deep-link-story");
    initTelegram.mockResolvedValue(null);
    stubFetch({ meUserId: 5 });

    const { hooks, useAuthStore: store, useUiStore: ui } = await freshBootstrap();
    render(<Bootstrapper useBootstrap={hooks.useAuthBootstrap} />);

    await waitFor(() => expect(store.getState().status).toBe("authenticated"));
    // establishing the session resets account-scoped UI state, so the story has
    // to be opened after it, not before
    await waitFor(() => expect(ui.getState().openStoryId).toBe("deep-link-story"));
    expect(window.location.search).toBe("");
  });

  it("signs out when neither the launch nor the cookie yields a session", async () => {
    initTelegram.mockResolvedValue(null);
    stubFetch({ refreshFails: true });

    const { hooks, useAuthStore: store } = await freshBootstrap();
    render(<Bootstrapper useBootstrap={hooks.useAuthBootstrap} />);

    await waitFor(() => expect(store.getState().status).toBe("signed-out"));
    expect(store.getState().user).toBeNull();
  });
});

function Bootstrapper({ useBootstrap }: { useBootstrap: () => void }) {
  useBootstrap();
  return null;
}

describe("account epoch", () => {
  it("bumps only when the resolved account changes", () => {
    const store = useAuthStore.getState();
    store.setSession(user(1), "authenticated");
    const afterFirst = useAuthStore.getState().accountEpoch;

    // same account re-resolved (a reload, a refresh, a repeated launch)
    useAuthStore.getState().setSession(user(1), "authenticated");
    expect(useAuthStore.getState().accountEpoch).toBe(afterFirst);

    useAuthStore.getState().setSession(user(2), "authenticated");
    expect(useAuthStore.getState().accountEpoch).toBe(afterFirst + 1);

    useAuthStore.getState().setSession(null, "signed-out");
    expect(useAuthStore.getState().accountEpoch).toBe(afterFirst + 2);
  });

  it("counts every hop of a rapid switch", () => {
    const seen: number[] = [];
    for (const id of [1, 2, 1, 3]) {
      useAuthStore.getState().setSession(user(id), "authenticated");
      seen.push(useAuthStore.getState().accountEpoch);
    }
    // returning to an account already visited is still a switch, so no epoch repeats
    expect(new Set(seen).size).toBe(4);
    expect([...seen].sort((a, b) => a - b)).toEqual(seen);
  });
});

describe("in-flight and stale replies", () => {
  it("rejects a reply that lands after the account changed", async () => {
    vi.resetModules();
    const { apiFetch, bumpAuthEpoch, setAccessToken, StaleSessionError } = await import("@/lib/api");
    setAccessToken("tg1-token");

    let release!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })),
    );

    const pending = apiFetch("/profile/me");
    bumpAuthEpoch(); // TG2 arrives while TG1's request is still open
    release(jsonResponse(user(1)));

    await expect(pending).rejects.toBeInstanceOf(StaleSessionError);
  });

  it("will not install a token refreshed for the previous account", async () => {
    vi.resetModules();
    const { refreshAccessToken, bumpAuthEpoch, getAccessToken, setAccessToken } =
      await import("@/lib/api");
    setAccessToken("tg1-token");

    let release!: (value: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })),
    );

    const pending = refreshAccessToken();
    bumpAuthEpoch();
    release(jsonResponse({ access_token: "tg1-refreshed" }));

    expect(await pending).toBe(false);
    expect(getAccessToken()).not.toBe("tg1-refreshed");
  });

  it("does not retry a previous-account request after refresh crosses a switch", async () => {
    vi.resetModules();
    const { apiFetch, bumpAuthEpoch, getAuthEpoch, setAccessToken, StaleSessionError } =
      await import("@/lib/api");
    setAccessToken("tg1-token");

    let releaseInitial!: (value: Response) => void;
    let releaseRefresh!: (value: Response) => void;
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { releaseInitial = resolve; }))
      .mockImplementationOnce(() => new Promise<Response>((resolve) => { releaseRefresh = resolve; }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = apiFetch("/profile/me");
    releaseInitial(jsonResponse({ detail: "expired" }, 401));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const previousEpoch = getAuthEpoch();
    bumpAuthEpoch();
    expect(getAuthEpoch()).toBe(previousEpoch + 1);
    releaseRefresh(jsonResponse({ access_token: "tg2-token" }));

    await expect(pending).rejects.toBeInstanceOf(StaleSessionError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("drops the previous account's access token the moment the epoch moves", async () => {
    vi.resetModules();
    const { bumpAuthEpoch, getAccessToken, setAccessToken } = await import("@/lib/api");
    setAccessToken("tg1-token");
    bumpAuthEpoch();
    expect(getAccessToken()).toBeNull();
  });
});

describe("cached account state", () => {
  it("clears the query cache and account UI state when the account changes", async () => {
    let client!: QueryClient;
    function Probe() {
      client = useQueryClient();
      return null;
    }
    render(
      <Providers>
        <Probe />
      </Providers>,
    );

    useAuthStore.getState().setSession(user(1), "authenticated");
    client.setQueryData(["profile", "stories"], [{ id: "tg1-story" }]);
    client.setQueryData(["identities"], [{ provider: "telegram" }]);
    useUiStore.getState().openStory("tg1-story", { lat: 1, lon: 2 });

    useAuthStore.getState().setSession(user(2), "authenticated");

    await waitFor(() => {
      expect(client.getQueryData(["profile", "stories"])).toBeUndefined();
    });
    expect(client.getQueryData(["identities"])).toBeUndefined();
    expect(useUiStore.getState().openStoryId).toBeNull();
    expect(useUiStore.getState().storyHistory).toEqual([]);
    expect(useUiStore.getState().storyCoords).toEqual({});
  });

  it("keeps device preferences across a switch", () => {
    useUiStore.setState({ theme: "dark", mapStyle: "bright", locale: "ru", showAllPins: false });
    useUiStore.getState().resetAccountState();

    const state = useUiStore.getState();
    expect(state.theme).toBe("dark");
    expect(state.mapStyle).toBe("bright");
    expect(state.locale).toBe("ru");
    expect(state.showAllPins).toBe(false);
  });

  it("drops an unfinished compose belonging to the previous account", () => {
    useUiStore.getState().startPickLocation();
    useUiStore.getState().pickLocation(43.2, 76.9);
    expect(useUiStore.getState().mode).toBe("compose");

    useUiStore.getState().resetAccountState();

    expect(useUiStore.getState().mode).toBe("browse");
    expect(useUiStore.getState().pickedLocation).toBeNull();
  });
});

describe("linked accounts on one Loci account", () => {
  it("does not reset anything when two Telegram accounts resolve to the same users.id", () => {
    // TG1 and TG2 are linked to the same Loci account: same data, on purpose
    useAuthStore.getState().setSession(user(1), "authenticated");
    const epoch = useAuthStore.getState().accountEpoch;
    useUiStore.getState().openStory("shared-story", { lat: 1, lon: 2 });

    // a second launch, a different Telegram identity, the same resolved account
    useAuthStore.getState().setSession(user(1), "authenticated");

    expect(useAuthStore.getState().accountEpoch).toBe(epoch);
    expect(useUiStore.getState().openStoryId).toBe("shared-story");
  });
});

describe("guarded mutations", () => {
  it("drops callbacks from a mutation whose account has changed", async () => {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const onSettled = vi.fn();

    let release!: (value: string) => void;
    let result!: ReturnType<typeof useAccountMutation<string, Error, void, unknown>>;
    function Probe() {
      result = useAccountMutation<string, Error, void, unknown>({
        mutationFn: () => new Promise<string>((resolve) => { release = resolve; }),
        onSuccess,
        onError,
        onSettled,
      });
      return null;
    }
    renderWithQuery(<Probe />);

    result.mutate();
    await waitFor(() => expect(release).toBeDefined());
    bumpAuthEpoch(); // the account switches mid-flight
    release("done");

    await waitFor(() => expect(result.isPending).toBe(false));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
  });

  it("runs callbacks normally when the account held still", async () => {
    const onSuccess = vi.fn();

    let result!: ReturnType<typeof useAccountMutation<string, Error, void, unknown>>;
    function Probe() {
      result = useAccountMutation<string, Error, void, unknown>({
        mutationFn: async () => "done",
        onSuccess,
      });
      return null;
    }
    renderWithQuery(<Probe />);

    result.mutate();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  });
});

describe("cross-tab signals", () => {
  it("ignores a signal naming the account this tab already shows", async () => {
    useAuthStore.getState().setSession(user(1), "authenticated");
    const epoch = useAuthStore.getState().accountEpoch;

    await applyAccountSignal({ userId: 1 });

    expect(useAuthStore.getState().accountEpoch).toBe(epoch);
    expect(useAuthStore.getState().user?.id).toBe(1);
  });

  it("drops this tab's session when another tab logs out", async () => {
    useAuthStore.getState().setSession(user(1), "authenticated");

    await applyAccountSignal({ userId: null });

    expect(useAuthStore.getState().status).toBe("signed-out");
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("adopts the account another tab switched to", async () => {
    stubFetch({ meUserId: 2 });
    useAuthStore.setState({ inTelegram: false });
    useAuthStore.getState().setSession(user(1), "authenticated");

    await applyAccountSignal({ userId: 2 });

    expect(useAuthStore.getState().user?.id).toBe(2);
  });

  it("does not echo a signal back to the tab that sent it", async () => {
    stubFetch({ meUserId: 2 });
    const posted: unknown[] = [];
    class Recorder {
      postMessage(message: unknown) { posted.push(message); }
      close() {}
      addEventListener() {}
      removeEventListener() {}
    }
    vi.stubGlobal("BroadcastChannel", Recorder);
    useAuthStore.setState({ inTelegram: false });
    useAuthStore.getState().setSession(user(1), "authenticated");
    posted.length = 0;

    // tab A announced account 2; this tab must converge without announcing back,
    // or tab A would be told to sign out the session it just created
    await applyAccountSignal({ userId: 2 });

    expect(useAuthStore.getState().user?.id).toBe(2);
    expect(posted).toEqual([]);
  });

  it("still announces a switch this tab made itself", () => {
    const posted: unknown[] = [];
    class Recorder {
      postMessage(message: unknown) { posted.push(message); }
      close() {}
      addEventListener() {}
      removeEventListener() {}
    }
    vi.stubGlobal("BroadcastChannel", Recorder);
    useAuthStore.getState().setSession(user(1), "authenticated");
    posted.length = 0;

    applySession(user(3), "token-3");

    expect(posted).toEqual([{ userId: 3 }]);
  });

  it("does not silently adopt a session inside Telegram", async () => {
    stubFetch({ meUserId: 2 });
    useAuthStore.getState().setSession(user(1), "authenticated");
    useAuthStore.setState({ inTelegram: true });

    await applyAccountSignal({ userId: 2 });

    // the launch identity decides here, not a cookie another tab left behind
    expect(useAuthStore.getState().status).toBe("signed-out");
  });
});
