"use client";

import { Bookmark, Flag, MapPin, Share2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { ReactionButton } from "@/features/stories/components/reaction-button";
import { BottomSheet } from "@/features/stories/components/bottom-sheet";
import {
  useBookmark,
  useCategories,
  useDeleteStory,
  useReportStory,
  useStory,
} from "@/features/stories/hooks";
import { categoryIcons } from "@/lib/icons/category-glyphs";
import { useDict } from "@/lib/i18n/use-dict";
import { openTelegramLink } from "@/lib/telegram/init";
import { useUiStore } from "@/stores/ui-store";

interface StorySheetProps {
  authenticated: boolean;
}

export function StorySheet({ authenticated }: StorySheetProps) {
  const t = useDict();
  const storyId = useUiStore((state) => state.openStoryId);
  const closeStory = useUiStore((state) => state.closeStory);
  const showToast = useUiStore((state) => state.showToast);

  const { data: story } = useStory(storyId);
  const { data: categories } = useCategories();
  const bookmark = useBookmark(storyId ?? "");
  const report = useReportStory(storyId ?? "");
  const deleteStory = useDeleteStory();
  // inline confirmation shown before a destructive/irreversible action
  const [confirming, setConfirming] = useState<"delete" | "report" | null>(null);

  // reset any pending confirmation when the sheet switches to another story
  useEffect(() => {
    setConfirming(null);
  }, [storyId]);

  if (!storyId) return null;

  const confirmAction = () => {
    if (!story) return;
    if (confirming === "delete") {
      deleteStory.mutate(story.id, {
        onSuccess: () => {
          setConfirming(null);
          closeStory();
        },
        onError: () => showToast(t.errorGeneric),
      });
    } else if (confirming === "report") {
      report.mutate(null, {
        onSuccess: () => {
          setConfirming(null);
          showToast(t.reported);
        },
        onError: () => showToast(t.errorGeneric),
      });
    }
  };

  const category = categories?.find((c) => c.id === story?.category_id);
  const Icon = category ? categoryIcons[category.slug] : null;
  // only approved stories accept reactions/bookmarks — pending or rejected ones
  // are visible only to their author and must not be interactable
  const canInteract = story?.moderation_status === "approved";

  const share = async () => {
    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
    const link = botUsername
      ? `https://t.me/${botUsername}?startapp=${storyId}`
      : window.location.href;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(t.shareText)}`;
    if (!openTelegramLink(shareUrl)) {
      await navigator.clipboard.writeText(`${t.shareText} ${link}`);
      showToast(t.linkCopied);
    }
  };

  return (
    <BottomSheet open onClose={closeStory} title={confirming === "delete" ? undefined : story?.title ?? t.loading}>
      {story && (
        <div
          key={confirming ?? "story"}
          className="space-y-4 motion-safe:animate-story-state"
        >
          {confirming === "delete" ? (
            <div className="space-y-4 py-2">
              <div>
                <div className="text-[17px] font-semibold">{t.confirmDeleteTitle}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{t.confirmDeleteBody}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setConfirming(null)} disabled={deleteStory.isPending} className="flex-1 rounded border border-border py-2.5 text-[14px] font-medium text-muted transition-transform duration-150 ease-lm active:scale-[0.98] disabled:opacity-50">{t.cancel}</button>
                <button onClick={confirmAction} disabled={deleteStory.isPending} className="flex-1 rounded bg-[#E5484D] py-2.5 text-[14px] font-semibold text-white transition-transform duration-150 ease-lm active:scale-[0.98] disabled:opacity-50">{deleteStory.isPending ? t.deleting : t.deleteStory}</button>
              </div>
            </div>
          ) : (
          <>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            {category && Icon && (
              <span
                className="flex items-center gap-1 rounded-full px-2.5 py-1 font-medium text-white"
                style={{ backgroundColor: category.color }}
              >
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
                <img
                  key={photo.id}
                  src={photo.thumb_url ?? photo.url}
                  alt=""
                  className="h-40 rounded-sheet object-cover"
                />
              ))}
            </div>
          )}

          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{story.body}</p>

          {confirming === "report" ? (
            <div className="space-y-3 rounded-sheet border border-border p-3">
              <div className="text-[15px] font-semibold">
                {t.confirmReportTitle}
              </div>
              <p className="text-[13px] text-muted">
                {t.confirmReportBody}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirming(null)}
                  disabled={report.isPending}
                  className="flex-1 rounded border border-border py-2 text-[14px] font-medium text-muted transition-transform duration-150 ease-lm active:scale-[0.98] disabled:opacity-50"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={confirmAction}
                  disabled={report.isPending}
                  className="flex-1 rounded bg-accent py-2 text-[14px] font-semibold text-accent-text transition-transform duration-150 ease-lm active:scale-[0.98] disabled:opacity-50"
                >
                  {t.report}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <ReactionButton
                storyId={story.id}
                reacted={story.viewer_reacted}
                count={story.reaction_count}
                disabled={!authenticated || !canInteract}
              />
              <button
                aria-label={story.viewer_bookmarked ? t.saved : t.save}
                disabled={!authenticated || !canInteract}
                onClick={() => bookmark.mutate(story.viewer_bookmarked)}
                className="rounded-full border border-border p-2 transition-transform duration-150 ease-lm active:scale-95 disabled:opacity-50"
              >
                <Bookmark
                  size={16}
                  fill={story.viewer_bookmarked ? "currentColor" : "none"}
                />
              </button>
              <button
                aria-label={t.share}
                onClick={share}
                className="rounded-full border border-border p-2 transition-transform duration-150 ease-lm active:scale-95"
              >
                <Share2 size={16} />
              </button>
              <div className="ml-auto flex items-center gap-2">
                {story.viewer_is_owner ? (
                  <button
                    aria-label={t.deleteStory}
                    onClick={() => setConfirming("delete")}
                    className="rounded-full border border-border p-2 text-[#E5484D] transition-transform duration-150 ease-lm active:scale-95"
                  >
                    <Trash2 size={16} />
                  </button>
                ) : (
                  <button
                    aria-label={t.report}
                    disabled={!authenticated || report.isSuccess}
                    onClick={() => setConfirming("report")}
                    className="rounded-full border border-border p-2 text-muted transition-transform duration-150 ease-lm active:scale-95 disabled:opacity-50"
                  >
                    <Flag size={16} />
                  </button>
                )}
              </div>
            </div>
          )}
          </>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
