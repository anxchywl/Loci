"use client";

import { Check } from "lucide-react";
import { useState } from "react";

import { BottomSheet } from "@/features/stories/components/bottom-sheet";
import { useCategories, useCreateStory } from "@/features/stories/hooks";
import { categoryIcons } from "@/lib/icons/category-glyphs";
import { useDict } from "@/lib/i18n/use-dict";
import { useUiStore } from "@/stores/ui-store";
import { useMobileFocusMode } from "@/features/stories/use-mobile-focus-mode";
import { StoryCalendar } from "@/features/stories/components/story-calendar";
import { PhotoPicker } from "@/features/stories/components/photo-picker";
import { finalizeStoryText, normalizeStoryText } from "@/features/stories/text-input";

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export function AddStorySheet() {
  const t = useDict();
  const mode = useUiStore((state) => state.mode);
  const pickedLocation = useUiStore((state) => state.pickedLocation);
  const cancelCompose = useUiStore((state) => state.cancelCompose);
  const finishCompose = useUiStore((state) => state.finishCompose);
  const showToast = useUiStore((state) => state.showToast);
  const requestPanTo = useUiStore((state) => state.requestPanTo);

  const { data: categories } = useCategories();
  const createStory = useCreateStory();

  const [submitted, setSubmitted] = useState(false);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [happenedOn, setHappenedOn] = useState("");
  const [approx, setApprox] = useState(true);
  const [isPublic, setIsPublic] = useState(true);
  const [anonymous, setAnonymous] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const focusMode = useMobileFocusMode();

  const reset = () => {
    setCategoryId(null);
    setTitle("");
    setBody("");
    setHappenedOn("");
    setApprox(true);
    setIsPublic(true);
    setAnonymous(false);
    setPhotos([]);
    setUploadProgress(0);
    setCalendarOpen(false);
  };

  const close = () => {
    focusMode.clearFocus();
    reset();
    cancelCompose();
  };

  // dismiss the post-submit confirmation and return to the map
  const finish = () => {
    setSubmitted(false);
    reset();
    finishCompose();
  };

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const accepted = Array.from(files).filter((file) => file.size <= MAX_PHOTO_BYTES && ["image/jpeg", "image/png", "image/webp", "image/heic"].includes(file.type));
    setPhotos((current) => [...current, ...accepted].slice(0, MAX_PHOTOS));
  };

  const canPublish =
    pickedLocation !== null &&
    categoryId !== null &&
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    !createStory.isPending;

  const publish = () => {
    if (!canPublish || !pickedLocation || categoryId === null) return;
    createStory.mutate(
      {
        category_id: categoryId,
        title: title.trim(),
        body: body.trim(),
        lat: pickedLocation.lat,
        lon: pickedLocation.lon,
        location_precision: approx ? "approx" : "exact",
        visibility: isPublic ? "public" : "private",
        is_anonymous: anonymous,
        happened_on: happenedOn || null,
        photos,
        onUploadProgress: setUploadProgress,
      },
      {
        onSuccess: () => {
          // the story is pending review, so instead of opening it we show a
          // confirmation that it was sent for moderation
          reset();
          requestPanTo(pickedLocation.lat, pickedLocation.lon, 14);
          setSubmitted(true);
        },
        onError: () => showToast(t.errorGeneric),
      },
    );
  };

  if (submitted) {
    return (
      <BottomSheet open={mode === "compose"} onClose={finish}>
        <div className="flex items-center gap-3 px-1 pb-4 pt-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15">
            <Check size={18} className="text-accent" />
          </div>
          <p className="flex-1 text-[13px] leading-snug text-muted">{t.storySentBody}</p>
              <button
            onClick={finish}
            className="shrink-0 rounded bg-accent px-4 py-2 text-[13px] font-semibold text-accent-text transition-transform duration-150 ease-lm active:scale-[0.98]"
          >
            {t.gotIt}
          </button>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      open={mode === "compose"}
      onClose={close}
      title={t.newStory}
      isEditing={focusMode.isFocusMode}
    >
      <div
        className={`keyboard-form-stack ${focusMode.isFocusMode ? "keyboard-form-stack-focus" : ""} ${focusMode.isSwitching ? "keyboard-form-stack-switching" : ""}`}
        data-story-form
      >
        <div className={focusMode.sectionClass("category")} aria-hidden={focusMode.isFocusMode}>
          <div className="mb-2 text-[13px] font-medium text-muted">{t.category}</div>
          <div className="flex flex-wrap gap-2">
            {categories?.map((category) => {
              const Icon = categoryIcons[category.slug];
              const selected = categoryId === category.id;
              return (
                <button
                  key={category.id}
                  aria-pressed={selected}
                  onClick={() => setCategoryId(category.id)}
                  className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 ease-lm"
                  style={
                    selected
                      ? {
                          backgroundColor: category.color,
                          borderColor: category.color,
                          color: "#ffffff",
                        }
                      : { borderColor: "var(--lm-border)" }
                  }
                >
                  <Icon size={14} color={selected ? "#ffffff" : category.color} />
                  {t.categories[category.slug]}
                </button>
              );
            })}
          </div>
        </div>

        <div className={focusMode.sectionClass("title")} data-keyboard-field="title">
          <label className="mb-1 block text-[13px] font-medium text-muted" htmlFor="story-title">
            {t.titleLabel}
          </label>
          <input
            id="story-title"
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(normalizeStoryText(event.target.value))}
            onBlur={(event) => { setTitle(finalizeStoryText(event.target.value)); focusMode.onFieldBlur(); }}
            placeholder={t.titlePlaceholder}
            {...focusMode.fieldFocusProps("title")}
            className="w-full rounded border border-border bg-bg px-3 py-2 text-[15px] outline-none placeholder:text-muted"
          />
        </div>

        <div className={focusMode.sectionClass("body")} data-keyboard-field="body">
          <label className="mb-1 block text-[13px] font-medium text-muted" htmlFor="story-body">
            {t.bodyLabel}
          </label>
          <textarea
            id="story-body"
            value={body}
            maxLength={4000}
            rows={4}
            onChange={(event) => setBody(normalizeStoryText(event.target.value, true))}
            placeholder={t.bodyPlaceholder}
            onBlur={(event) => { setBody(finalizeStoryText(event.target.value, true)); focusMode.onFieldBlur(); }}
            {...focusMode.fieldFocusProps("body")}
            className="w-full resize-none rounded border border-border bg-bg px-3 py-2 text-[15px] outline-none placeholder:text-muted"
          />
        </div>

        <div className={focusMode.sectionClass("date")} aria-hidden={focusMode.isFocusMode}>
          <div className="mb-1 block text-[13px] font-medium text-muted">
            {t.dateLabel}
          </div>
          {calendarOpen ? <StoryCalendar value={happenedOn} onChange={setHappenedOn} onClose={() => setCalendarOpen(false)} calendarLabel={t.dateLabel} previousLabel={t.previousMonth} nextLabel={t.nextMonth} closeLabel={t.cancel} /> : (
            <button type="button" onClick={() => setCalendarOpen(true)} className="flex w-full items-center justify-between rounded border border-border bg-bg px-3 py-2 text-left text-[15px]">
              <span className={happenedOn ? "" : "text-muted"}>{happenedOn || t.dateLabel}</span>
              <span className="text-[13px] text-muted">{happenedOn ? t.change : t.pick}</span>
            </button>
          )}
        </div>

        <div className={focusMode.sectionClass("photos")} aria-hidden={focusMode.isFocusMode}>
          <div className="mb-2 text-[13px] font-medium text-muted">{t.photosLabel}</div>
          <PhotoPicker photos={photos} maxPhotos={MAX_PHOTOS} onAdd={addPhotos} onRemove={(index) => setPhotos((current) => current.filter((_, i) => i !== index))} addLabel={t.addPhoto} removeLabel={t.cancel} disabled={createStory.isPending} />
        </div>

        <div className={focusMode.sectionClass("location")} aria-hidden={focusMode.isFocusMode}>
          <div className="mb-2 text-[13px] font-medium text-muted">{t.locationLabel}</div>
          <div className="flex rounded border border-border p-0.5" role="radiogroup">
            <button
              role="radio"
              aria-checked={approx}
              onClick={() => setApprox(true)}
              className={`flex-1 rounded px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 ease-lm ${approx ? "bg-accent text-accent-text" : "text-muted"}`}
            >
              {t.locationApprox}
            </button>
            <button
              role="radio"
              aria-checked={!approx}
              onClick={() => setApprox(false)}
              className={`flex-1 rounded px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 ease-lm ${approx ? "text-muted" : "bg-accent text-accent-text"}`}
            >
              {t.locationExact}
            </button>
          </div>
          {approx && <div className="mt-1 text-[13px] text-muted">{t.locationApproxHint}</div>}
        </div>

        <div className={focusMode.sectionClass("visibility")} aria-hidden={focusMode.isFocusMode}>
          <div className="mb-2 text-[13px] font-medium text-muted">{t.visibilityLabel}</div>
          <div className="flex rounded border border-border p-0.5" role="radiogroup">
            <button
              role="radio"
              aria-checked={isPublic}
              onClick={() => setIsPublic(true)}
              className={`flex-1 rounded px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 ease-lm ${isPublic ? "bg-accent text-accent-text" : "text-muted"}`}
            >
              {t.visibilityPublic}
            </button>
            <button
              role="radio"
              aria-checked={!isPublic}
              onClick={() => setIsPublic(false)}
              className={`flex-1 rounded px-3 py-1.5 text-[13px] font-medium transition-colors duration-200 ease-lm ${isPublic ? "text-muted" : "bg-accent text-accent-text"}`}
            >
              {t.visibilityPrivate}
            </button>
          </div>
        </div>

        <label className={`${focusMode.sectionClass("anonymous")} flex items-center gap-2 text-[15px]`} aria-hidden={focusMode.isFocusMode}>
          <input
            type="checkbox"
            checked={anonymous}
            onChange={(event) => setAnonymous(event.target.checked)}
            className="h-4 w-4 accent-[var(--lm-accent)]"
          />
          {t.postAnonymously}
        </label>

        <div className="keyboard-form-footer">
          {focusMode.isFocusMode ? (
            <button
              type="button"
              className="w-full rounded bg-accent py-3 text-[15px] font-semibold text-accent-text transition-transform duration-150 ease-lm active:scale-[0.98]"
              onClick={focusMode.clearFocus}
            >
              {t.done}
            </button>
          ) : (
            <>
              <button
                onClick={publish}
                disabled={!canPublish}
                className="w-full rounded bg-accent py-3 text-[15px] font-semibold text-accent-text transition-transform duration-150 ease-lm active:scale-[0.98] disabled:opacity-50"
              >
                {createStory.isPending ? t.publishing : t.publish}
              </button>
              {createStory.isPending && photos.length > 0 && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface" aria-label={`${Math.round(uploadProgress * 100)}%`}>
                  <div className="h-full bg-accent transition-[width] duration-200 ease-lm" style={{ width: `${Math.round(uploadProgress * 100)}%` }} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
