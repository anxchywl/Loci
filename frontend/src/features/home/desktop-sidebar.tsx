"use client";

import {
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  Flame,
  Flag,
  Github,
  Info,
  MapPin,
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
import { useEffect, useMemo, useState } from "react";

import { SettingsSection } from "@/components/settings-section";
import { AccountSettings, DeleteAccountIconButton, LogoutIconButton, type SettingsSheet } from "@/features/auth/account-settings";
import { AuthPanel } from "@/features/auth/auth-panel";
import { ChangeNameButton, EditableName } from "@/features/auth/editable-name";
import { useTelegramAuth } from "@/features/auth/hooks";
import { authorLabel } from "@/features/stories/api";
import { ReactionButton } from "@/features/stories/components/reaction-button";
import { NearbyPanel } from "@/features/stories/components/nearby-panel";
import { StoryListItem } from "@/features/stories/components/story-list-item";
import { MyStoriesPanel, SavedPanel } from "@/features/profile/story-panels";
import {
  useBookmark,
  useCategories,
  useDeleteStory,
  useReportStory,
  useStory,
  useTrending,
} from "@/features/stories/hooks";
import { circularNeighbors } from "@/features/stories/proximity";
import { AppIcon } from "@/components/app-icon";
import { type Locale, locales } from "@/lib/i18n/dict";
import { useDict } from "@/lib/i18n/use-dict";
import { openExternalLink, openTelegramLink } from "@/lib/telegram/init";
import { DocView, docTitlesFrom } from "./doc-view";
import { legalDocsFrom, type LegalDocId } from "./legal-content";
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
  authSheet?: SettingsSheet;
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

function formatDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : value;
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
  const openAdjacentStory = useUiStore((s) => s.openAdjacentStory);
  const adjacentPins = useUiStore((s) => s.adjacentPins);
  const requestPanTo = useUiStore((s) => s.requestPanTo);
  const { data: story } = useStory(storyId);
  const { data: categories } = useCategories();
  const bookmark = useBookmark(storyId);
  const report = useReportStory(storyId);
  const deleteStory = useDeleteStory();
  const [confirming, setConfirming] = useState<"delete" | "report" | null>(null);

  useEffect(() => {
    setConfirming(null);
  }, [storyId]);

  const { prev: prevPin, next: nextPin } = circularNeighbors(adjacentPins, storyId);

  const goTo = (direction: "prev" | "next") => {
    const state = useUiStore.getState();
    const { prev, next } = circularNeighbors(state.adjacentPins, state.openStoryId);
    const pin = direction === "prev" ? prev : next;
    if (!pin) return;
    openAdjacentStory(pin.id, { lat: pin.lat, lon: pin.lon });
    requestPanTo(pin.lat, pin.lon);
  };

  const category = categories?.find((c) => c.id === story?.category_id);

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

  // the panel slides in empty rather than flashing a loading label
  if (!story) return null;

  // only approved stories accept reactions/bookmarks — pending/rejected ones are
  // author-only and must not be interactable
  const canInteract = story.moderation_status === "approved";

  return (
    <div
      key={confirming ?? "story"}
      className="space-y-3 px-3 py-2 motion-safe:animate-story-state"
    >
      {/* title row: prev / next flank the story title, mirroring the mobile sheet */}
      <div className="flex items-center gap-1">
        <button aria-label={t.previousStory} onClick={prevPin && !confirming ? () => goTo("prev") : undefined} disabled={!prevPin || !!confirming} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-accent focus-visible:text-accent disabled:opacity-0">
          <ChevronLeft size={22} />
        </button>
        <div key={storyId} className="min-w-0 flex-1 text-center motion-safe:animate-fade-in">
          <div className="break-words text-[16px] font-semibold leading-tight" style={category ? { color: category.color } : undefined}>{story.title}</div>
          {authorLabel(story.author) && <div className="mt-0.5 break-words text-[12px] leading-tight text-muted">{authorLabel(story.author)}</div>}
        </div>
        <button aria-label={t.nextStory} onClick={nextPin && !confirming ? () => goTo("next") : undefined} disabled={!nextPin || !!confirming} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-accent focus-visible:text-accent disabled:opacity-0">
          <ChevronRight size={22} />
        </button>
      </div>
      <div className="border-b border-border" />

      {story.photos.length > 0 && (
        story.photos.length === 1 ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={story.photos[0].thumb_url ?? story.photos[0].url} alt=""
              className="h-40 w-full rounded-lg object-cover" />
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto">
            {story.photos.map((photo) => (
              <div key={photo.id} className="relative shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.thumb_url ?? photo.url} alt=""
                  className="h-36 w-28 rounded-lg object-cover" />
              </div>
            ))}
          </div>
        )
      )}

      <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{story.body}</p>

      {confirming ? (
        <div className="space-y-3 rounded-sheet border border-border bg-surface p-4">
          <div className="text-center text-[15px] font-semibold">
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
            count={story.reaction_count} disabled={!authenticated || !canInteract} />
          <button aria-label={story.viewer_bookmarked ? t.saved : t.save}
            disabled={!authenticated || !canInteract}
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

      {!confirming && (
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-[13px] text-muted">
          <span className="flex min-w-0 items-center gap-1 truncate"><MapPin size={13} />{story.location_precision === "approx" ? "≈" : ""}{story.lat.toFixed(3)}, {story.lon.toFixed(3)}</span>
          {story.happened_on && <span className="shrink-0">{formatDate(story.happened_on)}</span>}
        </div>
      )}

    </div>
  );
}

/**
 * Language and appearance, plus (on mobile, where it is reached through the
 * profile card's gear) the account settings themselves — sign-in methods,
 * sessions, and the danger zone belong behind a deliberate tap rather than in
 * the menu the user opens to browse.
 */
export function SettingsPanel({
  includeAccount = false,
  sheet,
  stepActive = false,
}: {
  includeAccount?: boolean;
  /** lends the host sheet's header to the account steps (mobile) */
  sheet?: SettingsSheet;
  /** an account step is open and owns the sheet: preferences step aside */
  stepActive?: boolean;
}) {
  const t = useDict();
  const { user } = useTelegramAuth();
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
  const localeOrder: Locale[] = ["kk", "en", "ru"];
  const themes: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: t.themeLight, icon: <Sun size={14} /> },
    { value: "auto", label: t.themeAuto, icon: <SunMoon size={14} /> },
    { value: "dark", label: t.themeDark, icon: <Moon size={14} /> },
  ];

  // an iOS/Telegram-style segmented control: pills inside one filled track, the
  // same shape and fill as the cards in the account groups below
  const track = "flex gap-1 rounded-2xl bg-surface p-1";
  const segment = (selected: boolean) =>
    [
      "flex min-w-0 flex-1 items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center text-[13px] font-medium leading-tight transition-colors",
      selected ? "bg-accent text-accent-text" : "text-muted hover:text-text",
    ].join(" ");

  return (
    <div className="flex flex-col gap-4 px-4 py-2">
      {!stepActive && (
        <>
          <SettingsSection title={t.languageLabel} framed={false}>
            <div className={track}>
              {localeOrder.map((l) => (
                <button key={l} onClick={() => handleLocale(l)} className={segment(locale === l)}>
                  {localeLabels[l]}
                </button>
              ))}
            </div>
          </SettingsSection>

          <SettingsSection title={t.themeLabel} framed={false}>
            <div className={track}>
              {themes.map(({ value, label, icon }) => (
                <button key={value} onClick={() => handleTheme(value)} className={segment(theme === value)}>
                  {icon} <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </SettingsSection>
        </>
      )}

      {/* the account groups continue the same section rhythm below a divider */}
      {includeAccount && user && (
        <div className={stepActive ? "" : "border-t border-border pt-4"}>
          <AccountSettings sheet={sheet} showDelete />
        </div>
      )}
    </div>
  );
}

export function ProfilePanel({
  onSettingsClick,
  authSheet,
}: {
  onSettingsClick?: () => void;
  authSheet?: SettingsSheet;
}) {
  const t = useDict();
  const { user } = useTelegramAuth();
  const [authActive, setAuthActive] = useState(false);

  return (
    <div className="flex h-full flex-col gap-5 px-4 py-2">
      {user ? (
        <div className="flex items-center gap-3 rounded-2xl bg-surface p-3">
          <div className="min-w-0 flex-1">
            <EditableName user={user} />
          </div>
          {user.is_admin && (
            <Link
              href="/admin"
              className={[
                "flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:text-accent focus-visible:text-accent",
                onSettingsClick ? "" : "ml-auto",
              ].join(" ")}
              aria-label={t.moderation}
            >
              <ShieldCheck size={18} />
            </Link>
          )}
          {onSettingsClick && !authActive && (
            <button
              onClick={onSettingsClick}
              aria-label={t.settings}
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:text-accent focus-visible:text-accent"
            >
              <Settings size={18} />
            </button>
          )}
          <div className="flex shrink-0 items-center gap-1">
            {!onSettingsClick && <ChangeNameButton user={user} iconOnly />}
            <LogoutIconButton />
            {!onSettingsClick && <DeleteAccountIconButton />}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col justify-center px-1 py-6">
          <AuthPanel useDialogForEmail sheet={authSheet} onViewChange={setAuthActive} />
          {onSettingsClick && (
            <div className="mt-5 border-t border-border pt-2">
              <button
                onClick={onSettingsClick}
                className="group flex w-full items-center gap-3 rounded-lg px-1 py-2.5 text-left text-[14px] font-medium text-text transition-colors duration-150 active:scale-[0.99]"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center text-muted transition-colors group-hover:text-[var(--lm-accent-soft)]">
                  <Settings size={18} />
                </span>
                <span className="transition-colors group-hover:text-[var(--lm-accent-soft)]">{t.settings}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* with a gear in the card (mobile), the account settings live behind it */}
      {user && !onSettingsClick && (
        <div className="overflow-y-auto">
          <AccountSettings showProfile={false} />
        </div>
      )}

      {!onSettingsClick && <div className="mt-auto border-t border-border pt-4">
        <SettingsPanel />
      </div>}
    </div>
  );
}

const REPO_URL = "https://github.com/anxchywl/loci";

function AboutLinkRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg py-2.5 text-left text-[14px] font-medium text-text active:scale-[0.99]"
    >
      <span className="flex w-8 shrink-0 items-center justify-center text-muted transition-colors group-hover:text-accent">
        {icon}
      </span>
      <span className="min-w-0 flex-1 transition-colors group-hover:text-accent">{label}</span>
    </button>
  );
}

export function AboutPanel({ onOpenDoc }: { onOpenDoc: (id: LegalDocId) => void }) {
  const t = useDict();

  const sections = [
    { title: t.aboutWhat, body: t.aboutWhatBody },
    { title: t.aboutHow, body: t.aboutHowBody },
    { title: t.aboutPrivacy, body: t.aboutPrivacyBody },
    { title: t.aboutTelegram, body: t.aboutTelegramBody },
  ];

  const docLinks: { id: LegalDocId; icon: React.ReactNode; label: string }[] = [
    { id: "privacy", icon: <ShieldCheck size={16} />, label: t.aboutPrivacyPolicy },
    { id: "terms", icon: <FileText size={16} />, label: t.aboutTerms },
  ];

  return (
    <div className="px-4 py-4">
      <div className="space-y-5">
        {sections.map(({ title, body }) => (
          <div key={title}>
            <div className="mb-1 text-[14px] font-semibold">{title}</div>
            <p className="text-[14px] leading-relaxed text-muted">{body}</p>
          </div>
        ))}
      </div>

      <div className="my-5 h-px bg-border" />

      <div className="space-y-0.5">
        {docLinks.map(({ id, icon, label }) => (
          <AboutLinkRow key={id} icon={icon} label={label} onClick={() => onOpenDoc(id)} />
        ))}
        <AboutLinkRow icon={<Github size={16} />} label={t.aboutGithub}
          onClick={() => openExternalLink(REPO_URL)} />
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
  authSheet,
}: DesktopSidebarProps) {
  const t = useDict();
  const openStory = useUiStore((s) => s.openStory);
  const storySource = useUiStore((s) => s.storySource);
  const closeStory = useUiStore((s) => s.closeStory);
  const requestPanTo = useUiStore((s) => s.requestPanTo);
  const [openDoc, setOpenDoc] = useState<LegalDocId | null>(null);
  const [authBack, setAuthBack] = useState<(() => void) | null>(null);
  const docTitles = docTitlesFrom(t);

  const desktopAuthSheet = useMemo<SettingsSheet>(() => ({
    transition: (apply) => apply(),
    setView: (view) => setAuthBack(() => view?.onBack ?? null),
  }), []);

  // A document is a sub-view of the About panel; drop it whenever we leave About.
  useEffect(() => {
    if (activePanel !== "about") setOpenDoc(null);
  }, [activePanel]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (openDoc) setOpenDoc(null);
        else if (activePanel) onSetActivePanel(null);
        else if (open) onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose, activePanel, onSetActivePanel, openDoc]);

  const openPanel = (panel: Panel) => {
    if (!open) onOpen();
    onSetActivePanel(panel);
  };

  const handleStoryOpen = (id: string, lat: number, lon: number, source?: Panel) => {
    const storySource = source === "trending" || source === "nearby" || source === "saved" || source === "my-stories" ? source : null;
    openStory(id, { lat, lon }, storySource);
    requestPanTo(lat, lon);
    onSetActivePanel("story");
  };

  const handleToggle = () => {
    if (openDoc) { setOpenDoc(null); return; }
    if (activePanel) {
      if (activePanel === "profile" && authBack) {
        authBack();
        return;
      }
      if (activePanel === "story") {
        closeStory();
        onSetActivePanel(storySource);
      } else {
        onSetActivePanel(null);
      }
      return;
    }
    if (open) onClose(); else onOpen();
  };

  const panelLabels: Record<Exclude<Panel, null>, string> = {
    saved: t.savedStories,
    "my-stories": t.myStories,
    profile: t.profile,
    about: t.about,
    // the story panel renders its own title (colored by category) inline
    story: "",
    trending: t.trending,
    nearby: t.nearby,
    settings: t.settings,
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
        <div className="relative flex h-14 shrink-0 items-center">
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

          {/* brand and panel title share the header slot for a smooth transition */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className={[
              "flex items-center gap-1 transition-all duration-[230ms] ease-lm",
              open && !activePanel ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0 pointer-events-none",
            ].join(" ")}>
              <AppIcon size={32} />
              <span className="-ml-1.5 whitespace-nowrap text-[15px] font-semibold tracking-tight text-muted">{t.appName}</span>
            </div>
            <div className={[
              "absolute left-12 text-[15px] font-semibold transition-all duration-[230ms] ease-lm",
              activePanel ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0 pointer-events-none",
            ].join(" ")}>
              {openDoc ? docTitles[openDoc] : activePanel ? panelLabels[activePanel] : ""}
            </div>
          </div>
        </div>

        <div className="mx-3 h-px shrink-0 bg-border" />

        {/* ── Sliding content ── */}
        {/* overflow-clip, not hidden: hidden is still programmatically scrollable,
            so focusing an edge button (prev/next) would shift the track sideways */}
        {/* min-h-0: without it this flex child grows to fit its content instead
            of the space left over, so tall panels overflow the viewport and the
            inner column never gets a scrollbar */}
        <div className="min-h-0 flex-1 overflow-clip">
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
              </div>
            </div>

            {/* Panel content */}
            <div className="flex h-full w-[320px] shrink-0 flex-col overflow-y-auto">
              {activePanel === "story" && storyId && (
                <StoryPanel storyId={storyId} authenticated={authenticated} onClose={() => onSetActivePanel(null)} />
              )}
              {activePanel === "trending" && (
                <TrendingPanel authenticated={authenticated} onOpen={(id, lat, lon) => handleStoryOpen(id, lat, lon, "trending")} />
              )}
              {activePanel === "nearby" && (
                <NearbyPanel location={nearbyLocation} onOpen={(id, lat, lon) => handleStoryOpen(id, lat, lon, "nearby")} />
              )}
              {activePanel === "saved" && (
                <SavedPanel
                  authenticated={authenticated}
                  onOpen={(story) => handleStoryOpen(story.id, story.lat, story.lon, "saved")}
                />
              )}
              {activePanel === "my-stories" && (
                <MyStoriesPanel
                  authenticated={authenticated}
                  onOpen={(story) => handleStoryOpen(story.id, story.lat, story.lon, "my-stories")}
                />
              )}
              {activePanel === "profile" && <ProfilePanel authSheet={desktopAuthSheet} />}
              {activePanel === "settings" && <SettingsPanel includeAccount />}
              {activePanel === "about" && (
                <div key={openDoc ?? "about"} className="animate-fade-in">
                  {openDoc ? (
                    <DocView blocks={legalDocsFrom(t.legal)[openDoc]} />
                  ) : (
                    <AboutPanel onOpenDoc={setOpenDoc} />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
