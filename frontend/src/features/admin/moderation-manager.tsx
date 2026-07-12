"use client";

import { Check, ChevronRight, Image as ImageIcon, MapPin, ShieldCheck, X } from "lucide-react";
import { useState } from "react";

import { useModerate, useModerationQueue } from "@/features/admin/hooks";
import type { ModerationQueueItem } from "@/features/admin/api";
import { useTelegramAuth } from "@/features/auth/hooks";
import { useCategories } from "@/features/stories/hooks";
import { useDict } from "@/lib/i18n/use-dict";

export function ModerationManager() {
  const t = useDict();
  const { status, user } = useTelegramAuth();
  const { data: categories = [] } = useCategories();
  // hold the queue fetch until auth completes, otherwise the request races the
  // token exchange and 401s ("Not authenticated") on a cold page load
  const { items, loading, error, loadMore, hasMore, initialized } = useModerationQueue(
    status === "authenticated" && !!user?.is_admin,
  );
  // once a story is approved/rejected, hide it from the list immediately
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const { approve, reject } = useModerate((id) =>
    setResolved((prev) => new Set(prev).add(id)),
  );

  if (status === "loading") return <p className="py-10 text-center text-[13px] text-muted">{t.loading}</p>;
  if (status === "signed-out") return <p className="py-10 text-center text-[13px] text-muted">{t.openInTelegram}</p>;
  if (user && !user.is_admin) return <p className="py-10 text-center text-[13px] text-muted">{t.adminOnly}</p>;

  const visible = items.filter((item) => !resolved.has(item.id));

  return (
    <div className="mx-auto max-w-2xl">
      {error && <div className="mt-2 text-center text-[13px] text-[#E5484D]">{error}</div>}

      {initialized && !loading && visible.length === 0 && !error && (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <Check size={24} className="text-muted" />
          <span className="text-[13px] text-muted">{t.queueEmpty}</span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {visible.map((item) => (
          <ModerationCard
            key={item.id}
            item={item}
            categoryName={categories.find((c) => c.id === item.category_id)?.slug ?? ""}
            onApprove={() => approve.mutate(item.id)}
            onReject={(reason) => reject.mutate({ storyId: item.id, reason })}
            busy={approve.isPending || reject.isPending}
          />
        ))}
      </div>

      {hasMore && visible.length > 0 && (
        <button
          onClick={loadMore}
          disabled={loading}
          className="mt-6 w-full rounded border border-border py-2 text-[13px] font-medium text-muted disabled:opacity-50"
        >
          {t.loadMore}
        </button>
      )}
    </div>
  );
}

interface CardProps {
  item: ModerationQueueItem;
  categoryName: string;
  onApprove: () => void;
  onReject: (reason: string | null) => void;
  busy: boolean;
}

function ModerationCard({ item, categoryName, onApprove, onReject, busy }: CardProps) {
  const t = useDict();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  const authorName = item.is_anonymous
    ? `${t.anonymous} · #${item.author?.id ?? "?"}`
    : (item.author?.username ?? item.author?.first_name ?? `#${item.author?.id ?? "?"}`);

  return (
    <article className="overflow-hidden rounded-sheet border border-border bg-bg">
      <div className="flex items-center justify-between border-b border-border px-4 py-3 text-[12px] text-muted">
        <span className="flex items-center gap-1.5 font-medium text-text"><ShieldCheck size={14} className="text-accent" /> {categoryName}</span>
        <span>{new Date(item.created_at).toLocaleString()}</span>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold">{item.title}</h2>
            <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-muted">{item.body}</p>
          </div>
          <ChevronRight size={18} className="mt-1 shrink-0 text-muted" />
        </div>

        {item.photos.length > 0 ? (
          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {item.photos.map((photo) => (
              <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="group relative h-28 w-28 shrink-0 overflow-hidden rounded border border-border bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.thumb_url ?? photo.url} alt="" className="h-full w-full object-cover transition-transform duration-200 ease-lm group-hover:scale-105" />
                <span className="absolute bottom-1 right-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">{photo.width && photo.height ? `${photo.width}×${photo.height}` : <ImageIcon size={11} />}</span>
              </a>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-1.5 text-[12px] text-muted"><ImageIcon size={14} /> {t.noPhotos}</div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
          <span>{authorName}</span>
          <span className="flex items-center gap-1"><MapPin size={12} /> {item.lat.toFixed(4)}, {item.lon.toFixed(4)}</span>
        </div>

        {rejecting ? (
          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t.rejectReasonPlaceholder}
            rows={2}
            maxLength={500}
            className="w-full rounded border border-border bg-bg p-2 text-[14px]"
          />
          <div className="flex gap-2">
            <button
              onClick={() => onReject(reason.trim() || null)}
              disabled={busy}
              className="flex-1 rounded bg-[#E5484D] py-2 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {t.reject}
            </button>
            <button
              onClick={() => setRejecting(false)}
              className="flex-1 rounded border border-border py-2 text-[13px] font-medium text-muted"
            >
              {t.cancel}
            </button>
          </div>
        </div>
        ) : (
          <div className="mt-4 flex gap-2 border-t border-border pt-4">
          <button
            onClick={onApprove}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded bg-accent py-2 text-[13px] font-medium text-accent-text disabled:opacity-50"
          >
            <Check size={16} /> {t.approve}
          </button>
          <button
            onClick={() => setRejecting(true)}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-1.5 rounded border border-border py-2 text-[13px] font-medium text-[#E5484D] disabled:opacity-50"
          >
            <X size={16} /> {t.reject}
          </button>
        </div>
        )}
      </div>
    </article>
  );
}
