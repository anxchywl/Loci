"use client";

import {
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Flag,
  Flame,
  Info,
  MapPin,
  Menu,
  Navigation,
  Search,
  Send,
  Settings,
  Share2,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ReactionButton } from "@/features/stories/components/reaction-button";
import {
  useBookmark,
  useCategories,
  useComments,
  usePostComment,
  useReportStory,
  useStory,
} from "@/features/stories/hooks";
import { categoryIcons } from "@/lib/icons/category-glyphs";
import { useDict } from "@/lib/i18n/use-dict";
import { openTelegramLink } from "@/lib/telegram/init";
import { useUiStore } from "@/stores/ui-store";

export type Panel = "saved" | "my-stories" | "profile" | "settings" | "about" | "story" | null;

interface DesktopSidebarProps {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  onTrending: () => void;
  onNearby: () => void;
  onSearchFocus: () => void;
  activePanel: Panel;
  onSetActivePanel: (p: Panel) => void;
  storyId: string | null;
  authenticated: boolean;
}

interface ItemProps {
  icon: React.ReactNode;
  label: string;
  sidebarOpen: boolean;
  onClick: () => void;
  chevron?: boolean;
}

function Item({ icon, label, sidebarOpen, onClick, chevron }: ItemProps) {
  return (
    <button
      onClick={onClick}
      className="mx-1 flex w-[calc(100%-8px)] items-center rounded-lg py-2.5 text-left transition-colors duration-100 hover:bg-surface active:bg-surface"
    >
      <span className="flex w-10 shrink-0 items-center justify-center text-muted">
        {icon}
      </span>
      <span className={[
        "flex-1 whitespace-nowrap text-[14px] font-medium text-text transition-opacity duration-[230ms]",
        sidebarOpen ? "opacity-100" : "opacity-0",
      ].join(" ")}>
        {label}
      </span>
      {chevron && (
        <ChevronRight size={15} className={[
          "mr-2 shrink-0 text-muted transition-opacity duration-[230ms]",
          sidebarOpen ? "opacity-40" : "opacity-0",
        ].join(" ")} />
      )}
    </button>
  );
}

function PanelPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
      <span className="text-[13px] text-muted">{label}</span>
    </div>
  );
}

