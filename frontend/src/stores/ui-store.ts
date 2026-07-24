import { create } from "zustand";

import { defaultLocale, type Locale } from "@/lib/i18n/dict";

type HomeMode = "browse" | "pick-location" | "compose";

export type Theme = "auto" | "light" | "dark";
export type MapLabelDensity = "none" | "countries" | "all";
export type MapStyle = "clean" | "bright" | "dark";

export interface AdjacentPin {
  id: string;
  lat: number;
  lon: number;
}
export type StorySource = "trending" | "nearby" | "saved" | "my-stories" | null;

interface UiState {
  locale: Locale;
  theme: Theme;
  mode: HomeMode;
  pickedLocation: { lat: number; lon: number } | null;
  openStoryId: string | null;
  storySource: StorySource;
  // browsing history: stories opened before the current one, in visit order.
  // Drives the "back" control (return to the previously viewed story). Distinct
  // from adjacentPins, which is geographic and has nothing to do with history.
  storyHistory: string[];
  // geographic neighbours ordered nearest-first around navAnchor. Drives
  // prev/next (move to the adjacent nearby story). Rebuilt from the visible pins
  // by the home manager; never a history stack.
  adjacentPins: AdjacentPin[];
  // fixed reference point for the proximity tour: the location of the story the
  // user first opened. Held constant across prev/next hops so the tour walks
  // steadily outward (nearest → farther) instead of re-centring on each story.
  // Reset on a fresh open/close; preserved by openAdjacentStory.
  navAnchor: { lat: number; lon: number } | null;
  // last-known public coords per story id, remembered as stories are opened so
  // "back" can restore the map position of a history entry even after the pin
  // set has changed. Public (fuzzed) coords only — same values already shown.
  storyCoords: Record<string, { lat: number; lon: number }>;
  trendingOpen: boolean;
  categoryFilter: number | null;
  // "clustered" groups nearby pins into counted circles; "all" keeps every pin
  // visible and scales them down with zoom (Queering-the-Map style)
  showAllPins: boolean;
  mapLabelDensity: MapLabelDensity;
  mapStyle: MapStyle;
  mapViewOpen: boolean;
  toast: string | null;
  panRequest: { lat: number; lon: number; zoom?: number; paddingBottom?: number; id: number } | null;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
  startPickLocation: () => void;
  pickLocation: (lat: number, lon: number) => void;
  cancelCompose: () => void;
  finishCompose: () => void;
  openStory: (id: string, coords?: { lat: number; lon: number }, source?: StorySource) => void;
  // open a story reached via prev/next: advances the open story and history but
  // keeps the proximity anchor + tour, so ordering stays fixed on the first story
  openAdjacentStory: (id: string, coords: { lat: number; lon: number }) => void;
  closeStory: () => void;
  goBackStory: () => void;
  setNavAnchor: (anchor: { lat: number; lon: number }) => void;
  setTrendingOpen: (open: boolean) => void;
  setCategoryFilter: (id: number | null) => void;
  hydrateShowAllPins: () => void;
  toggleShowAllPins: () => void;
  setShowAllPins: (show: boolean) => void;
  setMapLabelDensity: (density: MapLabelDensity) => void;
  setMapStyle: (style: MapStyle) => void;
  setAdjacentPins: (pins: AdjacentPin[]) => void;
  setMapViewOpen: (open: boolean) => void;
  showToast: (message: string) => void;
  clearToast: () => void;
  requestPanTo: (lat: number, lon: number, zoom?: number, paddingBottom?: number) => void;
  hydratePreferences: () => void;
}

function loadPref<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { return (localStorage.getItem(key) as T) ?? fallback; } catch { return fallback; }
}

