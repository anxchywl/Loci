"use client";

import { AlertTriangle, ChevronLeft, ChevronRight, EyeOff, Flag, Search, Trash2, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import { useReportedStories, useReportedStory, useResolveReports } from "@/features/admin/hooks";
import type { ReportDetail, ReportedStoryItem, ResolutionAction } from "@/features/admin/api";
import { useDict } from "@/lib/i18n/use-dict";

const PAGE = 25;

const FILTERS = ["all", "pending", "hidden", "visible", "resolved"] as const;
const SORTS = ["reports", "newest", "hidden"] as const;

export function ReportedManager({ onOpenAuthor }: { onOpenAuthor?: (userId: number) => void }) {
  const t = useDict();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const [sort, setSort] = useState<string>("reports");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(query.trim().replace(/\s+/g, " ").slice(0, 100));
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const { data, isLoading } = useReportedStories({ q: debounced, filter, sort, limit: PAGE, offset });

  const filterLabel = (value: string) =>
    ({ all: t.reportFilterAll, pending: t.reportFilterPending, hidden: t.reportFilterHidden, visible: t.reportFilterVisible, resolved: t.reportFilterResolved }[value] ?? value);
  const sortLabel = (value: string) =>
    ({ reports: t.reportSortReports, newest: t.reportSortNewest, hidden: t.reportSortHidden }[value] ?? value);

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded border border-border bg-surface px-3 py-2 focus-within:border-accent">
            <Search size={16} className="shrink-0 text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value.replace(/^\s+/, "").slice(0, 100))} placeholder={t.reportSearch} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted" />
          </label>
          <select value={filter} onChange={(e) => { setFilter(e.target.value); setOffset(0); }} className="appearance-none rounded border border-border bg-surface px-3 py-2 text-[14px]">
            {FILTERS.map((f) => <option key={f} value={f}>{filterLabel(f)}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="appearance-none rounded border border-border bg-surface px-3 py-2 text-[14px]">
            {SORTS.map((s) => <option key={s} value={s}>{sortLabel(s)}</option>)}
          </select>
        </div>

        {isLoading ? (
          <p className="py-10 text-center text-[13px] text-muted">{t.loading}</p>
        ) : data?.items.length ? (
          <div className="mt-4 flex flex-col gap-3">
            {data.items.map((item) => (
              <ReportedRow key={item.id} item={item} active={selected === item.id} onClick={() => setSelected(item.id)} />
            ))}
          </div>
        ) : (
          <p className="py-10 text-center text-[13px] text-muted">{t.reportEmpty}</p>
        )}

        {data && data.total > PAGE && (
          <div className="mt-4 flex items-center justify-between">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} className="flex items-center gap-1 rounded border border-border px-3 py-2 text-[13px] disabled:opacity-40"><ChevronLeft size={16} />{t.adminPrevious}</button>
            <span className="text-[13px] text-muted">{offset + 1}–{Math.min(offset + PAGE, data.total)} / {data.total}</span>
            <button disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)} className="flex items-center gap-1 rounded border border-border px-3 py-2 text-[13px] disabled:opacity-40">{t.adminNext}<ChevronRight size={16} /></button>
          </div>
        )}
      </div>

      {selected !== null && <ReportedDetail storyId={selected} onClose={() => setSelected(null)} onOpenAuthor={onOpenAuthor} />}
    </section>
  );
}

function StatusBadge({ item }: { item: ReportedStoryItem }) {
  const t = useDict();
  if (item.auto_hidden_at) return <span className="flex items-center gap-1 rounded bg-[#E5484D]/10 px-1.5 py-0.5 text-[11px] font-medium text-[#E5484D]"><EyeOff size={11} />{t.reportAutoHidden}</span>;
  if (item.is_hidden) return <span className="flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-[11px] font-medium text-muted"><EyeOff size={11} />{t.reportHidden}</span>;
  return <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-medium text-muted">{t.reportVisible}</span>;
}

