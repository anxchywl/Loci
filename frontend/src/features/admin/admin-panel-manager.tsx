"use client";

import { ArrowLeft, Ban, ChevronLeft, ChevronRight, Flag, Search, ShieldCheck, Trash2, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ModerationManager } from "@/features/admin/moderation-manager";
import { ReportedManager } from "@/features/admin/reported-manager";
import { useAdminAuditLogs, useAdminDashboard, useAdminStoryDeletion, useAdminUser, useAdminUserAction, useAdminUserDeletion, useAdminUserStories, useAdminUsers } from "@/features/admin/hooks";
import { useTelegramAuth } from "@/features/auth/hooks";
import { useDict } from "@/lib/i18n/use-dict";

type Tab = "dashboard" | "moderation" | "reported" | "users" | "audit";

export function AdminPanelManager() {
  const t = useDict();
  const { status, user } = useTelegramAuth();
  const [tab, setTab] = useState<Tab>("dashboard");
  // set when "Open author" is used from the Reported tab, consumed by UsersTab
  const [focusUserId, setFocusUserId] = useState<number | null>(null);

  if (status === "loading") return <State text={t.loading} />;
  if (status === "signed-out") return <State text={t.openInTelegram} />;
  if (!user?.is_admin) return <State text={t.adminOnly} />;

  const openAuthor = (userId: number) => {
    setFocusUserId(userId);
    setTab("users");
  };

  return (
    <main className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-3">
          <Link href="/" aria-label={t.exploreMap} className="rounded p-1.5 text-muted"><ArrowLeft size={20} /></Link>
          <ShieldCheck size={20} className="text-accent" />
          <h1 className="text-[20px] font-semibold">{t.moderation}</h1>
        </header>
        <nav className="mt-5 flex gap-1 overflow-x-auto rounded-sheet border border-border bg-surface p-1">
          {(["dashboard", "moderation", "reported", "users", "audit"] as Tab[]).map((value) => (
            <button key={value} onClick={() => setTab(value)} className={`shrink-0 rounded px-3 py-2 text-[14px] font-medium transition-colors ${tab === value ? "bg-accent text-accent-text" : "text-muted hover:text-text"}`}>
              {value === "dashboard" ? t.adminDashboard : value === "moderation" ? t.moderation : value === "reported" ? t.reportTab : value === "users" ? t.adminUsers : t.adminAuditLogs}
            </button>
          ))}
        </nav>
        <div className="mt-5">
          {tab === "dashboard" && <DashboardTab />}
          {tab === "moderation" && <ModerationManager />}
          {tab === "reported" && <ReportedManager onOpenAuthor={openAuthor} />}
          {tab === "users" && <UsersTab initialUserId={focusUserId} onConsumeInitial={() => setFocusUserId(null)} />}
          {tab === "audit" && <AuditTab />}
        </div>
      </div>
    </main>
  );
}

function State({ text }: { text: string }) {
  return <main className="flex min-h-dvh items-center justify-center bg-bg px-6 text-center text-[15px] text-muted">{text}</main>;
}