function StoryPanel({ storyId, authenticated }: { storyId: string; authenticated: boolean }) {
  const t = useDict();
  const showToast = useUiStore((state) => state.showToast);
  const { data: story } = useStory(storyId);
  const { data: categories } = useCategories();
  const { data: comments } = useComments(storyId);
  const [commentDraft, setCommentDraft] = useState("");
  const postComment = usePostComment(storyId);
  const bookmark = useBookmark(storyId);
  const report = useReportStory(storyId);

  const category = categories?.find((c) => c.id === story?.category_id);
  const Icon = category ? categoryIcons[category.slug] : null;

  const share = async () => {
    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
    const link = botUsername
      ? `https://t.me/${botUsername}?startapp=${storyId}`
      : window.location.href;
    if (!openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}`)) {
      await navigator.clipboard.writeText(link);
      showToast(t.linkCopied);
    }
  };

  const submitComment = () => {
    const body = commentDraft.trim();
    if (!body) return;
    postComment.mutate(body, { onSuccess: () => setCommentDraft("") });
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
        <button aria-label={t.report} disabled={!authenticated || report.isSuccess}
          onClick={() => report.mutate(null, { onSuccess: () => showToast(t.reported) })}
          className="ml-auto rounded-full border border-border p-2 text-muted transition-transform duration-150 ease-lm active:scale-95 disabled:opacity-50">
          <Flag size={16} />
        </button>
      </div>

      <div>
        <div className="mb-2 text-[15px] font-semibold">{t.comments} · {story.comment_count}</div>
        {comments && comments.length === 0 && (
          <div className="py-3 text-[13px] text-muted">{t.noCommentsYet}</div>
        )}
        <div className="space-y-3">
          {comments?.map((comment) => (
            <div key={comment.id} className="text-[15px]">
              <span className="font-medium">
                {comment.author ? (comment.author.username ?? comment.author.first_name) : t.anonymous}
              </span>{" "}
              <span>{comment.body}</span>
            </div>
          ))}
        </div>
        {authenticated && (
          <div className="mt-3 flex items-center gap-2">
            <input value={commentDraft} onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitComment()}
              placeholder={t.commentPlaceholder} maxLength={1000}
              className="min-w-0 flex-1 rounded border border-border bg-bg px-3 py-2 text-[15px] outline-none placeholder:text-muted" />
            <button aria-label={t.send} onClick={submitComment}
              disabled={postComment.isPending || !commentDraft.trim()}
              className="rounded bg-accent p-2 text-accent-text transition-transform duration-150 ease-lm active:scale-95 disabled:opacity-50">
              <Send size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function DesktopSidebar({
  open,
  onClose,
  onOpen,
  onTrending,
  onNearby,
  onSearchFocus,
  activePanel,
  onSetActivePanel,
  storyId,
  authenticated,
}: DesktopSidebarProps) {
  const t = useDict();
  const sidebarRef = useRef<HTMLDivElement>(null);
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

  // Open the full sidebar before navigating to a panel (from the collapsed strip)
  const openPanel = (panel: Panel) => {
    if (!open) onOpen();
    onSetActivePanel(panel);
  };

  const handleToggle = () => {
    if (activePanel) { onSetActivePanel(null); return; }
    if (open) { onClose(); } else { onOpen(); }
  };

  const panelLabels: Record<Exclude<Panel, null>, string> = {
    saved: t.savedStories,
    "my-stories": t.myStories,
    profile: t.profile,
    settings: t.settings,
    about: t.about,
    story: openedStory?.title ?? t.loading,
  };

  return (
    <div
      ref={sidebarRef}
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
            className="ml-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text transition-colors hover:bg-surface"
          >
            <span className={["absolute transition-all duration-[200ms]",
              (!open && !activePanel) ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-90 scale-75",
            ].join(" ")}><Menu size={18} /></span>
            <span className={["absolute transition-all duration-[200ms]",
              (open && !activePanel) ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-75",
            ].join(" ")}><X size={18} /></span>
            <span className={["absolute transition-all duration-[200ms]",
              activePanel ? "opacity-100 scale-100 translate-x-0" : "opacity-0 scale-75 translate-x-2",
            ].join(" ")}><ChevronLeft size={18} /></span>
          </button>

          <div className="relative ml-2 h-6 flex-1 overflow-hidden">
            <div className={["absolute inset-0 flex items-center gap-1.5 transition-all duration-[230ms] ease-lm",
              activePanel ? "opacity-0 -translate-x-3 pointer-events-none" : "opacity-100 translate-x-0",
            ].join(" ")}>
              <MapPin size={15} className="shrink-0 text-accent" />
              <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight">{t.appName}</span>
            </div>
            <div className={["absolute inset-0 flex items-center transition-all duration-[230ms] ease-lm",
              activePanel ? "opacity-100 translate-x-0" : "opacity-0 translate-x-3 pointer-events-none",
            ].join(" ")}>
              <span className="whitespace-nowrap text-[15px] font-semibold">
                {activePanel ? panelLabels[activePanel] : ""}
              </span>
            </div>
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
                  <Item icon={<Search size={17} />} label={t.searchPlaceholder} sidebarOpen={open}
                    onClick={() => { onSearchFocus(); onClose(); }} />
                  <Item icon={<Flame size={17} />} label={t.trending} sidebarOpen={open}
                    onClick={() => { onTrending(); onClose(); }} />
                  <Item icon={<Navigation size={17} />} label={t.nearby} sidebarOpen={open}
                    onClick={() => { onNearby(); onClose(); }} />
                </div>
                <div className="mx-3 my-2 h-px bg-border" />
                <div className="space-y-0.5">
                  <Item icon={<Bookmark size={17} />} label={t.savedStories} sidebarOpen={open} chevron
                    onClick={() => openPanel("saved")} />
                  <Item icon={<BookOpen size={17} />} label={t.myStories} sidebarOpen={open} chevron
                    onClick={() => openPanel("my-stories")} />
                </div>
              </nav>

              <div className="mx-3 h-px shrink-0 bg-border" />

              <div className="shrink-0 py-2">
                <div className="space-y-0.5">
                  <Item icon={<UserRound size={17} />} label={t.profile} sidebarOpen={open} chevron
                    onClick={() => openPanel("profile")} />
                  <Item icon={<Settings size={17} />} label={t.settings} sidebarOpen={open} chevron
                    onClick={() => openPanel("settings")} />
                  <Item icon={<Info size={17} />} label={t.about} sidebarOpen={open} chevron
                    onClick={() => openPanel("about")} />
                </div>
              </div>
            </div>

            {/* Panel content */}
            <div className="flex h-full w-[320px] shrink-0 flex-col overflow-y-auto">
              {activePanel === "story" && storyId && (
                <StoryPanel storyId={storyId} authenticated={authenticated} />
              )}
              {activePanel === "saved" && <PanelPlaceholder label={t.savedStories} />}
              {activePanel === "my-stories" && <PanelPlaceholder label={t.myStories} />}
              {activePanel === "profile" && <PanelPlaceholder label={t.profile} />}
              {activePanel === "settings" && <PanelPlaceholder label={t.settings} />}
              {activePanel === "about" && <PanelPlaceholder label={t.about} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