export const useUiStore = create<UiState>((set) => ({
  // persisted preferences are applied after mount so SSR and the first client
  // render use the same strings and theme
  locale: defaultLocale,
  theme: "auto",
  mode: "browse",
  pickedLocation: null,
  openStoryId: null,
  storySource: null,
  storyHistory: [],
  adjacentPins: [],
  navAnchor: null,
  storyCoords: {},
  trendingOpen: false,
  categoryFilter: null,
  // starts false on server AND first client render to avoid a hydration
  // mismatch; the persisted value is applied after mount via hydrateShowAllPins()
  showAllPins: true,
  mapLabelDensity: "all",
  mapStyle: "clean",
  mapViewOpen: false,
  toast: null,
  panRequest: null,
  setLocale: (locale) => { localStorage.setItem("loci_locale", locale); set({ locale }); },
  setTheme: (theme) => { localStorage.setItem("loci_theme", theme); set({ theme }); },
  hydratePreferences: () =>
    set({
      locale: loadPref("loci_locale", defaultLocale) as Locale,
      theme: loadPref("loci_theme", "auto") as Theme,
    }),
  startPickLocation: () =>
    set({ mode: "pick-location", openStoryId: null, trendingOpen: false, storyHistory: [], navAnchor: null, adjacentPins: [] }),
  pickLocation: (lat, lon) => set({ mode: "compose", pickedLocation: { lat, lon } }),
  cancelCompose: () => set({ mode: "browse", pickedLocation: null }),
  finishCompose: () => set({ mode: "browse", pickedLocation: null }),
  setAdjacentPins: (pins) => set({ adjacentPins: pins }),
  openStory: (id, coords, source = null) =>
    set((state) => ({
      openStoryId: id,
      storySource: source,
      trendingOpen: false,
      // push current story onto history stack before switching
      storyHistory: state.openStoryId && state.openStoryId !== id
        ? [...state.storyHistory, state.openStoryId]
        : state.storyHistory,
      storyCoords: coords ? { ...state.storyCoords, [id]: coords } : state.storyCoords,
      // fresh open re-anchors the proximity tour here and clears the old order
      navAnchor: coords ?? null,
      adjacentPins: [],
    })),
  openAdjacentStory: (id, coords) =>
    set((state) => ({
      openStoryId: id,
      trendingOpen: false,
      storyHistory: state.openStoryId && state.openStoryId !== id
        ? [...state.storyHistory, state.openStoryId]
        : state.storyHistory,
      storyCoords: { ...state.storyCoords, [id]: coords },
      // deliberately keep navAnchor + adjacentPins so the tour stays anchored
    })),
  setNavAnchor: (anchor) => set({ navAnchor: anchor }),
  closeStory: () => set({ openStoryId: null, storySource: null, storyHistory: [], navAnchor: null, adjacentPins: [] }),
  goBackStory: () =>
    set((state) => {
      if (state.storyHistory.length === 0) return {};
      const prev = state.storyHistory[state.storyHistory.length - 1];
      return {
        openStoryId: prev,
        storyHistory: state.storyHistory.slice(0, -1),
      };
    }),
  setTrendingOpen: (open) => set({ trendingOpen: open }),
  setCategoryFilter: (id) => set({ categoryFilter: id }),
  hydrateShowAllPins: () =>
    set({ showAllPins: loadPref<string>("loci_show_all_pins", "1") === "1" }),
  toggleShowAllPins: () =>
    set((state) => {
      const next = !state.showAllPins;
      try { localStorage.setItem("loci_show_all_pins", next ? "1" : "0"); } catch { /* ignore */ }
      return { showAllPins: next };
    }),
  setShowAllPins: (showAllPins) => set({ showAllPins }),
  setMapLabelDensity: (mapLabelDensity) => set({ mapLabelDensity }),
  setMapStyle: (mapStyle) => set({ mapStyle }),
  setMapViewOpen: (mapViewOpen) => set({ mapViewOpen }),
  showToast: (message) => set({ toast: message }),
  clearToast: () => set({ toast: null }),
  requestPanTo: (lat, lon, zoom, paddingBottom) =>
    set({ panRequest: { lat, lon, zoom, paddingBottom, id: Date.now() } }),
}));
