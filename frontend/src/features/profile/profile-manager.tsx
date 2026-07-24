"use client";

import { ArrowLeft, BookmarkX, MapPinned, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AccountSettings } from "@/features/auth/account-settings";
import { AuthPanel } from "@/features/auth/auth-panel";
import { useTelegramAuth } from "@/features/auth/hooks";
import { useMyBookmarks, useMyStories } from "@/features/profile/hooks";
import { StoryListItem } from "@/features/stories/components/story-list-item";
import { useCategories } from "@/features/stories/hooks";
import { StorySheet } from "@/features/stories/story-sheet";
import { useDict } from "@/lib/i18n/use-dict";
import { useUiStore } from "@/stores/ui-store";

type Tab = "stories" | "saved";

export function ProfileManager() {
  const t = useDict();
  const { status, user } = useTelegramAuth();
  const authenticated = status === "authenticated";
  const openStory = useUiStore((state) => state.openStory);

  const [tab, setTab] = useState<Tab>("stories");
  const { data: categories = [] } = useCategories();
  const { data: myStories } = useMyStories(authenticated);
  const { data: bookmarks } = useMyBookmarks(authenticated);

  const list = tab === "stories" ? myStories : bookmarks;

  return (
    <main className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-lg px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label={t.exploreMap} className="rounded p-1.5 text-muted">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-[20px] font-semibold">{t.profile}</h1>
          {authenticated && user?.is_admin && (
            <Link
              href="/admin"
              className="ml-auto flex items-center gap-1.5 rounded bg-surface px-3 py-1.5 text-[13px] font-medium text-accent"
            >
              <ShieldCheck size={16} /> {t.moderation}
            </Link>
          )}
        </div>

        {status === "signed-out" && (
          <div className="py-12">
            <AuthPanel />
          </div>
        )}

        {authenticated && user && (
          <>
            <div className="mt-4 flex items-center gap-3">
              {user.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.photo_url} alt="" className="h-12 w-12 rounded-full" />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface text-[17px] font-semibold">
                  {(user.first_name ?? user.username ?? "?").slice(0, 1)}
                </span>
              )}
              <div>
                <div className="text-[17px] font-semibold">
                  {user.first_name ?? user.username}
                </div>
                {user.username && <div className="text-[13px] text-muted">@{user.username}</div>}
              </div>
              <div className="ml-auto text-right">
                <div className="text-[20px] font-semibold">{myStories?.length ?? 0}</div>
                <div className="text-[13px] text-muted">{t.storiesCount}</div>
              </div>
            </div>

            <div className="mt-5 flex rounded border border-border p-0.5" role="tablist">
              <button
                role="tab"
                aria-selected={tab === "stories"}
                onClick={() => setTab("stories")}
                className={`flex-1 rounded px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 ease-lm ${tab === "stories" ? "bg-accent text-accent-text" : "text-muted"}`}
              >
                {t.myStories}
              </button>
              <button
                role="tab"
                aria-selected={tab === "saved"}
                onClick={() => setTab("saved")}
                className={`flex-1 rounded px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 ease-lm ${tab === "saved" ? "bg-accent text-accent-text" : "text-muted"}`}
              >
                {t.savedStories}
              </button>
            </div>

            <div className="mt-2">
              {list?.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  {tab === "stories" ? (
                    <MapPinned size={24} className="text-muted" />
                  ) : (
                    <BookmarkX size={24} className="text-muted" />
                  )}
                  <span className="text-[13px] text-muted">
                    {tab === "stories" ? t.noStoriesYet : t.noSavedYet}
                  </span>
                  <Link href="/" className="text-[13px] font-medium text-accent">
                    {tab === "stories" ? t.addFirstStory : t.exploreMap}
                  </Link>
                </div>
              )}
              {list?.map((story) => (
                <StoryListItem
                  key={story.id}
                  story={story}
                  categories={categories}
                  onOpen={openStory}
                  showStatus={tab === "stories"}
                />
              ))}
            </div>

            <AccountSettings />
          </>
        )}
      </div>
      <StorySheet authenticated={authenticated} onBackToSource={() => useUiStore.getState().closeStory()} />
    </main>
  );
}
