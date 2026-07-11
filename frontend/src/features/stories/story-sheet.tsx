"use client";

import { Bookmark, Flag, MapPin, Share2 } from "lucide-react";

import { ReactionButton } from "@/features/stories/components/reaction-button";
import { BottomSheet } from "@/features/stories/components/bottom-sheet";
import {
  useBookmark,
  useCategories,
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

  if (!storyId) return null;

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

  return (
    <BottomSheet open onClose={closeStory} title={story?.title ?? t.loading}>
      {story && (
        <div className="space-y-4">
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

          <div className="flex items-center gap-2">
            <ReactionButton
              storyId={story.id}
              reacted={story.viewer_reacted}
              count={story.reaction_count}
              disabled={!authenticated}
            />
            <button
              aria-label={story.viewer_bookmarked ? t.saved : t.save}
              disabled={!authenticated}
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
            <button
              aria-label={t.report}
              disabled={!authenticated || report.isSuccess}
              onClick={() =>
                report.mutate(null, { onSuccess: () => showToast(t.reported) })
              }
              className="ml-auto rounded-full border border-border p-2 text-muted transition-transform duration-150 ease-lm active:scale-95 disabled:opacity-50"
            >
              <Flag size={16} />
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
