"use client";

import { Bookmark, Flag, MapPin, Share2, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ReactionButton } from "@/features/stories/components/reaction-button";
import { authorLabel } from "@/features/stories/api";
import { BottomSheet } from "@/features/stories/components/bottom-sheet";
import { circularNeighbors } from "@/features/stories/proximity";
import {
  useBookmark,
  useCategories,
  useDeleteStory,
  useDeleteStoryPhoto,
  useReportStory,
  useStory,
} from "@/features/stories/hooks";
import { shareStoryLink } from "@/features/stories/share";
import { useDict } from "@/lib/i18n/use-dict";
import { useUiStore } from "@/stores/ui-store";

interface StorySheetProps {
  authenticated: boolean;
  onBackToSource: () => void;
}

// happened_on arrives as an ISO date (YYYY-MM-DD); render it as DD.MM.YYYY
function formatHappenedOn(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

export function StorySheet({ authenticated, onBackToSource }: StorySheetProps) {
  const t = useDict();
  const storyId = useUiStore((state) => state.openStoryId);
  const closeStory = useUiStore((state) => state.closeStory);
  const openAdjacentStory = useUiStore((state) => state.openAdjacentStory);
  const adjacentPins = useUiStore((state) => state.adjacentPins);
  const requestPanTo = useUiStore((state) => state.requestPanTo);
  const showToast = useUiStore((state) => state.showToast);

  const { data: fetchedStory } = useStory(storyId);
  const [displayedStory, setDisplayedStory] = useState<typeof fetchedStory>(undefined);
  const { data: categories } = useCategories();
  const bookmark = useBookmark(storyId ?? "");
  const report = useReportStory(storyId ?? "");
  const deleteStory = useDeleteStory();
  // inline confirmation shown before a destructive/irreversible action
  const [confirming, setConfirming] = useState<"delete" | "report" | null>(null);
  // full-screen photo viewer; holds the url of the photo being viewed
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [sheetHeight, setSheetHeight] = useState(0);
  const storySource = useUiStore((state) => state.storySource);

  // reset any pending confirmation when the sheet switches to another story
  useEffect(() => {
    if (!storyId) {
      setDisplayedStory(undefined);
      return;
    }
    if (fetchedStory) setDisplayedStory(fetchedStory);
  }, [storyId, fetchedStory]);

  useEffect(() => {
    setConfirming(null);
    setLightboxUrl(null);
  }, [storyId]);

  // close the lightbox with Escape while it's open
  useEffect(() => {
    if (!lightboxUrl) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxUrl(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxUrl]);

  const { prev: prevPin, next: nextPin } = circularNeighbors(adjacentPins, storyId);

  // ~60% of viewport height — keeps the pin above the bottom sheet on mobile
  const mobilePadding = sheetHeight || (typeof window !== "undefined" ? Math.round(window.innerHeight * 0.6) : 400);

  const goTo = (direction: "prev" | "next") => {
    const state = useUiStore.getState();
    const { prev, next } = circularNeighbors(state.adjacentPins, state.openStoryId);
    const pin = direction === "prev" ? prev : next;
    if (!pin) return;
    openAdjacentStory(pin.id, { lat: pin.lat, lon: pin.lon });
    requestPanTo(pin.lat, pin.lon, undefined, mobilePadding);
  };
  const goBack = () => {
    if (storySource) onBackToSource();
    else closeStory();
  };

  if (!storyId) return null;

  const story = fetchedStory ?? displayedStory;

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
  // only approved stories accept reactions/bookmarks — pending or rejected ones
  // are visible only to their author and must not be interactable
  const canInteract = story?.moderation_status === "approved";

  const share = async () => {
    if (!story) return;
    const copied = await shareStoryLink(story.share_token, {
      title: story.title ?? undefined,
      text: t.shareText,
    });
    if (copied) showToast(t.linkCopied);
  };

  return (
    <BottomSheet
      open
      onClose={goBack}
      onBack={storySource ? goBack : undefined}
      title={confirming === "delete" ? undefined : story?.title}
      subtitle={story ? authorLabel(story.author) ?? undefined : undefined}
      titleColor={category?.color}
      onPrev={prevPin && !confirming ? () => goTo("prev") : undefined}
      onNext={nextPin && !confirming ? () => goTo("next") : undefined}
      prevLabel={t.previousStory}
      nextLabel={t.nextStory}
      onHeightChange={setSheetHeight}
      navigationAtBottom
    >
      {story ? (
        <div
          key={`${storyId}-${confirming ?? "story"}`}
          className="space-y-4 motion-safe:animate-story-state"
        >
          {confirming === "delete" ? (
            <div className="space-y-4 rounded-sheet border border-border bg-surface p-4 py-5">
              <div className="text-center">
                <div className="text-[17px] font-semibold">{t.confirmDeleteTitle}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{t.confirmDeleteBody}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setConfirming(null)} disabled={deleteStory.isPending} className="flex-1 rounded border border-border py-2.5 text-[14px] font-medium text-muted transition-transform duration-150 ease-lm active:scale-[0.98] disabled:opacity-50">{t.cancel}</button>
                <button onClick={confirmAction} disabled={deleteStory.isPending} className="flex-1 rounded bg-[#E5484D] py-2.5 text-[14px] font-semibold text-white transition-transform duration-150 ease-lm active:scale-[0.98] disabled:opacity-50">{deleteStory.isPending ? t.deleting : t.deleteStory}</button>
              </div>
            </div>
          ) : confirming === "report" ? (
            <div className="flex flex-col gap-4 rounded-sheet border border-border bg-surface p-5 py-6">
              <div className="text-center">
                <div className="text-[17px] font-semibold">{t.confirmReportTitle}</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{t.confirmReportBody}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirming(null)}
                  disabled={report.isPending}
                  className="flex-1 rounded border border-border py-2.5 text-[14px] font-medium text-muted transition-transform duration-150 ease-lm active:scale-[0.98] disabled:opacity-50"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={confirmAction}
                  disabled={report.isPending}
                  className="flex-1 rounded bg-accent py-2.5 text-[14px] font-semibold text-accent-text transition-transform duration-150 ease-lm active:scale-[0.98] disabled:opacity-50"
                >
                  {t.report}
                </button>
              </div>
            </div>
          ) : (
          <>
          <div className="flex items-center justify-between gap-2 border-b border-border pb-3 text-[13px] text-muted">
            <span className="flex min-w-0 items-center gap-1 truncate">
              <MapPin size={13} />
              {story.location_precision === "approx" ? "≈" : ""}
              {story.lat.toFixed(3)}, {story.lon.toFixed(3)}
            </span>
            {story.happened_on && <span className="shrink-0">{formatHappenedOn(story.happened_on)}</span>}
          </div>

          {story.photos.length > 0 && (
            story.photos.length === 1 ? (
              <div className="relative">
              <button
                type="button"
                onClick={() => setLightboxUrl(story.photos[0].url)}
                aria-label={t.viewPhoto}
                className="block w-full transition-transform duration-150 ease-lm active:scale-[0.99]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={story.photos[0].thumb_url ?? story.photos[0].url}
                  alt=""
                  className="h-52 w-full rounded-sheet object-cover"
                />
              </button>
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto">
                {story.photos.map((photo) => (
                  <div key={photo.id} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setLightboxUrl(photo.url)}
                    aria-label={t.viewPhoto}
                    className="shrink-0 transition-transform duration-150 ease-lm active:scale-[0.98]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.thumb_url ?? photo.url}
                      alt=""
                      className="h-44 w-36 rounded-sheet object-cover"
                    />
                  </button>
                  </div>
                ))}
              </div>
            )
          )}

          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{story.body}</p>

          {story.viewer_is_owner && story.moderation_status !== "approved" && (
            <div
              className={[
                "rounded-xl px-4 py-3 text-[13px]",
                story.moderation_status === "rejected"
                  ? "bg-[#fef2f2] text-[#b91c1c] dark:bg-[#2d1010] dark:text-[#fca5a5]"
                  : "bg-surface text-muted",
              ].join(" ")}
            >
              <div className="font-semibold">
                {story.moderation_status === "rejected" ? t.statusRejected : t.statusPending}
              </div>
              <div className="mt-0.5 leading-snug opacity-80">{t.pendingHint}</div>
            </div>
          )}

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

          </>
          )}
        </div>
      ) : null}
      {lightboxUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.viewPhoto}
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 motion-safe:animate-story-state"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt=""
            className="max-h-full max-w-full rounded-sheet object-contain"
          />
          <button
            type="button"
            aria-label={t.close}
            onClick={() => setLightboxUrl(null)}
            className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white transition-transform duration-150 ease-lm active:scale-95"
          >
            <X size={20} />
          </button>
        </div>
      )}
    </BottomSheet>
  );
}
