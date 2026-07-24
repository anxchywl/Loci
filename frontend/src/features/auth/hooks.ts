"use client";

import { useEffect } from "react";

import { fetchCurrentUser, postTelegramAuth, type AuthUser } from "@/features/auth/api";
import { refreshAccessToken, setAccessToken } from "@/lib/api";
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

async function restoreSession(): Promise<AuthUser | null> {
  if (!(await refreshAccessToken())) return null;
  try {
    return await fetchCurrentUser();
  } catch {
    setAccessToken(null);
    return null;
  }
}

export function applySession(user: AuthUser, accessToken: string): void {
  setAccessToken(accessToken);
  const store = useAuthStore.getState();
  store.setReturnNotice(null);
  store.setSession(user, "authenticated");
}

export function signOutState(): void {
  setAccessToken(null);
  const store = useAuthStore.getState();
  store.setReturnNotice(null);
  store.setSession(null, "signed-out");
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

function consumeStoryParam(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const storyId = params.get("story");
  if (!storyId) return;
  params.delete("story");
  const query = params.toString();
  window.history.replaceState(null, "", window.location.pathname + (query ? `?${query}` : "") + window.location.hash);
  useUiStore.getState().openStory(storyId);
}

async function bootstrap(): Promise<void> {
  const { setReturnNotice, setSession } = useAuthStore.getState();
  setReturnNotice(consumeAuthReturn());
  consumeStoryParam();
  const launchPromise = initTelegram();

  const restored = await restoreSession();
  if (restored) {
    setSession(restored, "authenticated");
    const launch = await launchPromise;
    applyTelegramLaunch(launch);
    handleStartParam(launch);
    return;
  }

  const launch = await launchPromise;
  applyTelegramLaunch(launch);
  if (!launch) {
    setSession(null, "signed-out");
    return;
  }
  try {
    const response = await postTelegramAuth(launch.initDataRaw);
    setAccessToken(response.access_token);
    setSession(response.user, "authenticated");
    handleStartParam(launch);
  } catch {
    setSession(null, "signed-out");
  }
}

export function useAuthBootstrap(): void {
  useEffect(() => {
    if (!bootstrapPromise) bootstrapPromise = bootstrap();
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
