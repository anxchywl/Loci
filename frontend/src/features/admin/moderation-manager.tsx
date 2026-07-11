"use client";

import { ArrowLeft, Check, MapPin, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
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
  const { items, loading, error, loadMore, hasMore } = useModerationQueue();
  // once a story is approved/rejected, hide it from the list immediately
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const { approve, reject } = useModerate((id) =>
    setResolved((prev) => new Set(prev).add(id)),
  );

  if (status === "authenticated" && user && !user.is_admin) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg px-6 text-center">
        <span className="text-[15px] text-muted">{t.adminOnly}</span>
      </main>
    );
  }

  const visible = items.filter((item) => !resolved.has(item.id));

  return (
    <main className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-lg px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <Link href="/profile" aria-label={t.profile} className="rounded p-1.5 text-muted">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="flex items-center gap-2 text-[20px] font-semibold">
            <ShieldCheck size={20} className="text-accent" /> {t.moderation}
          </h1>
        </div>

        {error && <div className="mt-6 text-center text-[13px] text-[#E5484D]">{error}</div>}

        {!loading && visible.length === 0 && !error && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Check size={24} className="text-muted" />
            <span className="text-[13px] text-muted">{t.queueEmpty}</span>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-4">
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
    </main>
  );
}

interface CardProps {
  item: ModerationQueueItem;
  categoryName: string;
  onApprove: () => void;
  onReject: (reason: string) => void;
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
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between text-[12px] text-muted">
        <span className="rounded-full bg-surface px-2 py-0.5">{categoryName}</span>
        <span>{new Date(item.created_at).toLocaleString()}</span>
      </div>

      <h2 className="mt-2 text-[16px] font-semibold">{item.title}</h2>
      <p className="mt-1 whitespace-pre-wrap text-[14px] text-muted">{item.body}</p>

      {item.photos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {item.photos.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={photo.id}
              src={photo.thumb_url ?? photo.url}
              alt=""
              className="h-20 w-20 shrink-0 rounded object-cover"
            />
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 text-[12px] text-muted">
        <span>{authorName}</span>
        <span className="flex items-center gap-1">
          <MapPin size={12} /> {item.lat.toFixed(4)}, {item.lon.toFixed(4)}
        </span>
      </div>

      {rejecting ? (
        <div className="mt-3 flex flex-col gap-2">
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
              onClick={() => onReject(reason.trim())}
              disabled={busy || reason.trim().length === 0}
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
        <div className="mt-4 flex gap-2">
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
  );
}
