"use client";

import { useEffect, useState } from "react";

import { fetchCurrentUser, postTelegramAuth, type AuthUser } from "@/features/auth/api";
import { refreshAccessToken, setAccessToken } from "@/lib/api";
import { resolveLocale } from "@/lib/i18n/dict";
import { initTelegram, type TelegramLaunch } from "@/lib/telegram/init";
import { useUiStore } from "@/stores/ui-store";

export type AuthStatus = "loading" | "authenticated" | "signed-out";

let cachedUser: AuthUser | null = null;

// Telegram reuses the same initData for the lifetime of a launch, so re-submitting it
// on every reopen trips the backend's single-use replay guard. Restore the persistent
// refresh-token session first and only fall back to a fresh Telegram auth when there
// is no session to restore.
async function restoreSession(): Promise<AuthUser | null> {
  if (!(await refreshAccessToken())) return null;
  try {
    return await fetchCurrentUser();
  } catch {
    setAccessToken(null);
    return null;
  }
}

export function useTelegramAuth(): { status: AuthStatus; user: AuthUser | null } {
  const [status, setStatus] = useState<AuthStatus>(cachedUser ? "authenticated" : "loading");
  const [user, setUser] = useState<AuthUser | null>(cachedUser);
  const setLocale = useUiStore((state) => state.setLocale);
  const openStory = useUiStore((state) => state.openStory);

  useEffect(() => {
    if (cachedUser) return;
    let cancelled = false;

    const handleStartParam = (launch: TelegramLaunch | null): void => {
      if (!launch?.startParam) return;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(launch.startParam);
      if (isUuid) {
        openStory(launch.startParam);
      } else {
        // It's a share_token, fetch the story by token to get its true ID
        import("@/features/stories/api").then(({ fetchStoryByToken }) => {
          fetchStoryByToken(launch.startParam!)
            .then((story) => openStory(story.id))
            .catch(() => { /* handle invalid token gracefully */ });
        });
      }
    };

    void (async () => {
      const launch = await initTelegram();
      if (cancelled) return;
      if (launch) setLocale(resolveLocale(launch.languageCode));

      const applyUser = (authUser: AuthUser): void => {
        cachedUser = authUser;
        setUser(authUser);
        setStatus("authenticated");
        handleStartParam(launch);
      };

      // 1. Try restoring an existing session via the refresh cookie.
      const restored = await restoreSession();
      if (cancelled) return;
      if (restored) {
        applyUser(restored);
        return;
      }

      // 2. No session to restore — authenticate fresh via Telegram initData.
      if (!launch) {
        setStatus("signed-out");
        return;
      }
      try {
        const response = await postTelegramAuth(launch.initDataRaw);
        if (cancelled) return;
        setAccessToken(response.access_token);
        applyUser(response.user);
      } catch {
        if (!cancelled) setStatus("signed-out");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setLocale, openStory]);

  return { status, user };
}
