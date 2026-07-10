"use client";

import { Flame, Navigation, Plus, Search, UserRound, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useTelegramAuth } from "@/features/auth/hooks";
import { MapView, type MapBounds } from "@/features/map/map-view";
import { AddStorySheet } from "@/features/stories/add-story-sheet";
import { BottomSheet } from "@/features/stories/components/bottom-sheet";
import { CategoryChip } from "@/features/stories/components/category-chip";
import { StoryListItem } from "@/features/stories/components/story-list-item";
import {
  useBboxStories,
  useCategories,
  useSearch,
  useTrending,
} from "@/features/stories/hooks";
import { StorySheet } from "@/features/stories/story-sheet";
import { useDict } from "@/lib/i18n/use-dict";
import { useUiStore } from "@/stores/ui-store";

function Toast() {
  const toast = useUiStore((state) => state.toast);
  const clearToast = useUiStore((state) => state.clearToast);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(clearToast, 2500);
    return () => clearTimeout(timer);
  }, [toast, clearToast]);

  if (!toast) return null;
  return (
    <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded bg-text px-4 py-2 text-[13px] font-medium text-bg">
      {toast}
    </div>
  );
}

export function HomeManager() {
  const t = useDict();
  const { status } = useTelegramAuth();
  const authenticated = status === "authenticated";

  const mode = useUiStore((state) => state.mode);
  const categoryFilter = useUiStore((state) => state.categoryFilter);
  const setCategoryFilter = useUiStore((state) => state.setCategoryFilter);
  const startPickLocation = useUiStore((state) => state.startPickLocation);
  const cancelCompose = useUiStore((state) => state.cancelCompose);
  const trendingOpen = useUiStore((state) => state.trendingOpen);
  const setTrendingOpen = useUiStore((state) => state.setTrendingOpen);
  const openStory = useUiStore((state) => state.openStory);
  const requestPanTo = useUiStore((state) => state.requestPanTo);

  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: categories = [] } = useCategories();
  const { data: stories = [] } = useBboxStories(
    bounds && { ...bounds, categoryId: categoryFilter },
  );
  const { data: trendingStories } = useTrending(trendingOpen);
  const { data: searchResults } = useSearch(searchQuery);

  const searching = searchQuery.trim().length >= 2;

  const locateMe = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.LocationManager) {
      const lm = tg.LocationManager;
      const fetchLocation = () => {
        if (!lm.isLocationAvailable) {
          useUiStore.getState().showToast(t.errorLocationDenied);
          return;
        }
        lm.getLocation((data: any) => {
          if (data && data.latitude !== undefined) {
            requestPanTo(data.latitude, data.longitude, 14);
          } else {
            useUiStore.getState().showToast(t.errorGeneric);
          }
        });
      };

      if (!lm.isInited) {
        lm.init(() => fetchLocation());
      } else {
        fetchLocation();
      }
      return;
    }

    if (!navigator.geolocation) {
      useUiStore.getState().showToast(t.errorGeneric);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        requestPanTo(position.coords.latitude, position.coords.longitude, 14);
      },
      (error) => {
        console.error("Geolocation error:", error);
        useUiStore.getState().showToast(
          error.code === error.PERMISSION_DENIED ? t.errorLocationDenied : t.errorGeneric
        );
      },
      { enableHighAccuracy: true }
    );
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg">
      <MapView categories={categories} stories={stories} onBoundsChange={setBounds} />

      {mode !== "compose" && (
        <div className="absolute inset-x-0 top-0 space-y-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-bg px-3 py-2">
              <Search size={16} className="shrink-0 text-muted" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t.searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
              />
              {searchQuery && (
                <button aria-label={t.cancel} onClick={() => setSearchQuery("")}>
                  <X size={16} className="text-muted" />
                </button>
              )}
            </div>
            <Link
              href="/profile"
              aria-label={t.profile}
              className="rounded-full border border-border bg-bg p-2.5 text-muted"
            >
              <UserRound size={18} />
            </Link>
          </div>

          {!searching && (
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
              {categories.map((category) => (
                <CategoryChip
                  key={category.id}
                  category={category}
                  selected={categoryFilter === category.id}
                  onClick={() =>
                    setCategoryFilter(categoryFilter === category.id ? null : category.id)
                  }
                />
              ))}
            </div>
          )}

          {searching && (
            <div className="max-h-[50dvh] overflow-y-auto rounded-sheet border border-border bg-bg">
              <div className="px-4">
                {searchResults?.length === 0 && (
                  <div className="py-6 text-center text-[13px] text-muted">{t.noResults}</div>
                )}
                {searchResults?.map((story) => (
                  <StoryListItem
                    key={story.id}
                    story={story}
                    categories={categories}
                    onOpen={(id) => {
                      setSearchQuery("");
                      openStory(id);
                      requestPanTo(story.lat, story.lon);
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "pick-location" && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-bg p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <span className="text-[15px] font-medium">{t.tapMapToPlace}</span>
          <button
            onClick={cancelCompose}
            className="rounded-full border border-border px-4 py-2 text-[13px] font-medium text-muted"
          >
            {t.cancel}
          </button>
        </div>
      )}

      {mode === "browse" && (
        <>
          <button
            aria-label={t.trending}
            onClick={() => setTrendingOpen(true)}
            className="absolute bottom-6 left-4 flex items-center gap-1.5 rounded-full border border-border bg-bg px-4 py-2.5 text-[13px] font-medium shadow-sm transition-transform duration-150 ease-lm active:scale-95"
          >
            <Flame size={15} />
            {t.trending}
          </button>
          {authenticated && (
            <button
              aria-label={t.addStory}
              onClick={startPickLocation}
              className="absolute bottom-6 right-4 rounded-full bg-accent p-4 text-accent-text shadow-lg transition-transform duration-150 ease-lm active:scale-95"
            >
              <Plus size={22} />
            </button>
          )}
          <button
            aria-label={t.locateMe}
            onClick={locateMe}
            style={{ bottom: authenticated ? '5.5rem' : '1.5rem' }}
            className="absolute right-4 z-10 flex items-center justify-center rounded-full border border-border bg-bg p-3 text-muted shadow-sm transition-transform duration-150 ease-lm active:scale-95"
          >
            <Navigation size={20} />
          </button>
        </>
      )}

      <BottomSheet
        open={trendingOpen}
        onClose={() => setTrendingOpen(false)}
        title={t.trending}
      >
        {trendingStories?.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Flame size={24} className="text-muted" />
            <span className="text-[13px] text-muted">{t.noStoriesYet}</span>
          </div>
        )}
        {trendingStories?.map((story) => (
          <StoryListItem
            key={story.id}
            story={story}
            categories={categories}
            onOpen={(id) => {
              openStory(id);
              requestPanTo(story.lat, story.lon);
            }}
          />
        ))}
      </BottomSheet>

      <StorySheet authenticated={authenticated} />
      <AddStorySheet />
      <Toast />
    </main>
  );
}
