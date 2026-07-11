"use client";

import { Flame, Navigation, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useTelegramAuth } from "@/features/auth/hooks";
import { DesktopSidebar, type Panel } from "@/features/home/desktop-sidebar";
import { MapView, type MapBounds, type MapViewHandle } from "@/features/map/map-view";
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
import { locate } from "@/lib/telegram/location";
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
    <div className="fixed bottom-24 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 break-words rounded bg-text px-4 py-2 text-center text-[13px] font-medium text-bg">
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
  const openStoryId = useUiStore((state) => state.openStoryId);
  const requestPanTo = useUiStore((state) => state.requestPanTo);

  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<Panel>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mapViewRef = useRef<MapViewHandle>(null);

  const { data: categories = [] } = useCategories();
  const { data: stories = [] } = useBboxStories(
    bounds && { ...bounds, categoryId: categoryFilter },
  );
  const { data: trendingStories } = useTrending(trendingOpen);
  const { data: searchResults } = useSearch(searchQuery);

  const searching = searchQuery.trim().length >= 2;
  const [locating, setLocating] = useState(false);

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
  }, []);

  // Reset panel when sidebar closes
  useEffect(() => {
    if (!sidebarOpen) {
      const id = setTimeout(() => setActivePanel(null), 230);
      return () => clearTimeout(id);
    }
  }, [sidebarOpen]);

  // On desktop, open story in sidebar instead of bottom sheet
  useEffect(() => {
    if (!openStoryId) return;
    const isDesktop = window.matchMedia("(min-width: 1024px)").matches;
    if (!isDesktop) return;
    setSidebarOpen(true);
    setActivePanel("story");
  }, [openStoryId]);

  const locateMe = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const outcome = await locate();
      if (outcome.kind === "located") {
        requestPanTo(outcome.lat, outcome.lon, 14);
      } else if (outcome.kind === "denied") {
        useUiStore.getState().showToast(t.errorLocationDenied);
      } else if (outcome.kind === "unsupported") {
        useUiStore.getState().showToast(t.errorGeneric);
      }
    } finally {
      setLocating(false);
    }
  };

  // locate button bottom, zoom buttons sit 52px above it (44px button + 8px gap)
  const locateBottom = authenticated ? "5.5rem" : "1.5rem";
  const zoomBottom = authenticated ? "calc(5.5rem + 52px)" : "calc(1.5rem + 52px)";

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg">
      <MapView ref={mapViewRef} categories={categories} stories={stories} onBoundsChange={setBounds} />

      <DesktopSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpen={() => setSidebarOpen(true)}
        onTrending={() => setTrendingOpen(true)}
        onNearby={locateMe}
        onSearchFocus={focusSearch}
        activePanel={activePanel}
        onSetActivePanel={setActivePanel}
        storyId={openStoryId}
        authenticated={authenticated}
      />

      {/* Search + categories bar */}
      {mode !== "compose" && (
        <div
          className={[
            "absolute inset-x-0 top-0 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]",
            "transition-[padding-left] duration-[230ms] ease-lm",
            sidebarOpen ? "lg:pl-[332px]" : "lg:pl-14",
          ].join(" ")}
        >
          {/* Mobile: stacked layout */}
          <div className="flex flex-col gap-2 lg:hidden">
            <div className="flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-2">
              <Search size={16} className="shrink-0 text-muted" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
              />
              {searchQuery && (
                <button aria-label={t.cancel} onClick={() => setSearchQuery("")}>
                  <X size={16} className="text-muted" />
                </button>
              )}
            </div>
            {!searching && (
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                {categories.map((cat) => (
                  <CategoryChip key={cat.id} category={cat} selected={categoryFilter === cat.id}
                    onClick={() => setCategoryFilter(categoryFilter === cat.id ? null : cat.id)} />
                ))}
              </div>
            )}
          </div>

          {/* Desktop: single row — compact search + scrollable categories */}
          <div className="hidden lg:flex items-center gap-2">
            <div className="flex w-[200px] shrink-0 items-center gap-2 rounded-full border border-border bg-bg px-3 py-1.5">
              <Search size={14} className="shrink-0 text-muted" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted"
              />
              {searchQuery && (
                <button aria-label={t.cancel} onClick={() => setSearchQuery("")}>
                  <X size={14} className="text-muted" />
                </button>
              )}
            </div>
            {!searching && (
              <div className="flex flex-1 gap-2 overflow-x-auto [scrollbar-width:none]">
                {categories.map((cat) => (
                  <CategoryChip key={cat.id} category={cat} selected={categoryFilter === cat.id}
                    onClick={() => setCategoryFilter(categoryFilter === cat.id ? null : cat.id)} />
                ))}
              </div>
            )}
          </div>

          {/* Search results (both layouts) */}
          {searching && (
            <div className="mt-2 max-h-[50dvh] overflow-y-auto rounded-sheet border border-border bg-bg">
              <div className="px-4">
                {searchResults?.length === 0 && (
                  <div className="py-6 text-center text-[13px] text-muted">{t.noResults}</div>
                )}
                {searchResults?.map((story) => (
                  <StoryListItem key={story.id} story={story} categories={categories}
                    onOpen={(id) => { setSearchQuery(""); openStory(id); requestPanTo(story.lat, story.lon); }} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "pick-location" && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-bg p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <span className="text-[15px] font-medium">{t.tapMapToPlace}</span>
          <button onClick={cancelCompose} className="rounded-full border border-border px-4 py-2 text-[13px] font-medium text-muted">
            {t.cancel}
          </button>
        </div>
      )}

      {mode === "browse" && (
        <>
          {/* Trending — mobile only */}
          <button
            aria-label={t.trending}
            onClick={() => setTrendingOpen(true)}
            className="absolute bottom-6 left-4 flex items-center gap-1.5 rounded-full border border-border bg-bg px-4 py-2.5 text-[13px] font-medium shadow-sm transition-transform duration-150 ease-lm active:scale-95 lg:hidden"
          >
            <Flame size={15} />
            {t.trending}
          </button>

          {authenticated && (
            <button aria-label={t.addStory} onClick={startPickLocation}
              className="absolute bottom-6 right-4 rounded-full bg-accent p-4 text-accent-text shadow-lg transition-transform duration-150 ease-lm active:scale-95">
              <Plus size={22} />
            </button>
          )}

          {/* Locate me */}
          <button
            aria-label={t.locateMe}
            onClick={locateMe}
            disabled={locating}
            style={{ bottom: locateBottom }}
            className="absolute right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-bg text-muted shadow-sm transition-transform duration-150 ease-lm active:scale-95 disabled:opacity-50"
          >
            <Navigation size={20} className={locating ? "animate-pulse" : undefined} />
          </button>

          {/* Zoom controls — above locate */}
          <div
            className="absolute right-4 z-10 flex flex-col overflow-hidden rounded-lg border border-border bg-bg shadow-sm"
            style={{ bottom: zoomBottom }}
          >
            <button aria-label="Zoom in" onClick={() => mapViewRef.current?.zoomIn()}
              className="flex h-[42px] w-11 items-center justify-center text-[20px] leading-none text-text transition-colors hover:bg-surface active:bg-surface">
              +
            </button>
            <div className="h-px bg-border" />
            <button aria-label="Zoom out" onClick={() => mapViewRef.current?.zoomOut()}
              className="flex h-[42px] w-11 items-center justify-center text-[20px] leading-none text-text transition-colors hover:bg-surface active:bg-surface">
              −
            </button>
          </div>
        </>
      )}

      <BottomSheet open={trendingOpen} onClose={() => setTrendingOpen(false)} title={t.trending}>
        {trendingStories?.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Flame size={24} className="text-muted" />
            <span className="text-[13px] text-muted">{t.noStoriesYet}</span>
          </div>
        )}
        {trendingStories?.map((story) => (
          <StoryListItem key={story.id} story={story} categories={categories}
            onOpen={(id) => { openStory(id); requestPanTo(story.lat, story.lon); }} />
        ))}
      </BottomSheet>

      <div className="lg:hidden">
        <StorySheet authenticated={authenticated} />
      </div>
      <AddStorySheet />
      <Toast />
    </main>
  );
}
