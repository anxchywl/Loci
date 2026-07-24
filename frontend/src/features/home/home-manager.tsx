"use client";

import {
  Bookmark,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Flame,
  Info,
  Layers,
  Menu,
  Navigation,
  Plus,
  Search,
  UserRound,
  X,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { useTelegramAuth } from "@/features/auth/hooks";
import {
  AboutPanel,
  DesktopSidebar,
  ProfilePanel,
  SettingsPanel,
  type Panel,
} from "@/features/home/desktop-sidebar";
import { DocView, docTitlesFrom } from "@/features/home/doc-view";
import { legalDocsFrom, type LegalDocId } from "@/features/home/legal-content";
import { MapView, type MapBounds, type MapViewHandle } from "@/features/map/map-view";
import { AddStorySheet } from "@/features/stories/add-story-sheet";
import { BottomSheet } from "@/features/stories/components/bottom-sheet";
import { CategoryChip } from "@/features/stories/components/category-chip";
import { NearbyPanel } from "@/features/stories/components/nearby-panel";
import { StoryListItem } from "@/features/stories/components/story-list-item";
import { MyStoriesPanel, SavedPanel } from "@/features/profile/story-panels";
import {
  useCategories,
  useMapClusters,
  useMapPins,
  useWorldMapPins,
  useSearch,
  useTrending,
} from "@/features/stories/hooks";
import { sortPinsByAnchor } from "@/features/stories/proximity";
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
  const showAllPins = useUiStore((state) => state.showAllPins);
  const toggleShowAllPins = useUiStore((state) => state.toggleShowAllPins);
  const setShowAllPins = useUiStore((state) => state.setShowAllPins);
  const mapLabelDensity = useUiStore((state) => state.mapLabelDensity);
  const setMapLabelDensity = useUiStore((state) => state.setMapLabelDensity);
  const hydrateShowAllPins = useUiStore((state) => state.hydrateShowAllPins);
  // apply the persisted pin-display preference after mount (kept out of the
  // initial render so SSR and first client render match)
  useEffect(() => {
    hydrateShowAllPins();
  }, [hydrateShowAllPins]);
  const startPickLocation = useUiStore((state) => state.startPickLocation);
  const cancelCompose = useUiStore((state) => state.cancelCompose);
  const trendingOpen = useUiStore((state) => state.trendingOpen);
  const setTrendingOpen = useUiStore((state) => state.setTrendingOpen);
  const openStory = useUiStore((state) => state.openStory);
  const openStoryId = useUiStore((state) => state.openStoryId);
  const setAdjacentPins = useUiStore((state) => state.setAdjacentPins);
  const navAnchor = useUiStore((state) => state.navAnchor);
  const setNavAnchor = useUiStore((state) => state.setNavAnchor);
  const requestPanTo = useUiStore((state) => state.requestPanTo);
  const storySource = useUiStore((state) => state.storySource);
  const closeStory = useUiStore((state) => state.closeStory);

  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<Panel>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<Panel>(null);
  const [mobileDoc, setMobileDoc] = useState<LegalDocId | null>(null);
  const mobileCloseTimer = useRef<number | null>(null);
  const mapViewOpen = useUiStore((state) => state.mapViewOpen);
  const setMapViewOpen = useUiStore((state) => state.setMapViewOpen);
  const [nearbyLocation, setNearbyLocation] = useState<{ lat: number; lon: number } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mapViewRef = useRef<MapViewHandle>(null);

  const { data: categories = [] } = useCategories();
  // below the threshold the backend aggregates markers into grid clusters —
  // correct counts at any story volume; above it, individual pins with
  // client-side clustering. 0 disables server clustering entirely.
  const serverClusterMaxZoom = Number(process.env.NEXT_PUBLIC_SERVER_CLUSTER_MAX_ZOOM ?? 9);
  const clusterMode =
    !showAllPins && bounds !== null && bounds.zoom < serverClusterMaxZoom;
  // zoom is deliberately left out of the pins params: fractional zoom changes
  // would otherwise churn the query cache key on every pinch
  const { data: pins = [] } = useMapPins(
    !clusterMode && bounds
      ? {
          minLat: bounds.minLat,
          minLon: bounds.minLon,
          maxLat: bounds.maxLat,
          maxLon: bounds.maxLon,
          categoryId: categoryFilter,
        }
      : null,
  );
  const { data: worldPins = [] } = useWorldMapPins(Boolean(openStoryId), categoryFilter);
  const { data: clusters = [] } = useMapClusters(
    clusterMode && bounds ? { ...bounds, categoryId: categoryFilter } : null,
  );
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

  // Geographic neighbour list for the open story: the currently visible pins
  // ordered nearest-first around it. Rebuilt whenever the open story or the pin
  // set changes so prev/next never point at stale or filtered-out stories. This
  // is proximity navigation and is deliberately separate from browsing history
  // (storyHistory) in the store.
  useEffect(() => {
    if (!openStoryId) {
      setAdjacentPins([]);
      return;
    }
    const tourPins = [...pins, ...worldPins.filter((worldPin) => !pins.some((pin) => pin.id === worldPin.id))];
    const currentPin = tourPins.find((p) => p.id === openStoryId);
    // anchor the tour on the story the user first opened. When it was opened
    // without coords (e.g. a deep link), derive the anchor from its pin once
    // loaded and persist it so later prev/next hops stay anchored here.
    const anchor = navAnchor ?? (currentPin ? { lat: currentPin.lat, lon: currentPin.lon } : null);
    if (!anchor) {
      setAdjacentPins([]);
      return;
    }
    if (!navAnchor) setNavAnchor(anchor);
    // the current story must be among the loaded pins to navigate from it; if
    // not (opened off-screen / clustered), clear rather than show stale
    // neighbours — it self-heals once the pan loads pins around it
    setAdjacentPins(currentPin ? sortPinsByAnchor(tourPins, anchor) : []);
  }, [openStoryId, pins, worldPins, navAnchor, setNavAnchor, setAdjacentPins]);

  const locateMe = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const outcome = await locate();
      if (outcome.kind === "located") {
        mapViewRef.current?.flyToUser(outcome.lat, outcome.lon);
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
    if (nearbyLocation) {
      requestPanTo(nearbyLocation.lat, nearbyLocation.lon, 14);
      return;
    }
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

  // keep the map controls in a separated vertical stack on desktop
  const locateBottom = "1.5rem";

  const openMobilePanel = (panel: Panel) => {
    if (panel === "nearby") {
      void handleNearby();
    }
    if (document.startViewTransition) {
      document.startViewTransition(() => {
        flushSync(() => setMobilePanel(panel));
      });
    } else {
      setMobilePanel(panel);
    }
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    if (mobileCloseTimer.current !== null) window.clearTimeout(mobileCloseTimer.current);
    mobileCloseTimer.current = window.setTimeout(() => {
      setMobilePanel(null);
      setMobileDoc(null);
      mobileCloseTimer.current = null;
    }, 250);
  };

  // Cross-fade the sheet content the same way panel navigation does.
  const runSheetTransition = (fn: () => void) => {
    if (document.startViewTransition) {
      document.startViewTransition(() => flushSync(fn));
    } else {
      fn();
    }
  };

  const docTitles = docTitlesFrom(t);

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
    ...(authenticated ? [
      { panel: "saved" as const, label: t.savedStories, icon: <Bookmark size={16} /> },
      { panel: "my-stories" as const, label: t.myStories, icon: <BookOpen size={16} /> },
      { panel: "about" as const, label: t.about, icon: <Info size={16} /> },
    ] : []),
  ];

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg">
      <MapView
        ref={mapViewRef}
        categories={categories}
        stories={clusterMode ? [] : pins}
        clusters={clusterMode ? clusters : []}
        desktopLeftInset={sidebarOpen ? 320 : 48}
        onBoundsChange={setBounds}
      />

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
          data-map-controls
          className={[
            "absolute inset-x-0 top-0 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]",
            "transition-[padding-left] duration-[230ms] ease-lm",
            sidebarOpen ? "lg:pl-[332px]" : "lg:pl-14",
          ].join(" ")}
        >
          {/* Mobile: stacked layout */}
          <div className="flex flex-col gap-2 lg:hidden">
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-bg px-3 py-2 shadow-sm transition-colors focus-within:border-accent">
                <Search size={16} className="shrink-0 text-muted" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value.replace(/^\s+/, "").slice(0, 100))}
                  placeholder={t.searchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
                />
                {searchQuery && (
                  <button aria-label={t.cancel} onClick={() => setSearchQuery("")} className="rounded text-muted transition-colors hover:text-[var(--lm-accent-soft)] focus-visible:text-accent">
                    <X size={16} />
                  </button>
                )}
              </div>
              <button
                aria-label={t.menu}
                onClick={() => setMobileMenuOpen(true)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-bg text-text shadow-sm transition-[color,border-color,transform] duration-150 ease-lm hover:border-accent hover:text-[var(--lm-accent-soft)] focus-visible:border-accent focus-visible:text-accent active:scale-95"
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
                      onOpen={(id) => { setSearchQuery(""); openStory(id, { lat: story.lat, lon: story.lon }); requestPanTo(story.lat, story.lon); }} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Desktop: search anchored left + categories after */}
          <div className="hidden min-w-0 items-start gap-3 overflow-hidden lg:flex">
            <div className="relative w-[320px] shrink-0">
              <div className="flex items-center gap-2 rounded-full border border-border bg-bg px-3.5 py-2 transition-colors focus-within:border-accent">
                <Search size={16} className="shrink-0 text-muted" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value.replace(/^\s+/, "").slice(0, 100))}
                  placeholder={t.searchPlaceholder}
                  className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted"
                />
                {searchQuery && (
                  <button aria-label={t.cancel} onClick={() => setSearchQuery("")} className="rounded text-muted transition-colors hover:text-[var(--lm-accent-soft)] focus-visible:text-accent">
                    <X size={16} />
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
                        onOpen={(id) => { setSearchQuery(""); openStory(id, { lat: story.lat, lon: story.lon }); requestPanTo(story.lat, story.lon); }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
            {!searching && (
              <div className="flex min-w-0 flex-1 gap-3 overflow-x-auto [scrollbar-width:none]">
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
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-bg text-muted shadow-sm transition-[color,border-color,transform,box-shadow] duration-150 ease-lm hover:border-accent hover:text-[var(--lm-accent-soft)] focus-visible:border-accent focus-visible:text-accent focus-visible:ring-2 focus-visible:ring-[var(--lm-focus)] active:scale-95">
              <Flame size={18} />
            </button>
            <button
              aria-label={t.addStory}
              onClick={() => {
                if (authenticated) {
                  startPickLocation();
                } else {
                  // signed-out (e.g. opened outside Telegram) — surface the sign-in prompt
                  setMobileMenuOpen(true);
                }
              }}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-text shadow-lg transition-[transform,box-shadow] duration-150 ease-lm hover:shadow-xl focus-visible:ring-2 focus-visible:ring-[var(--lm-focus)] active:scale-95">
              <Plus size={22} />
            </button>
          </div>

          <button
            aria-label={t.addStory}
            onClick={() => {
              if (authenticated) {
                startPickLocation();
              } else {
                setSidebarOpen(true);
                setActivePanel("profile");
              }
            }}
            className={[
              "absolute bottom-6 z-10 hidden rounded-full bg-accent p-4 text-accent-text shadow-lg",
              "transition-[left,transform,box-shadow] duration-[230ms] ease-lm hover:shadow-xl active:scale-95 lg:block",
              sidebarOpen ? "lg:left-[336px]" : "lg:left-16",
            ].join(" ")}>
            <Plus size={22} />
          </button>

          {/* Locate me */}
          <button
            aria-label={t.locateMe}
            onClick={locateMe}
            disabled={locating}
            style={{ bottom: locateBottom }}
            className="absolute right-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg text-muted shadow-sm transition-[color,border-color,transform,box-shadow] duration-150 ease-lm hover:border-accent hover:text-[var(--lm-accent-soft)] focus-visible:border-accent focus-visible:text-accent focus-visible:ring-2 focus-visible:ring-[var(--lm-focus)] active:scale-95 disabled:opacity-50 lg:h-10 lg:w-10"
          >
            <Navigation size={16} className={locating ? "animate-pulse" : undefined} />
          </button>

          {/* Zoom controls — above locate */}
          <div
            className="absolute right-3 bottom-[calc(1.5rem+36px+8px)] z-10 flex flex-col overflow-hidden rounded-lg border border-border bg-bg shadow-sm lg:bottom-[calc(1.5rem+48px)]"
          >
            <button aria-label="Zoom in" onClick={() => mapViewRef.current?.zoomIn()}
              className="flex h-7 w-8 items-center justify-center text-[18px] leading-none text-text transition-colors hover:bg-surface hover:text-[var(--lm-accent-soft)] focus-visible:bg-surface focus-visible:text-accent active:bg-surface lg:h-[38px] lg:w-10 lg:text-[20px]">
              +
            </button>
            <div className="h-px bg-border" />
            <button aria-label="Zoom out" onClick={() => mapViewRef.current?.zoomOut()}
              className="flex h-7 w-8 items-center justify-center text-[18px] leading-none text-text transition-colors hover:bg-surface hover:text-[var(--lm-accent-soft)] focus-visible:bg-surface focus-visible:text-accent active:bg-surface lg:h-[38px] lg:w-10 lg:text-[20px]">
              −
            </button>
          </div>

          {/* Pin display toggle — clustered counts vs. every pin visible */}
          <div className="absolute right-3 bottom-[calc(1.5rem+36px+8px+57px+8px)] z-10 block lg:bottom-[calc(1.5rem+48px+76px+8px)]">
            <button
              aria-label={t.mapView}
              aria-expanded={mapViewOpen}
              title={t.mapView}
              onClick={() => setMapViewOpen(!mapViewOpen)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-bg text-muted shadow-sm transition-[color,border-color,background-color,transform] duration-150 ease-lm hover:border-accent hover:text-[var(--lm-accent-soft)] active:scale-95 lg:h-10 lg:w-10"
            >
              <Layers size={18} />
            </button>
            {mapViewOpen && (
              <div className="absolute bottom-12 right-0 w-56 rounded-xl border border-border bg-bg p-2 shadow-lg motion-safe:animate-story-state">
                <div className="px-2 pb-1 text-[12px] font-semibold text-muted">{t.mapView}</div>
                <div className="space-y-1">
                  <button onClick={() => setShowAllPins(true)} className={["w-full rounded-lg px-2 py-2 text-left text-[13px] transition-colors duration-150", showAllPins ? "font-semibold text-accent" : "font-medium text-muted hover:text-[var(--lm-accent-soft)]"].join(" ")}>
                    {t.showAllPins}
                  </button>
                  <button onClick={() => setShowAllPins(false)} className={["w-full rounded-lg px-2 py-2 text-left text-[13px] transition-colors duration-150", !showAllPins ? "font-semibold text-accent" : "font-medium text-muted hover:text-[var(--lm-accent-soft)]"].join(" ")}>
                    {t.showClusters}
                  </button>
                </div>
                <div className="mt-2 border-t border-border px-2 pt-2 text-[12px] font-semibold text-muted">{t.mapLabels}</div>
                {([["none", t.mapNone], ["countries", t.mapCountries], ["all", t.mapAllDetails]] as const).map(([value, label]) => (
                  <button key={value} onClick={() => { setMapLabelDensity(value); mapViewRef.current?.setLabelDensity(value); }} className={["w-full rounded-lg px-2 py-2 text-left text-[13px] transition-colors duration-150", mapLabelDensity === value ? "font-semibold text-accent" : "font-medium text-muted hover:text-[var(--lm-accent-soft)]"].join(" ")}>
                    {label}
                  </button>
                ))}
              </div>
            )}
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
            onOpen={(id) => { openStory(id, { lat: story.lat, lon: story.lon }, "trending"); requestPanTo(story.lat, story.lon); }} />
        ))}
      </BottomSheet>

      <div className="lg:hidden">
        <BottomSheet
          open={mobileMenuOpen}
          onClose={closeMobileMenu}
          scrollKey={mobileDoc}
          onBack={(mobileDoc || mobilePanel) ? () => {
            runSheetTransition(() => {
              if (mobileDoc) setMobileDoc(null);
              else setMobilePanel(null);
            });
          } : undefined}
          title={
            mobileDoc
              ? docTitles[mobileDoc]
              : mobilePanel
                ? mobilePanelTitles[mobilePanel as Exclude<Panel, "story" | null>]
                : ""
          }
        >
          {!mobilePanel && (
            <div className="space-y-0.5 px-1 pb-1 animate-fade-in">
              <div className="-mx-3 -mt-2 mb-2">
                <ProfilePanel onSettingsClick={() => setMobilePanel("settings")} />
              </div>
              {mobileMenuItems.length > 0 && <div className="mx-2 mb-2 h-px bg-border" />}
              {mobileMenuItems.map((item) => (
                <button
                  key={item.panel}
                  onClick={() => openMobilePanel(item.panel)}
                  className="group flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left text-[14px] font-medium text-text transition-colors duration-150 active:scale-[0.99]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center text-muted transition-colors group-hover:text-[var(--lm-accent-soft)]">
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1 transition-colors group-hover:text-[var(--lm-accent-soft)]">{item.label}</span>
                </button>
              ))}
            </div>
          )}

          {mobilePanel && (
            <div>
              {mobilePanel === "trending" && (
                <div className="px-1 animate-fade-in">
                  {trendingStories?.length === 0 && (
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <Flame size={24} className="text-muted" />
                      <span className="text-[13px] text-muted">{t.noStoriesYet}</span>
                    </div>
                  )}
                  {trendingStories?.map((story) => (
                    <StoryListItem key={story.id} story={story} categories={categories}
                      onOpen={(id) => { closeMobileMenu(); openStory(id, { lat: story.lat, lon: story.lon }, "trending"); requestPanTo(story.lat, story.lon); }} />
                  ))}
                </div>
              )}

              {mobilePanel === "nearby" && (
                <NearbyPanel
                  location={nearbyLocation}
                  className="px-1"
                  onOpen={(id, lat, lon) => { closeMobileMenu(); openStory(id, { lat, lon }, "nearby"); requestPanTo(lat, lon); }}
                />
              )}

              {mobilePanel === "saved" && (
                <SavedPanel
                  authenticated={authenticated}
                  onOpen={(story) => { closeMobileMenu(); openStory(story.id, { lat: story.lat, lon: story.lon }, "saved"); requestPanTo(story.lat, story.lon); }}
                />
              )}
              {mobilePanel === "my-stories" && (
                <MyStoriesPanel
                  authenticated={authenticated}
                  onOpen={(story) => { closeMobileMenu(); openStory(story.id, { lat: story.lat, lon: story.lon }, "my-stories"); requestPanTo(story.lat, story.lon); }}
                />
              )}
              {mobilePanel === "about" && (
                <div className="-mx-4">
                  {mobileDoc ? (
                    <DocView blocks={legalDocsFrom(t.legal)[mobileDoc]} />
                  ) : (
                    <AboutPanel onOpenDoc={(id) => runSheetTransition(() => setMobileDoc(id))} />
                  )}
                </div>
              )}
              {mobilePanel === "settings" && (
                <div className="-mx-4 animate-fade-in">
                  <SettingsPanel />
                </div>
              )}
            </div>
          )}
        </BottomSheet>
      </div>

      <div className="lg:hidden">
        <StorySheet authenticated={authenticated} onBackToSource={() => {
          if (mobileCloseTimer.current !== null) {
            window.clearTimeout(mobileCloseTimer.current);
            mobileCloseTimer.current = null;
          }
          closeStory();
          if (storySource) {
            setMobilePanel(storySource);
            setMobileMenuOpen(true);
          }
        }} />
      </div>
      <AddStorySheet />
      <Toast />
    </main>
  );
}