function ReportedRow({ item, active, onClick }: { item: ReportedStoryItem; active: boolean; onClick: () => void }) {
  const t = useDict();
  return (
    <button onClick={onClick} className={`w-full rounded-sheet border border-border p-3 text-left transition-colors hover:bg-surface ${active ? "border-accent bg-surface" : ""}`}>
      <div className="flex items-start gap-3">
        {item.photos[0]?.thumb_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={item.photos[0].thumb_url} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{item.title}</span>
            <StatusBadge item={item} />
          </div>
          <p className="mt-0.5 line-clamp-1 text-[12px] text-muted">{item.body}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
            <span className="flex items-center gap-1 font-medium text-[#E5484D]"><Flag size={12} />{item.report_count} / {item.report_threshold}</span>
            <span>{item.reporter_count} {t.reportReporters}</span>
            {item.pending_count > 0 && <span>{item.pending_count} {t.reportStatusPending}</span>}
            <span>{item.author ? (item.author.username ?? item.author.first_name ?? `#${item.author.id}`) : t.anonymous}</span>
            {item.latest_report_at && <span>{new Date(item.latest_report_at).toLocaleDateString()}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

const ACTIONS: ResolutionAction[] = ["restore", "keep_hidden", "delete", "ignore"];

function ReportedDetail({ storyId, onClose, onOpenAuthor }: { storyId: string; onClose: () => void; onOpenAuthor?: (userId: number) => void }) {
  const t = useDict();
  const { data, isLoading } = useReportedStory(storyId);
  const resolve = useResolveReports();
  const [pending, setPending] = useState<ResolutionAction | null>(null);
  const [reason, setReason] = useState("");

  if (isLoading || !data) return <aside className="rounded-sheet border border-border p-4 text-[13px] text-muted">{t.loading}</aside>;
  const { story, reports } = data;

  const actionLabel = (a: ResolutionAction) => ({ restore: t.reportActionRestore, keep_hidden: t.reportActionKeepHidden, delete: t.reportActionDelete, ignore: t.reportActionIgnore }[a]);
  const confirmText = (a: ResolutionAction) => ({ restore: t.reportConfirmRestore, keep_hidden: t.reportConfirmKeepHidden, delete: t.reportConfirmDelete, ignore: t.reportConfirmIgnore }[a]);

  const submit = async () => {
    if (!pending) return;
    await resolve.mutateAsync({ storyId, action: pending, reason: reason.trim() || undefined });
    setPending(null);
    setReason("");
    if (pending === "delete") onClose();
  };

  return (
    <aside className="rounded-sheet border border-border p-4 lg:sticky lg:top-4 lg:self-start">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold">{story.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
            <StatusBadge item={story} />
            <span className="flex items-center gap-1 font-medium text-[#E5484D]"><Flag size={12} />{story.report_count} / {story.report_threshold}</span>
          </div>
        </div>
        <button onClick={onClose} aria-label={t.cancel} className="shrink-0 text-muted">×</button>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{story.body}</p>

      {story.photos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {story.photos.map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="h-20 w-20 shrink-0 overflow-hidden rounded border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb_url ?? p.url} alt="" className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <span>{story.author ? (story.author.username ?? story.author.first_name ?? `#${story.author.id}`) : t.anonymous}</span>
        {story.author && onOpenAuthor && (
          <button onClick={() => onOpenAuthor(story.author!.id)} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[12px] hover:bg-surface"><UserRound size={12} />{t.reportOpenAuthor}</button>
        )}
      </div>

      {/* actions */}
      {pending ? (
        <div className="mt-4 rounded border border-border p-3">
          <p className={`flex items-center gap-1.5 text-[13px] font-semibold ${pending === "delete" ? "text-[#E5484D]" : ""}`}>
            {pending === "delete" && <AlertTriangle size={14} />}{confirmText(pending)}
          </p>
          <textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 500))} placeholder={t.adminReasonPlaceholder} className="mt-2 min-h-16 w-full rounded border border-border bg-bg p-2 text-[13px]" />
          <div className="mt-2 flex gap-2">
            <button onClick={() => { setPending(null); setReason(""); }} className="flex-1 rounded border border-border py-2 text-[13px]">{t.cancel}</button>
            <button onClick={() => void submit()} disabled={resolve.isPending} className={`flex-1 rounded py-2 text-[13px] font-medium text-white disabled:opacity-50 ${pending === "delete" ? "bg-[#E5484D]" : "bg-accent text-accent-text"}`}>{t.confirm}</button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          {ACTIONS.map((a) => (
            <button key={a} onClick={() => setPending(a)} className={`flex items-center justify-center gap-1.5 rounded border border-border py-2 text-[13px] font-medium ${a === "delete" ? "text-[#E5484D]" : ""}`}>
              {a === "delete" && <Trash2 size={14} />}{actionLabel(a)}
            </button>
          ))}
        </div>
      )}

      {/* report timeline */}
      <h3 className="mt-6 text-[14px] font-semibold">{t.reportTimeline}</h3>
      <div className="mt-2 space-y-2">
        {reports.map((r) => <ReportEntry key={r.id} report={r} />)}
      </div>
    </aside>
  );
}

function ReportEntry({ report }: { report: ReportDetail }) {
  const t = useDict();
  const statusLabel = { pending: t.reportStatusPending, reviewed: t.reportStatusReviewed, resolved: t.reportStatusResolved }[report.status];
  const reporterName = report.reporter.username ?? report.reporter.first_name ?? (report.reporter.id ? `#${report.reporter.id}` : t.anonymous);
  return (
    <div className="rounded border border-border p-2 text-[12px]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{reporterName}</span>
        <span className={report.status === "resolved" ? "text-muted" : "text-[#E5484D]"}>{statusLabel}</span>
      </div>
      <p className="mt-1 text-muted">{report.reason || t.reportNoReason}</p>
      <div className="mt-1 text-[11px] text-muted">
        {new Date(report.created_at).toLocaleString()}
        {report.resolution_action && ` · ${report.resolution_action}`}
      </div>
    </div>
  );
}
