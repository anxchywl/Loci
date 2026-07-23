"use client";

import { Heart } from "lucide-react";

import { authorLabel, type Category, type Story } from "@/features/stories/api";
import { categoryIcons } from "@/lib/icons/category-glyphs";
import { useDict } from "@/lib/i18n/use-dict";
import { useUiStore } from "@/stores/ui-store";

interface StoryListItemProps {
  story: Story;
  categories: Category[];
  onOpen: (id: string) => void;
  showStatus?: boolean;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact age of a story ("23h"), localized via Intl. */
function useRelativeTime(iso: string): string {
  const locale = useUiStore((s) => s.locale);
  const elapsed = Date.now() - new Date(iso).getTime();
  const format = (value: number, unit: Intl.RelativeTimeFormatUnit) =>
    new Intl.RelativeTimeFormat(locale, { numeric: "always", style: "narrow" })
      .format(-value, unit);

  if (elapsed < HOUR) return format(Math.max(1, Math.round(elapsed / MINUTE)), "minute");
  if (elapsed < DAY) return format(Math.round(elapsed / HOUR), "hour");
  if (elapsed < 30 * DAY) return format(Math.round(elapsed / DAY), "day");
  return format(Math.round(elapsed / (30 * DAY)), "month");
}

export function StoryListItem({ story, categories, onOpen, showStatus = false }: StoryListItemProps) {
  const t = useDict();
  const age = useRelativeTime(story.created_at);
  const category = categories.find((c) => c.id === story.category_id);
  const Icon = category ? categoryIcons[category.slug] : null;

  const statusLabel =
    story.moderation_status === "pending"
      ? t.statusPending
      : story.moderation_status === "rejected"
        ? t.statusRejected
        : t.statusApproved;
  const statusClass =
    story.moderation_status === "rejected"
      ? "bg-[#E5484D]/15 text-[#E5484D]"
      : story.moderation_status === "pending"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";

  // Author-facing variant: a card whose full-width footer carries the
  // moderation state, so the status reads at a glance down the list.
  if (showStatus) {
    const thumb = story.photos[0]?.thumb_url ?? story.photos[0]?.url ?? null;
    return (
      <button
        onClick={() => onOpen(story.id)}
        className="mb-2.5 block w-full overflow-hidden rounded-2xl border border-border bg-surface text-left transition-transform duration-150 ease-lm active:scale-[0.99]"
      >
        <span className="flex items-start gap-3 p-2.5">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl"
            style={{ backgroundColor: category ? `${category.color}1f` : undefined }}
          >
            {thumb ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={thumb} alt="" className="h-full w-full object-cover" />
            ) : (
              Icon && <Icon size={18} color={category?.color} />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{story.title}</span>
              <span className="shrink-0 whitespace-nowrap text-[12px] text-muted">{age}</span>
            </span>
            <span className="block truncate text-[13px] text-muted">{story.body}</span>
            <span className="mt-1 flex items-center gap-3 text-[12px] text-muted">
              <span className="flex items-center gap-1">
                <Heart size={12} /> {story.reaction_count}
              </span>
              {authorLabel(story.author) && <span className="truncate">{authorLabel(story.author)}</span>}
            </span>
          </span>
        </span>
        <span className={`block px-3 py-2 text-[12px] font-medium ${statusClass}`}>
          {statusLabel}
          {story.moderation_status === "rejected" && story.rejection_reason && (
            <span className="story-rejection mt-0.5 block font-normal opacity-90">
              {t.reasonLabel}: {story.rejection_reason}
            </span>
          )}
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={() => onOpen(story.id)}
      className="flex w-full items-start gap-3 border-b border-border py-3 text-left transition-colors duration-150 ease-lm last:border-b-0 active:bg-surface"
    >
      {category && Icon && (
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: category.color }}
        >
          <Icon size={16} color="#ffffff" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{story.title}</span>
        <span className="block truncate text-[13px] text-muted">{story.body}</span>
        <span className="mt-1 flex items-center gap-3 text-[13px] text-muted">
          <span className="flex items-center gap-1">
            <Heart size={13} /> {story.reaction_count}
          </span>
          {authorLabel(story.author) && <span>{authorLabel(story.author)}</span>}
        </span>
      </span>
    </button>
  );
}
