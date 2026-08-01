"use client";

import { useEffect } from "react";

import { fetchCurrentUser, postTelegramAuth, type AuthUser } from "@/features/auth/api";
import { getAccessToken, refreshAccessToken, setAccessToken } from "@/lib/api";
import { publishAccountSignal, type AccountSignal } from "@/lib/auth/cross-tab";
import { resolveLocale } from "@/lib/i18n/dict";
import { initTelegram, type TelegramLaunch } from "@/lib/telegram/init";
import {
  useAuthStore,
  type AuthReturnNotice,
  type AuthStatus,
} from "@/stores/auth-store";
import { useUiStore } from "@/stores/ui-store";

export type { AuthStatus };

let bootstrapPromise: Promise<void> | null = null;

async function restoreSession(): Promise<{ user: AuthUser; accessToken: string } | null> {
  if (!(await refreshAccessToken())) return null;
  const accessToken = getAccessToken();
  if (!accessToken) return null;
  try {
    return { user: await fetchCurrentUser(), accessToken };
  } catch {
    setAccessToken(null);
    return null;
  }
}

/**
 * setSession first: switching accounts bumps the auth epoch, which drops the
 * previous account's token and cached data. Installing the new token after that
 * is what keeps the bump from clearing the token we just received.
 */
function installSession(user: AuthUser, accessToken: string): void {
  const previousId = useAuthStore.getState().user?.id ?? null;
  useAuthStore.getState().setSession(user, "authenticated");
  setAccessToken(accessToken);
  if (previousId !== user.id) publish({ userId: user.id });
}

export function applySession(user: AuthUser, accessToken: string): void {
  useAuthStore.getState().setReturnNotice(null);
  installSession(user, accessToken);
}

export function signOutState(): void {
  const store = useAuthStore.getState();
  const hadSession = store.user !== null;
  store.setReturnNotice(null);
  store.setSession(null, "signed-out");
  setAccessToken(null);
  if (hadSession) publish({ userId: null });
}

/**
 * Applying a signal must not send one back. Without this, a tab told "the
 * account is now 2" signs out, announces `null`, and the tab that just signed in
 * obediently signs itself out too — the tabs talk each other out of a session.
 * Only ever held across synchronous state changes.
 */
let applyingRemoteSignal = false;

function publish(signal: AccountSignal): void {
  if (!applyingRemoteSignal) publishAccountSignal(signal);
}

function silently(apply: () => void): void {
  applyingRemoteSignal = true;
  try {
    apply();
  } finally {
    applyingRemoteSignal = false;
  }
}

/**
 * Another tab reported a different account (a switch, a logout, or a revoked
 * session). Drop everything this tab is holding first, then — outside Telegram,
 * where a launch identity would be authoritative — adopt whatever session the
 * shared cookie now resolves to, so the tabs converge instead of stranding this
 * one on a stale view.
 */
export async function applyAccountSignal(signal: AccountSignal): Promise<void> {
  const state = useAuthStore.getState();
  if ((state.user?.id ?? null) === signal.userId) return;
  const { inTelegram } = state;
  silently(signOutState);
  if (signal.userId === null || inTelegram) return;

  const restored = await restoreSession();
  if (restored) silently(() => installSession(restored.user, restored.accessToken));
}

function consumeAuthReturn(): AuthReturnNotice {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const value = params.get("auth");
  if (value !== "cancelled" && value !== "error") return null;
  params.delete("auth");
  const query = params.toString();
  const url = window.location.pathname + (query ? `?${query}` : "") + window.location.hash;
  window.history.replaceState(null, "", url);
  return value;
}

function applyTelegramLaunch(launch: TelegramLaunch | null): void {
  const store = useAuthStore.getState();
  store.setInTelegram(launch !== null);
  if (launch) useUiStore.getState().setLocale(resolveLocale(launch.languageCode));
}

function handleStartParam(launch: TelegramLaunch | null): void {
  if (!launch?.startParam) return;
  const openStory = useUiStore.getState().openStory;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(launch.startParam);
  if (isUuid) {
    openStory(launch.startParam);
  } else {
    import("@/features/stories/api").then(({ fetchStoryByToken }) => {
      fetchStoryByToken(launch.startParam!)
        .then((story) => openStory(story.id))
        .catch(() => {});
    });
  }
}

interface StoryTarget {
  storyId: string | null;
  shareToken: string | null;
}

/**
 * Takes the story a link points at out of the URL: `?story=<id>` from our own
 * redirects, and `?s=<share_token>` from a shared web link. Reading and opening
 * are separate steps because resolving the session in between resets
 * account-scoped UI state, which would discard an already-opened story.
 */
function consumeStoryParam(): StoryTarget | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const storyId = params.get("story");
  const shareToken = params.get("s");
  if (!storyId && !shareToken) return null;
  params.delete("story");
  params.delete("s");
  const query = params.toString();
  window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : "") + window.location.hash);
  return { storyId, shareToken };
}

function openStoryTarget(target: StoryTarget | null): void {
  if (!target) return;
  if (target.storyId) {
    useUiStore.getState().openStory(target.storyId);
    return;
  }
  import("@/features/stories/api").then(({ fetchStoryByToken }) => {
    fetchStoryByToken(target.shareToken!)
      .then((story) => useUiStore.getState().openStory(story.id))
      .catch(() => {});
  });
}

/**
 * Inside a Telegram launch the signed `initData` is the authoritative identity
 * for this surface, so it is the only thing we authenticate with — never the
 * refresh cookie that happens to still be in the webview. Answering from the
 * cookie is what let a previous Telegram account (TG1) stay signed in after the
 * client switched to TG2.
 *
 * When Telegram auth fails we stop rather than fall back: a transient failure
 * must not hand TG2 whatever session the cookie still holds. Continuing with
 * that session is offered as an explicit choice instead.
 */
async function bootstrap(): Promise<void> {
  const store = useAuthStore.getState();
  store.setReturnNotice(consumeAuthReturn());
  const storyTarget = consumeStoryParam();

  const launch = await initTelegram();
  applyTelegramLaunch(launch);

  if (launch) {
    try {
      const response = await postTelegramAuth(launch.initDataRaw);
      installSession(response.user, response.access_token);
      openStoryTarget(storyTarget);
      handleStartParam(launch);
    } catch {
      signOutState();
      useAuthStore.getState().setReturnNotice("telegram-failed");
      openStoryTarget(storyTarget);
    }
    return;
  }

  const restored = await restoreSession();
  if (!restored) {
    useAuthStore.getState().setSession(null, "signed-out");
    setAccessToken(null);
    openStoryTarget(storyTarget);
    return;
  }
  installSession(restored.user, restored.accessToken);
  openStoryTarget(storyTarget);
}

/**
 * The explicit way out of a failed Telegram launch: the user asks for the
 * session the browser already holds, instead of it being restored behind their
 * back. Any account it resolves to goes through the same identity-change reset.
 */
export async function continueWithBrowserSession(): Promise<boolean> {
  const restored = await restoreSession();
  if (!restored) {
    signOutState();
    return false;
  }
  useAuthStore.getState().setReturnNotice(null);
  installSession(restored.user, restored.accessToken);
  return true;
}

export function useAuthBootstrap(): void {
  useEffect(() => {
    if (!bootstrapPromise) bootstrapPromise = bootstrap();
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      bootstrapPromise = bootstrap();
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);
}

export function useAuth(): { status: AuthStatus; user: AuthUser | null; inTelegram: boolean } {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const inTelegram = useAuthStore((state) => state.inTelegram);
  useAuthBootstrap();
  return { status, user, inTelegram };
}

export const useTelegramAuth = useAuth;
