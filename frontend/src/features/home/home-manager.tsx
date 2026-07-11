"use client";

import {
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Flame,
  Info,
  MapPin,
  Menu,
  Navigation,
  Plus,
  Search,
  UserRound,
  X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useTelegramAuth } from "@/features/auth/hooks";
import {
  AboutPanel,
  DesktopSidebar,
  ProfilePanel,
  SettingsPanel,
  type Panel,
} from "@/features/home/desktop-sidebar";
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<Panel>(null);
  const [nearbyLocation, setNearbyLocation] = useState<{ lat: number; lon: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mapViewRef = useRef<MapViewHandle>(null);

  const { data: categories = [] } = useCategories();
  const { data: stories = [] } = useBboxStories(
    bounds && { ...bounds, categoryId: categoryFilter },
  );
  const nearbyBounds = nearbyLocation
    ? {
        minLat: nearbyLocation.lat - 0.018,
        maxLat: nearbyLocation.lat + 0.018,
        minLon: nearbyLocation.lon - 0.018,
        maxLon: nearbyLocation.lon + 0.018,
        categoryId: null,
      }
    : null;
  const { data: nearbyStories = [] } = useBboxStories(nearbyBounds);
  const { data: trendingStories } = useTrending(trendingOpen || mobilePanel === "trending");
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

  const handleNearby = async () => {
    const outcome = await locate();
    if (outcome.kind === "located") {
      setNearbyLocation({ lat: outcome.lat, lon: outcome.lon });
      requestPanTo(outcome.lat, outcome.lon, 14);
    } else {
      useUiStore.getState().showToast(
        outcome.kind === "denied" ? t.errorLocationDenied : t.errorGeneric
      );
    }
  };

  // locate button bottom; zoom buttons sit 40px above it (36px button + 4px gap)
  const locateBottom = "1.5rem";
  const zoomBottom = "calc(1.5rem + 40px)";

  const openMobilePanel = (panel: Panel) => {
    if (panel === "nearby") {
      void handleNearby();
    }
    setMobilePanel(panel);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    window.setTimeout(() => setMobilePanel(null), 250);
  };

  const mobilePanelTitles: Record<Exclude<Panel, "story" | null>, string> = {
    "my-stories": t.myStories,
    saved: t.savedStories,
    about: t.about,
    profile: t.profile,
    nearby: t.nearby,
    trending: t.trending,
    settings: t.themeLabel,
  };

  const mobileMenuItems: {
    panel: Exclude<Panel, "story" | null>;
    label: string;
    icon: React.ReactNode;
  }[] = [
    { panel: "saved", label: t.savedStories, icon: <Bookmark size={16} /> },
    { panel: "my-stories", label: t.myStories, icon: <BookOpen size={16} /> },
  ];

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg">
      <MapView ref={mapViewRef} categories={categories} stories={stories} onBoundsChange={setBounds} />

      <DesktopSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpen={() => setSidebarOpen(true)}
        activePanel={activePanel}
        onSetActivePanel={setActivePanel}
        storyId={openStoryId}
        nearbyLocation={nearbyLocation}
        onNearby={handleNearby}
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
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-bg px-3 py-2 shadow-sm transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-[var(--lm-focus)]">
                <Search size={16} className="shrink-0 text-muted" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
                />
                {searchQuery && (
                  <button aria-label={t.cancel} onClick={() => setSearchQuery("")} className="rounded text-muted transition-colors hover:text-accent focus-visible:text-accent">
                    <X size={16} />
                  </button>
                )}
              </div>
              <button
                aria-label={t.menu}
                onClick={() => setMobileMenuOpen(true)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-bg text-text shadow-sm transition-[color,border-color,transform] duration-150 ease-lm hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent active:scale-95"
              >
                <Menu size={18} />
              </button>
            </div>
            {!searching && (
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                {categories.map((cat) => (
                  <CategoryChip key={cat.id} category={cat} selected={categoryFilter === cat.id}
                    onClick={() => setCategoryFilter(categoryFilter === cat.id ? null : cat.id)} />
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
                    <StoryListItem key={story.id} story={story} categories={categories}
                      onOpen={(id) => { setSearchQuery(""); openStory(id); requestPanTo(story.lat, story.lon); }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Desktop: search anchored left + categories after */}
          <div className="hidden lg:flex items-start gap-2">
            <div className="relative shrink-0 w-[280px]">
              <div className="flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-1.5 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-[var(--lm-focus)]">
                <Search size={14} className="shrink-0 text-muted" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.searchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted"
                />
                {searchQuery && (
                  <button aria-label={t.cancel} onClick={() => setSearchQuery("")} className="rounded text-muted transition-colors hover:text-accent focus-visible:text-accent">
                    <X size={14} />
                  </button>
                )}
              </div>
              {searching && (
                <div className="absolute left-0 top-full mt-1.5 w-full max-h-[50dvh] overflow-y-auto rounded-xl border border-border bg-bg shadow-lg">
                  <div className="px-3">
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
            {!searching && (
              <div className="flex flex-1 gap-2 overflow-x-auto [scrollbar-width:none]">
                {categories.map((cat) => (
                  <CategoryChip key={cat.id} category={cat} selected={categoryFilter === cat.id}
                    onClick={() => setCategoryFilter(categoryFilter === cat.id ? null : cat.id)} />
                ))}
              </div>
            )}
          </div>
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
          <div className="absolute bottom-6 left-4 z-10 flex flex-col items-center gap-3 lg:hidden">
            <button aria-label={t.trending} onClick={() => setTrendingOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg text-muted shadow-sm transition-[color,border-color,transform,box-shadow] duration-150 ease-lm hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:ring-2 focus-visible:ring-[var(--lm-focus)] active:scale-95">
              <Flame size={18} />
            </button>
            {authenticated && (
              <button aria-label={t.addStory} onClick={startPickLocation}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-text shadow-lg transition-[transform,box-shadow] duration-150 ease-lm hover:shadow-xl focus-visible:ring-2 focus-visible:ring-[var(--lm-focus)] active:scale-95">
                <Plus size={24} />
              </button>
            )}
          </div>

          {authenticated && (
            <button aria-label={t.addStory} onClick={startPickLocation}
              className="absolute bottom-6 right-4 hidden rounded-full bg-accent p-4 text-accent-text shadow-lg transition-transform duration-150 ease-lm active:scale-95 lg:block">
              <Plus size={22} />
            </button>
          )}

          {/* Locate me */}
          <button
            aria-label={t.locateMe}
            onClick={locateMe}
            disabled={locating}
            style={{ bottom: locateBottom }}
            className="absolute right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg text-muted shadow-sm transition-[color,border-color,transform,box-shadow] duration-150 ease-lm hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent focus-visible:ring-2 focus-visible:ring-[var(--lm-focus)] active:scale-95 disabled:opacity-50"
          >
            <Navigation size={16} className={locating ? "animate-pulse" : undefined} />
          </button>

          {/* Zoom controls — above locate */}
          <div
            className="absolute right-3 z-10 hidden lg:flex flex-col overflow-hidden rounded-lg border border-border bg-bg shadow-sm"
            style={{ bottom: zoomBottom }}
          >
            <button aria-label="Zoom in" onClick={() => mapViewRef.current?.zoomIn()}
              className="flex h-[34px] w-9 items-center justify-center text-[18px] leading-none text-text transition-colors hover:bg-surface hover:text-accent focus-visible:bg-surface focus-visible:text-accent active:bg-surface">
              +
            </button>
            <div className="h-px bg-border" />
            <button aria-label="Zoom out" onClick={() => mapViewRef.current?.zoomOut()}
              className="flex h-[34px] w-9 items-center justify-center text-[18px] leading-none text-text transition-colors hover:bg-surface hover:text-accent focus-visible:bg-surface focus-visible:text-accent active:bg-surface">
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
        <BottomSheet
          open={mobileMenuOpen}
          onClose={closeMobileMenu}
          onBack={mobilePanel ? () => setMobilePanel(null) : undefined}
          title={mobilePanel ? mobilePanelTitles[mobilePanel as Exclude<Panel, "story" | null>] : ""}
        >
          {!mobilePanel && (
            <div className="space-y-0.5 px-1 pb-1">
              <div className="-mx-3 -mt-2 mb-2">
                <ProfilePanel onSettingsClick={() => setMobilePanel("settings")} />
              </div>
              <div className="mx-2 mb-2 h-px bg-border" />
              {mobileMenuItems.map((item) => (
                <button
                  key={item.panel}
                  onClick={() => openMobilePanel(item.panel)}
                  className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-medium text-text transition-all duration-150 ease-lm hover:bg-surface active:scale-[0.98] active:bg-surface"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-muted transition-colors group-hover:bg-bg group-hover:text-accent">
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">{item.label}</span>
                  <ChevronRight size={16} className="text-muted/50 transition-colors group-hover:text-accent" />
                </button>
              ))}
            </div>
          )}

          {mobilePanel && (
            <div>
              {mobilePanel === "trending" && (
                <div className="px-1">
                  {trendingStories?.length === 0 && (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <Flame size={24} className="text-muted" />
                      <span className="text-[13px] text-muted">{t.noStoriesYet}</span>
                    </div>
                  )}
                  {trendingStories?.map((story) => (
                    <StoryListItem key={story.id} story={story} categories={categories}
                      onOpen={(id) => { closeMobileMenu(); openStory(id); requestPanTo(story.lat, story.lon); }} />
                  ))}
                </div>
              )}

              {mobilePanel === "nearby" && (
                <div className="px-1">
                  {!nearbyLocation && (
                    <div className="py-8 text-center text-[13px] text-muted">{t.loading}</div>
                  )}
                  {nearbyLocation && nearbyStories.length === 0 && (
                    <div className="py-8 text-center text-[13px] text-muted">{t.noNearby}</div>
                  )}
                  {nearbyLocation && nearbyStories.map((story) => (
                    <StoryListItem key={story.id} story={story} categories={categories}
                      onOpen={(id) => { closeMobileMenu(); openStory(id); requestPanTo(story.lat, story.lon); }} />
                  ))}
                </div>
              )}

              {mobilePanel === "saved" && (
                <div className="flex min-h-40 items-center justify-center py-12 text-[13px] text-muted">{t.savedStories}</div>
              )}
              {mobilePanel === "my-stories" && (
                <div className="flex min-h-40 items-center justify-center py-12 text-[13px] text-muted">{t.myStories}</div>
              )}
              {mobilePanel === "settings" && (
                <div className="-mx-4">
                  <SettingsPanel />
                </div>
              )}
            </div>
          )}
        </BottomSheet>
      </div>

      <div className="lg:hidden">
        <StorySheet authenticated={authenticated} />
      </div>
      <AddStorySheet />
      <Toast />
    </main>
  );
}
