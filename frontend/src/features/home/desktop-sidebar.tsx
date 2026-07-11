"use client";

import {
  Bookmark,
  BookOpen,
  ChevronLeft,
  Flame,
  Flag,
  Globe,
  Info,
  MapPin,
  MapPinned,
  Menu,
  Moon,
  Navigation,
  Settings,
  Share2,
  ShieldCheck,
  Sun,
  SunMoon,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useTelegramAuth } from "@/features/auth/hooks";
import { ReactionButton } from "@/features/stories/components/reaction-button";
import { StoryListItem } from "@/features/stories/components/story-list-item";
import { MyStoriesPanel, SavedPanel } from "@/features/profile/story-panels";
import {
  useBookmark,
  useCategories,
  useBboxStories,
  useDeleteStory,
  useReportStory,
  useStory,
  useTrending,
} from "@/features/stories/hooks";
import { categoryIcons } from "@/lib/icons/category-glyphs";
import { type Locale, locales } from "@/lib/i18n/dict";
import { useDict } from "@/lib/i18n/use-dict";
import { setMapLanguage } from "@/lib/map/setup";
import { openTelegramLink } from "@/lib/telegram/init";
import { type Theme, useUiStore } from "@/stores/ui-store";

export type Panel =
  | "saved"
  | "my-stories"
  | "profile"
  | "about"
  | "story"
  | "trending"
  | "nearby"
  | "settings"
  | null;

interface DesktopSidebarProps {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  activePanel: Panel;
  onSetActivePanel: (p: Panel) => void;
  storyId: string | null;
  nearbyLocation: { lat: number; lon: number } | null;
  onNearby: () => void;
  authenticated: boolean;
}

interface ItemProps {
  icon: React.ReactNode;
  label: string;
  sidebarOpen: boolean;
  onClick: () => void;
}

function Item({ icon, label, sidebarOpen, onClick }: ItemProps) {
  return (
    <button
      onClick={onClick}
      className="group mx-1 flex w-[calc(100%-8px)] items-center rounded-lg py-2.5 text-left"
    >
      <span className="flex w-10 shrink-0 items-center justify-center text-muted transition-colors duration-200 group-hover:text-accent">
        {icon}
      </span>
      <span className={[
        "flex-1 whitespace-nowrap text-[14px] font-medium text-text transition-[opacity,color] duration-200 group-hover:text-accent",
        sidebarOpen ? "opacity-100" : "opacity-0",
      ].join(" ")}>
        {label}
      </span>
    </button>
  );
}

/* ── Panels ── */

function TrendingPanel({ authenticated, onOpen }: { authenticated: boolean; onOpen: (id: string, lat: number, lon: number) => void }) {
  const t = useDict();
  const { data: categories = [] } = useCategories();
  const { data: stories } = useTrending(true);
  return (
    <div className="px-2 py-2">
      {stories?.length === 0 && (
        <div className="py-8 text-center text-[13px] text-muted">{t.noStoriesYet}</div>
      )}
      {stories?.map((story) => (
        <StoryListItem key={story.id} story={story} categories={categories}
          onOpen={() => onOpen(story.id, story.lat, story.lon)} />
      ))}
    </div>
  );
}

function NearbyPanel({ location, authenticated, onOpen }: {
  location: { lat: number; lon: number } | null;
  authenticated: boolean;
  onOpen: (id: string, lat: number, lon: number) => void;
}) {
  const t = useDict();
  const { data: categories = [] } = useCategories();
  const DELTA = 0.018; // ~2 km
  const bbox = location
    ? { minLat: location.lat - DELTA, maxLat: location.lat + DELTA, minLon: location.lon - DELTA, maxLon: location.lon + DELTA, categoryId: null }
    : null;
  const { data: stories } = useBboxStories(bbox);

  if (!location) return (
    <div className="px-4 py-8 text-center text-[13px] text-muted">{t.loading}</div>
  );
  return (
    <div className="px-2 py-2">
      {stories?.length === 0 && (
        <div className="py-8 text-center text-[13px] text-muted">{t.noNearby}</div>
      )}
      {stories?.map((story) => (
        <StoryListItem key={story.id} story={story} categories={categories}
          onOpen={() => onOpen(story.id, story.lat, story.lon)} />
      ))}
    </div>
  );
}

