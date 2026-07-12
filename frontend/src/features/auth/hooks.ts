"use client";

import { useEffect, useState } from "react";

import { postTelegramAuth, type AuthUser } from "@/features/auth/api";
import { setAccessToken } from "@/lib/api";
import { resolveLocale } from "@/lib/i18n/dict";
import { initTelegram } from "@/lib/telegram/init";
import { useUiStore } from "@/stores/ui-store";

export type AuthStatus = "loading" | "authenticated" | "signed-out";

let cachedUser: AuthUser | null = null;

export function useTelegramAuth(): { status: AuthStatus; user: AuthUser | null } {
  const [status, setStatus] = useState<AuthStatus>(cachedUser ? "authenticated" : "loading");
  const [user, setUser] = useState<AuthUser | null>(cachedUser);
  const setLocale = useUiStore((state) => state.setLocale);
  const openStory = useUiStore((state) => state.openStory);

  useEffect(() => {
    if (cachedUser) return;
    const launch = initTelegram();
    if (!launch) {
      setStatus("signed-out");
      return;
    }

    setLocale(resolveLocale(launch.languageCode));
    let cancelled = false;
    postTelegramAuth(launch.initDataRaw)
      .then((response) => {
        if (cancelled) return;
        setAccessToken(response.access_token);
        cachedUser = response.user;
        setUser(response.user);
        setStatus("authenticated");
        if (launch.startParam) {
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
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("signed-out");
      });
    return () => {
      cancelled = true;
    };
  }, [setLocale, openStory]);

  return { status, user };
}