function DashboardTab() {
  const t = useDict();
  const [range, setRange] = useState<"today" | "7" | "30" | "custom">("30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const to = new Date();
  const from = new Date(to);
  from.setUTCDate(to.getUTCDate() - (range === "today" ? 0 : range === "7" ? 6 : 29));
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const { data, isLoading, error } = useAdminDashboard(range === "custom" ? customFrom : iso(from), range === "custom" ? customTo : iso(to));
  if (isLoading) return <State text={t.loading} />;
  if (error || !data) return <State text={t.errorGeneric} />;
  const cards = [[t.adminTotalUsers, data.total_users], [t.adminActiveUsers, data.active_users], [t.adminNewUsers, data.new_users], [t.adminPendingModeration, data.pending_moderation], [t.adminApprovedStories, data.approved_stories], [t.adminRejectedStories, data.rejected_stories], [t.adminPublishedStories, data.published_stories]] as const;
  const todayIso = iso(to);
  return <section>
    <div className="flex flex-wrap gap-2">
      {([["today", t.adminToday], ["7", t.adminLast7Days], ["30", t.adminLast30Days], ["custom", t.adminCustom]] as const).map(([value, label]) => <button key={value} onClick={() => setRange(value)} className={`rounded-full border px-4 py-1.5 text-[13px] transition-colors ${range === value ? "border-accent bg-accent text-accent-text font-medium" : "border-border text-muted hover:text-text"}`}>{label}</button>)}
    </div>
    {range === "custom" && <div className="mt-3 flex flex-wrap items-end gap-3 rounded-sheet border border-border bg-surface p-3">
      <label className="flex flex-col gap-1 text-[12px] font-medium text-muted">{t.adminFrom}<input type="date" value={customFrom} max={customTo || todayIso} onChange={(event) => setCustomFrom(event.target.value)} className="rounded border border-border bg-bg px-3 py-2 text-[13px] text-text [color-scheme:light] dark:[color-scheme:dark]" /></label>
      <label className="flex flex-col gap-1 text-[12px] font-medium text-muted">{t.adminTo}<input type="date" value={customTo} min={customFrom} max={todayIso} onChange={(event) => setCustomTo(event.target.value)} className="rounded border border-border bg-bg px-3 py-2 text-[13px] text-text [color-scheme:light] dark:[color-scheme:dark]" /></label>
    </div>}
    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-sheet border border-border p-4"><div className="text-[24px] font-semibold">{value}</div><div className="mt-1 text-[13px] text-muted">{label}</div></div>)}</div>
    <h2 className="mt-8 text-[15px] font-semibold">{t.reportAnalytics}</h2>
    <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">{
      ([[t.reportPending, data.pending_reports], [t.reportAutoHiddenCount, data.auto_hidden_stories], [t.reportResolved, data.resolved_reports], [t.reportDeleted, data.deleted_after_reports], [t.reportRestored, data.restored_after_review], [t.reportAvgReview, data.avg_review_seconds != null ? formatDuration(data.avg_review_seconds) : "—"]] as const)
        .map(([label, value]) => <div key={label} className="rounded-sheet border border-border p-4"><div className="text-[24px] font-semibold">{value}</div><div className="mt-1 text-[13px] text-muted">{label}</div></div>)
    }</div>
  </section>;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

function UsersTab({ initialUserId, onConsumeInitial }: { initialUserId?: number | null; onConsumeInitial?: () => void } = {}) {
  const t = useDict();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  // when navigated here via "Open author", pre-open that user's panel once
  useEffect(() => { if (initialUserId != null) { setSelected(initialUserId); onConsumeInitial?.(); } }, [initialUserId, onConsumeInitial]);
  useEffect(() => { const timer = window.setTimeout(() => { setDebounced(query.trim()); setOffset(0); }, 300); return () => window.clearTimeout(timer); }, [query]);
  const { data, isLoading } = useAdminUsers({ q: debounced, status, sortBy, sortOrder: "desc", limit: 25, offset });
  return <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
    <div>
      <div className="flex flex-col gap-2 sm:flex-row"><label className="flex min-w-0 flex-1 items-center gap-2 rounded border border-border bg-surface px-3 py-2 focus-within:border-accent"><Search size={16} className="shrink-0 text-muted" /><input value={query} onChange={(event) => setQuery(event.target.value.replace(/^\s+/, "").slice(0, 100))} placeholder={t.adminSearchUsers} className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted" /></label><select value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }} className="appearance-none rounded border border-border bg-surface px-3 py-2 text-[14px]"><option value="">{t.adminStatus}</option><option value="active">{t.adminActive}</option><option value="blocked">{t.adminBlocked}</option><option value="deleted">{t.adminDeleted}</option></select><select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="appearance-none rounded border border-border bg-surface px-3 py-2 text-[14px]"><option value="created_at">{t.adminCreated}</option><option value="last_active_at">{t.adminLastActive}</option><option value="uid">{t.adminUid}</option><option value="telegram_id">{t.adminTelegramId}</option></select></div>
      {isLoading ? <p className="py-10 text-center text-[13px] text-muted">{t.loading}</p> : data?.items.length ? <div className="mt-4 divide-y divide-border rounded-sheet border border-border">{data.items.map((item) => <button key={item.id} onClick={() => setSelected(item.id)} className={`flex w-full items-start gap-3 p-3 text-left hover:bg-surface ${selected === item.id ? "bg-surface" : ""}`}><div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-white">{item.photo_url ? <img src={item.photo_url} alt="" className="h-full w-full object-cover" /> : <UserRound size={18} />}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2 text-[15px] font-semibold"><span>{item.display_name}</span><span className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-normal text-muted">{item.status}</span></div><div className="mt-1 text-[12px] text-muted">#{item.id} · tg:{item.telegram_id} · @{item.username ?? "—"}</div><div className="mt-1 text-[12px] text-muted">{item.stories_count} {t.storiesCount} · {item.warnings} {t.adminWarnings}</div></div></button>)}</div> : <p className="py-10 text-center text-[13px] text-muted">{t.adminNoUsers}</p>}
      {data && <div className="mt-4 flex items-center justify-between"><button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))} className="flex items-center gap-1 rounded border border-border px-3 py-2 text-[13px] disabled:opacity-40"><ChevronLeft size={16} />{t.adminPrevious}</button><span className="text-[13px] text-muted">{offset + 1}–{Math.min(offset + 25, data.total)} / {data.total}</span><button disabled={offset + 25 >= data.total} onClick={() => setOffset(offset + 25)} className="flex items-center gap-1 rounded border border-border px-3 py-2 text-[13px] disabled:opacity-40">{t.adminNext}<ChevronRight size={16} /></button></div>}
    </div>
    {selected !== null && <UserPanel userId={selected} onClose={() => setSelected(null)} />}
  </section>;
}

function UserPanel({ userId, onClose }: { userId: number; onClose: () => void }) {
  const t = useDict();
  const { data: user, isLoading } = useAdminUser(userId);
  const { data: stories = [] } = useAdminUserStories(userId);
  const action = useAdminUserAction();
  const deletion = useAdminUserDeletion();
  const storyDeletion = useAdminStoryDeletion();
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState<"block" | "unblock" | "warning" | "delete" | "restore" | null>(null);
  const [storyReason, setStoryReason] = useState("");
  if (isLoading || !user) return <aside className="rounded-sheet border border-border p-4 text-[13px] text-muted">{t.loading}</aside>;
  const submit = async () => { if (!reason.trim() || !confirm) return; if (confirm === "delete" || confirm === "restore") await deletion.mutateAsync({ userId, deleted: confirm === "delete", reason: reason.trim() }); else await action.mutateAsync({ userId, action: confirm, reason: reason.trim() }); setConfirm(null); setReason(""); };
  return <aside className="rounded-sheet border border-border p-4 lg:sticky lg:top-4 lg:self-start"><div className="flex items-start justify-between"><div><h2 className="text-[17px] font-semibold">{user.display_name}</h2><p className="text-[13px] text-muted">#{user.id} · tg:{user.telegram_id}</p></div><button onClick={onClose} aria-label={t.cancel} className="text-muted">×</button></div><div className="mt-4 grid grid-cols-2 gap-2 text-[12px]">{[[t.storiesCount, user.stories_count], [t.adminApprovedStories, user.approved_stories], [t.statusPending, user.pending_stories], [t.adminRejectedStories, user.rejected_stories], [t.adminSaved, user.saved_stories_count], [t.adminReports, user.reports_received], [t.adminWarnings, user.warnings]].map(([label, value]) => <div key={String(label)} className="rounded border border-border p-2"><div className="font-semibold">{value}</div><div className="text-muted">{label}</div></div>)}</div><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => setConfirm(user.status === "blocked" ? "unblock" : "block")} className="flex items-center gap-1 rounded border border-border px-3 py-2 text-[13px] text-[#E5484D]"><Ban size={15} />{user.status === "blocked" ? t.adminUnblock : t.adminBlock}</button><button onClick={() => setConfirm("warning")} className="rounded border border-border px-3 py-2 text-[13px]">{t.adminWarning}</button><button onClick={() => setConfirm(user.status === "deleted" ? "restore" : "delete")} className="rounded border border-border px-3 py-2 text-[13px]">{user.status === "deleted" ? t.adminRestoreAccount : t.adminDeleteAccount}</button></div>{confirm && <div className="mt-3 rounded border border-border p-3"><p className="text-[13px] font-semibold">{confirm === "block" ? t.adminBlock : confirm === "unblock" ? t.adminUnblock : confirm === "warning" ? t.adminWarning : confirm === "delete" ? t.adminDeleteAccount : t.adminRestoreAccount}</p><textarea value={reason} onChange={(event) => setReason(event.target.value.slice(0, 500))} placeholder={t.adminReasonPlaceholder} className="mt-2 min-h-20 w-full rounded border border-border bg-bg p-2 text-[13px]" /><div className="mt-2 flex gap-2"><button onClick={() => setConfirm(null)} className="flex-1 rounded border border-border py-2 text-[13px]">{t.cancel}</button><button onClick={() => void submit()} disabled={!reason.trim() || action.isPending || deletion.isPending} className="flex-1 rounded bg-accent py-2 text-[13px] text-accent-text disabled:opacity-50">{t.confirm}</button></div></div>}<h3 className="mt-6 text-[15px] font-semibold">{t.adminHistory}</h3>{user.moderation_history.length ? <div className="mt-2 space-y-2">{user.moderation_history.map((entry) => <div key={entry.id} className="rounded border border-border p-2 text-[12px]"><div className="font-semibold">{entry.action}</div><div>{entry.reason}</div><div className="text-muted">{entry.created_at}</div></div>)}</div> : <p className="mt-2 text-[13px] text-muted">{t.adminNoAuditLogs}</p>}<h3 className="mt-6 text-[15px] font-semibold">{t.adminUsers}: {t.storiesCount}</h3>{stories.map((story) => <div key={story.id} className="mt-2 flex items-center justify-between gap-2 rounded border border-border p-2 text-[12px]"><span className="min-w-0 flex-1 truncate">{story.title} · {story.moderation_status}</span>{story.report_count > 0 && <span className="flex shrink-0 items-center gap-1 rounded bg-[#E5484D]/10 px-1.5 py-0.5 font-medium text-[#E5484D]"><Flag size={11} />{story.report_count} {t.adminStoryReports}</span>}<button onClick={() => { const next = window.prompt(t.adminReasonPlaceholder); if (next?.trim()) void storyDeletion.mutateAsync({ storyId: story.id, reason: next.trim() }); }} aria-label={t.deleteStory} className="shrink-0 text-[#E5484D]"><Trash2 size={15} /></button></div>)}</aside>;
}

function AuditTab() {
  const t = useDict();
  const { data, isLoading } = useAdminAuditLogs();
  if (isLoading) return <State text={t.loading} />;
  if (!data?.items.length) return <State text={t.adminNoAuditLogs} />;
  return <section className="divide-y divide-border rounded-sheet border border-border">{data.items.map((log) => <div key={log.id} className="p-3 text-[13px]"><div className="flex justify-between gap-3"><span className="font-semibold">{log.action}</span><span className="text-muted">{log.created_at}</span></div><div className="mt-1 text-muted">admin #{log.admin_id}{log.target_user_id ? ` · user #${log.target_user_id}` : ""}{log.reason ? ` · ${log.reason}` : ""}</div></div>)}</section>;
}