function StoryPanel({
  storyId,
  authenticated,
  onClose,
}: {
  storyId: string;
  authenticated: boolean;
  onClose: () => void;
}) {
  const t = useDict();
  const showToast = useUiStore((state) => state.showToast);
  const { data: story } = useStory(storyId);
  const { data: categories } = useCategories();
  const bookmark = useBookmark(storyId);
  const report = useReportStory(storyId);
  const deleteStory = useDeleteStory();
  const [confirming, setConfirming] = useState<"delete" | "report" | null>(null);

  useEffect(() => {
    setConfirming(null);
  }, [storyId]);

  const category = categories?.find((c) => c.id === story?.category_id);
  const Icon = category ? categoryIcons[category.slug] : null;

  const confirmAction = () => {
    if (!story) return;
    if (confirming === "delete") {
      deleteStory.mutate(story.id, {
        onSuccess: () => { setConfirming(null); onClose(); },
        onError: () => showToast(t.errorGeneric),
      });
    } else if (confirming === "report") {
      report.mutate(null, {
        onSuccess: () => { setConfirming(null); showToast(t.reported); },
        onError: () => showToast(t.errorGeneric),
      });
    }
  };

  const share = async () => {
    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
    const link = botUsername ? `https://t.me/${botUsername}?startapp=${storyId}` : window.location.href;
    if (!openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}`)) {
      await navigator.clipboard.writeText(link);
      showToast(t.linkCopied);
    }
  };

  if (!story) return <div className="px-4 py-6 text-[13px] text-muted">{t.loading}</div>;

  return (
    <div className="space-y-4 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
        {category && Icon && (
          <span className="flex items-center gap-1 rounded-full px-2.5 py-1 font-medium text-white"
            style={{ backgroundColor: category.color }}>
            <Icon size={13} color="#ffffff" />
            {t.categories[category.slug]}
          </span>
        )}
        <span>{story.author ? (story.author.username ?? story.author.first_name) : t.anonymous}</span>
        {story.happened_on && <span>{story.happened_on}</span>}
        <span className="flex items-center gap-0.5">
          <MapPin size={13} />
          {story.location_precision === "approx" ? "≈" : ""}
          {story.lat.toFixed(3)}, {story.lon.toFixed(3)}
        </span>
      </div>

      {story.photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {story.photos.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={photo.id} src={photo.thumb_url ?? photo.url} alt=""
              className="h-36 rounded-lg object-cover" />
          ))}
        </div>
      )}

      <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{story.body}</p>

      {confirming ? (
        <div className="space-y-3 rounded-lg border border-border p-3 animate-fade-in">
          <div className="text-[15px] font-semibold">
            {confirming === "delete" ? t.confirmDeleteTitle : t.confirmReportTitle}
          </div>
          <p className="text-[13px] text-muted">
            {confirming === "delete" ? t.confirmDeleteBody : t.confirmReportBody}
          </p>
          <div className="flex gap-2">
            <button onClick={() => setConfirming(null)}
              disabled={deleteStory.isPending || report.isPending}
              className="flex-1 rounded border border-border py-2 text-[14px] font-medium text-muted transition-transform duration-150 ease-lm active:scale-[0.98] disabled:opacity-50">
              {t.cancel}
            </button>
            <button onClick={confirmAction}
              disabled={deleteStory.isPending || report.isPending}
              className={`flex-1 rounded py-2 text-[14px] font-semibold text-white transition-transform duration-150 ease-lm active:scale-[0.98] disabled:opacity-50 ${confirming === "delete" ? "bg-[#E5484D]" : "bg-accent text-accent-text"}`}>
              {confirming === "delete" ? (deleteStory.isPending ? t.deleting : t.deleteStory) : t.report}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <ReactionButton storyId={story.id} reacted={story.viewer_reacted}
            count={story.reaction_count} disabled={!authenticated} />
          <button aria-label={story.viewer_bookmarked ? t.saved : t.save}
            disabled={!authenticated}
            onClick={() => bookmark.mutate(story.viewer_bookmarked)}
            className="rounded-full border border-border p-2 transition-transform duration-150 ease-lm active:scale-95 disabled:opacity-50">
            <Bookmark size={16} fill={story.viewer_bookmarked ? "currentColor" : "none"} />
          </button>
          <button aria-label={t.share} onClick={share}
            className="rounded-full border border-border p-2 transition-transform duration-150 ease-lm active:scale-95">
            <Share2 size={16} />
          </button>
          <div className="ml-auto flex items-center gap-2">
            {story.viewer_is_owner ? (
              <button aria-label={t.deleteStory} onClick={() => setConfirming("delete")}
                className="rounded-full border border-border p-2 text-[#E5484D] transition-transform duration-150 ease-lm active:scale-95">
                <Trash2 size={16} />
              </button>
            ) : (
              <button aria-label={t.report} disabled={!authenticated || report.isSuccess}
                onClick={() => setConfirming("report")}
                className="rounded-full border border-border p-2 text-muted transition-transform duration-150 ease-lm active:scale-95 disabled:opacity-50">
                <Flag size={16} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SettingsPanel() {
  const t = useDict();
  const locale = useUiStore((s) => s.locale);
  const setLocale = useUiStore((s) => s.setLocale);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  const handleLocale = (l: Locale) => {
    if (!document.startViewTransition) {
      setLocale(l);
      return;
    }
    document.startViewTransition(() => {
      // Zustand state update
      setLocale(l);
      // Wait for React to render the language change
    });
  };

  const handleTheme = (v: Theme) => {
    if (!document.startViewTransition) {
      setTheme(v);
      return;
    }
    document.startViewTransition(() => {
      setTheme(v);
    });
  };

  const localeLabels: Record<Locale, string> = { en: "English", kk: "Қазақша", ru: "Русский" };
  const themes: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: "auto", label: t.themeAuto, icon: <SunMoon size={14} /> },
    { value: "light", label: t.themeLight, icon: <Sun size={14} /> },
    { value: "dark", label: t.themeDark, icon: <Moon size={14} /> },
  ];

  return (
    <div className="space-y-4 px-4 py-2">
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <Globe size={12} /> {t.languageLabel}
        </div>
        <div className="flex gap-1.5">
          {locales.map((l) => (
            <button key={l} onClick={() => handleLocale(l)}
              className={[
                "min-w-0 flex-1 rounded-lg px-1 py-1.5 text-center text-[12px] font-medium leading-tight transition-colors",
                locale === l
                  ? "bg-accent text-accent-text"
                  : "bg-surface text-text hover:bg-border",
              ].join(" ")}>
              {localeLabels[l]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <Settings size={12} /> {t.themeLabel}
        </div>
        <div className="flex gap-1.5">
          {themes.map(({ value, label, icon }) => (
            <button key={value} onClick={() => handleTheme(value)}
              className={[
                "flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-center text-[12px] font-medium leading-tight transition-colors",
                theme === value
                  ? "bg-accent text-accent-text"
                  : "bg-surface text-text hover:bg-border",
              ].join(" ")}>
              {icon} <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProfilePanel({ onSettingsClick }: { onSettingsClick?: () => void }) {
  const t = useDict();
  const { user } = useTelegramAuth();

  return (
    <div className="flex h-full flex-col gap-5 px-4 py-2">
      {user ? (
        <div className="flex items-center gap-3 rounded-2xl bg-surface p-3">
          {user.photo_url ? (
            <img src={user.photo_url} alt="" className="h-11 w-11 rounded-full object-cover" />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-[17px] font-semibold text-accent-text">
              {user.first_name?.[0]?.toUpperCase() ?? "U"}
            </div>
          )}
          <div>
            <div className="text-[15px] font-bold text-text">{user.first_name} {user.last_name}</div>
            <div className="text-[13px] text-muted">{user.username ? `@${user.username}` : t.profile}</div>
          </div>
          {user.is_admin && (
            <Link
              href="/admin"
              className={[
                "flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-bg hover:text-accent focus-visible:bg-bg focus-visible:text-accent",
                onSettingsClick ? "" : "ml-auto",
              ].join(" ")}
              aria-label={t.moderation}
            >
              <ShieldCheck size={18} />
            </Link>
          )}
          {onSettingsClick && (
            <button
              onClick={onSettingsClick}
              aria-label={t.themeLabel}
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-bg hover:text-accent focus-visible:bg-bg focus-visible:text-accent"
            >
              <Settings size={18} />
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
          <MapPinned size={22} className="text-muted" />
          <span className="text-[13px] text-muted">{t.openInTelegram}</span>
        </div>
      )}

      {!onSettingsClick && <div className="mt-auto">
        <SettingsPanel />
      </div>}
    </div>
  );
}

export function AboutPanel() {
  const t = useDict();
  const sections = [
    { title: t.aboutWhat, body: t.aboutWhatBody },
    { title: t.aboutHow, body: t.aboutHowBody },
    { title: t.aboutPrivacy, body: t.aboutPrivacyBody },
    { title: t.aboutTelegram, body: t.aboutTelegramBody },
  ];
  return (
    <div className="px-4 py-4">
      <p className="mb-5 text-[15px] font-medium text-muted">{t.aboutTagline}</p>
      <div className="space-y-5">
        {sections.map(({ title, body }) => (
          <div key={title}>
            <div className="mb-1 text-[14px] font-semibold">{title}</div>
            <p className="text-[14px] leading-relaxed text-muted">{body}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 text-center text-[12px] text-muted">Loci · v0.1</div>
    </div>
  );
}

/* ── Main sidebar ── */

export function DesktopSidebar({
  open,
  onClose,
  onOpen,
  activePanel,
  onSetActivePanel,
  storyId,
  nearbyLocation,
  onNearby,
  authenticated,
}: DesktopSidebarProps) {
  const t = useDict();
  const openStory = useUiStore((s) => s.openStory);
  const requestPanTo = useUiStore((s) => s.requestPanTo);
  const { data: openedStory } = useStory(activePanel === "story" ? storyId : null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activePanel) onSetActivePanel(null);
        else if (open) onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose, activePanel, onSetActivePanel]);

  const openPanel = (panel: Panel) => {
    if (!open) onOpen();
    onSetActivePanel(panel);
  };

  const handleStoryOpen = (id: string, lat: number, lon: number) => {
    openStory(id);
    requestPanTo(lat, lon);
    onSetActivePanel("story");
  };

  const handleToggle = () => {
    if (activePanel) { onSetActivePanel(null); return; }
    if (open) onClose(); else onOpen();
  };

  const panelLabels: Record<Exclude<Panel, null>, string> = {
    saved: t.savedStories,
    "my-stories": t.myStories,
    profile: t.profile,
    about: t.about,
    story: openedStory?.title ?? t.loading,
    trending: t.trending,
    nearby: t.nearby,
    settings: t.themeLabel,
  };

  return (
    <div
      role="navigation"
      aria-label="Main navigation"
      className={[
        "fixed left-0 top-0 z-40 hidden h-full select-none flex-col overflow-hidden lg:flex",
        "bg-bg border-r border-border",
        "transition-[width,box-shadow,border-radius] duration-[230ms] ease-lm will-change-[width]",
        open
          ? "w-[320px] shadow-[2px_0_12px_rgba(0,0,0,0.08)] rounded-r-2xl border-r-0"
          : "w-12 shadow-none rounded-r-none",
      ].join(" ")}
    >
      <div className="flex h-full w-[320px] flex-col">

        {/* ── Header ── */}
        <div className="flex h-14 shrink-0 items-center">
          <button
            aria-label={activePanel ? "Back" : open ? t.cancel : "Menu"}
            onClick={handleToggle}
            className="ml-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text transition-[color,transform] duration-150 ease-lm hover:text-accent focus-visible:text-accent active:scale-95"
          >
            <span className={["absolute transition-all duration-[200ms]",
              (!open && !activePanel) ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-90 scale-75",
            ].join(" ")}><Menu size={18} /></span>
            <span className={["absolute transition-all duration-[200ms]",
              (open && !activePanel) ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-75",
            ].join(" ")}><X size={18} /></span>
            <span className={["absolute transition-all duration-[200ms]",
              activePanel ? "opacity-100 scale-100" : "opacity-0 scale-75 translate-x-2",
            ].join(" ")}><ChevronLeft size={18} /></span>
          </button>

          {/* Panel name — left, fades in when panel active */}
          <div className={[
            "ml-2 flex-1 text-[15px] font-semibold transition-all duration-[230ms] ease-lm",
            activePanel ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 pointer-events-none",
          ].join(" ")}>
            {activePanel ? panelLabels[activePanel] : ""}
          </div>
        </div>

        <div className="mx-3 h-px shrink-0 bg-border" />

        {/* ── Sliding content ── */}
        <div className="flex-1 overflow-hidden">
          <div
            className="flex h-full transition-transform duration-[230ms] ease-lm will-change-transform"
            style={{ width: "640px", transform: activePanel ? "translateX(-320px)" : "translateX(0)" }}
          >
            {/* Main nav */}
            <div className="flex h-full w-[320px] shrink-0 flex-col">
              <nav className="flex-1 overflow-y-auto py-2">
                <div className="space-y-0.5">
                  <Item icon={<Flame size={17} />} label={t.trending} sidebarOpen={open}
                    onClick={() => openPanel("trending")} />
                  <Item icon={<Navigation size={17} />} label={t.nearby} sidebarOpen={open}
                    onClick={() => { onNearby(); openPanel("nearby"); }} />
                </div>
                <div className="mx-3 my-2 h-px bg-border" />
                <div className="space-y-0.5">
                  <Item icon={<Bookmark size={17} />} label={t.savedStories} sidebarOpen={open}
                    onClick={() => openPanel("saved")} />
                  <Item icon={<BookOpen size={17} />} label={t.myStories} sidebarOpen={open}
                    onClick={() => openPanel("my-stories")} />
                </div>
              </nav>

              <div className="mx-3 h-px shrink-0 bg-border" />

              <div className="shrink-0 py-2">
                <div className="space-y-0.5">
                  <Item icon={<Info size={17} />} label={t.about} sidebarOpen={open}
                    onClick={() => openPanel("about")} />
                  <Item icon={<UserRound size={17} />} label={t.profile} sidebarOpen={open}
                    onClick={() => openPanel("profile")} />
                </div>
                {/* Loci brand — centered at bottom, visible when sidebar open */}
                <div className={[
                  "flex items-center justify-center gap-1.5 pb-1 pt-3 transition-all duration-[230ms] ease-lm",
                  open ? "opacity-100" : "opacity-0",
                ].join(" ")}>
                  <MapPin size={13} className="text-accent" />
                  <span className="whitespace-nowrap text-[13px] font-semibold tracking-tight text-muted">{t.appName}</span>
                </div>
              </div>
            </div>

            {/* Panel content */}
            <div className="flex h-full w-[320px] shrink-0 flex-col overflow-y-auto">
              {activePanel === "story" && storyId && (
                <StoryPanel storyId={storyId} authenticated={authenticated} onClose={() => onSetActivePanel(null)} />
              )}
              {activePanel === "trending" && (
                <TrendingPanel authenticated={authenticated} onOpen={handleStoryOpen} />
              )}
              {activePanel === "nearby" && (
                <NearbyPanel location={nearbyLocation} authenticated={authenticated} onOpen={handleStoryOpen} />
              )}
              {activePanel === "saved" && (
                <SavedPanel
                  authenticated={authenticated}
                  onOpen={(story) => handleStoryOpen(story.id, story.lat, story.lon)}
                />
              )}
              {activePanel === "my-stories" && (
                <MyStoriesPanel
                  authenticated={authenticated}
                  onOpen={(story) => handleStoryOpen(story.id, story.lat, story.lon)}
                />
              )}
              {activePanel === "profile" && <ProfilePanel />}
              {activePanel === "about" && <AboutPanel />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
