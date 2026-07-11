"use client";

import { ArrowLeft, Ban, Check, ChevronLeft, ChevronRight, ShieldCheck, Trash2, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ModerationManager } from "@/features/admin/moderation-manager";
import { useAdminAuditLogs, useAdminDashboard, useAdminStoryDeletion, useAdminUser, useAdminUserAction, useAdminUserDeletion, useAdminUserStories, useAdminUsers } from "@/features/admin/hooks";
import { useTelegramAuth } from "@/features/auth/hooks";
import { useDict } from "@/lib/i18n/use-dict";

type Tab = "dashboard" | "moderation" | "users" | "audit";

export function AdminPanelManager() {
  const t = useDict();
  const { status, user } = useTelegramAuth();
  const [tab, setTab] = useState<Tab>("dashboard");

  if (status === "loading") return <State text={t.loading} />;
  if (status === "signed-out") return <State text={t.openInTelegram} />;
  if (!user?.is_admin) return <State text={t.adminOnly} />;

  return (
    <main className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-6xl px-4 pb-10 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-3">
          <Link href="/profile" aria-label={t.profile} className="rounded p-1.5 text-muted"><ArrowLeft size={20} /></Link>
          <ShieldCheck size={20} className="text-accent" />
          <h1 className="text-[20px] font-semibold">{t.moderation}</h1>
        </header>
        <nav className="mt-5 flex gap-2 overflow-x-auto border-b border-border pb-2">
          {(["dashboard", "moderation", "users", "audit"] as Tab[]).map((value) => (
            <button key={value} onClick={() => setTab(value)} className={`shrink-0 rounded px-3 py-2 text-[14px] font-medium transition-colors ${tab === value ? "bg-accent text-accent-text" : "text-muted hover:text-text"}`}>
              {value === "dashboard" ? t.adminDashboard : value === "moderation" ? t.moderation : value === "users" ? t.adminUsers : t.adminAuditLogs}
            </button>
          ))}
        </nav>
        <div className="mt-5">
          {tab === "dashboard" && <DashboardTab />}
          {tab === "moderation" && <ModerationManager />}
          {tab === "users" && <UsersTab />}
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
  return <section>
    <div className="flex gap-2 overflow-x-auto">
      {([["today", t.adminToday], ["7", t.adminLast7Days], ["30", t.adminLast30Days], ["custom", t.adminCustom]] as const).map(([value, label]) => <button key={value} onClick={() => setRange(value)} className={`rounded border border-border px-3 py-2 text-[13px] ${range === value ? "bg-surface font-semibold" : "text-muted"}`}>{label}</button>)}
      {range === "custom" && <div className="flex gap-2"><input type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="rounded border border-border bg-bg px-2 py-2 text-[13px]" /><input type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="rounded border border-border bg-bg px-2 py-2 text-[13px]" /></div>}
    </div>
    <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-sheet border border-border p-4"><div className="text-[24px] font-semibold">{value}</div><div className="mt-1 text-[13px] text-muted">{label}</div></div>)}</div>
    <h2 className="mt-8 text-[17px] font-semibold">{t.adminRecentActions}</h2>
    {data.recent_actions.length === 0 ? <p className="mt-3 text-[13px] text-muted">{t.adminNoAuditLogs}</p> : <div className="mt-3 divide-y divide-border rounded-sheet border border-border">{data.recent_actions.map((action) => <div key={String(action.id)} className="flex items-center justify-between gap-3 p-3 text-[13px]"><span>{String(action.action)}</span><span className="text-muted">{String(action.created_at)}</span></div>)}</div>}
  </section>;
}

function UsersTab() {
  const t = useDict();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => { const timer = window.setTimeout(() => { setDebounced(query.trim()); setOffset(0); }, 300); return () => window.clearTimeout(timer); }, [query]);
  const { data, isLoading } = useAdminUsers({ q: debounced, status, sortBy, sortOrder: "desc", limit: 25, offset });
  return <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
    <div>
      <div className="flex flex-col gap-2 sm:flex-row"><input value={query} onChange={(event) => setQuery(event.target.value.slice(0, 100))} placeholder={t.adminSearchUsers} className="min-w-0 flex-1 rounded border border-border bg-bg px-3 py-2 text-[14px]" /><select value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }} className="rounded border border-border bg-bg px-3 py-2 text-[14px]"><option value="">{t.adminStatus}</option><option value="active">{t.adminActive}</option><option value="blocked">{t.adminBlocked}</option><option value="deleted">{t.adminDeleted}</option></select><select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="rounded border border-border bg-bg px-3 py-2 text-[14px]"><option value="created_at">{t.adminCreated}</option><option value="last_active_at">{t.adminLastActive}</option><option value="uid">{t.adminUid}</option><option value="telegram_id">{t.adminTelegramId}</option></select></div>
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
  return <aside className="rounded-sheet border border-border p-4 lg:sticky lg:top-4 lg:self-start"><div className="flex items-start justify-between"><div><h2 className="text-[17px] font-semibold">{user.display_name}</h2><p className="text-[13px] text-muted">#{user.id} · tg:{user.telegram_id}</p></div><button onClick={onClose} aria-label={t.cancel} className="text-muted">×</button></div><div className="mt-4 grid grid-cols-2 gap-2 text-[12px]">{[[t.storiesCount, user.stories_count], [t.adminApprovedStories, user.approved_stories], [t.statusPending, user.pending_stories], [t.adminRejectedStories, user.rejected_stories], [t.adminSaved, user.saved_stories_count], [t.adminReports, user.reports_received], [t.adminWarnings, user.warnings]].map(([label, value]) => <div key={String(label)} className="rounded border border-border p-2"><div className="font-semibold">{value}</div><div className="text-muted">{label}</div></div>)}</div><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => setConfirm(user.status === "blocked" ? "unblock" : "block")} className="flex items-center gap-1 rounded border border-border px-3 py-2 text-[13px] text-[#E5484D]"><Ban size={15} />{user.status === "blocked" ? t.adminUnblock : t.adminBlock}</button><button onClick={() => setConfirm("warning")} className="rounded border border-border px-3 py-2 text-[13px]">{t.adminWarning}</button><button onClick={() => setConfirm(user.status === "deleted" ? "restore" : "delete")} className="rounded border border-border px-3 py-2 text-[13px]">{user.status === "deleted" ? t.adminRestoreAccount : t.adminDeleteAccount}</button></div>{confirm && <div className="mt-3 rounded border border-border p-3"><p className="text-[13px] font-semibold">{confirm === "block" ? t.adminBlock : confirm === "unblock" ? t.adminUnblock : confirm === "warning" ? t.adminWarning : confirm === "delete" ? t.adminDeleteAccount : t.adminRestoreAccount}</p><textarea value={reason} onChange={(event) => setReason(event.target.value.slice(0, 500))} placeholder={t.adminReasonPlaceholder} className="mt-2 min-h-20 w-full rounded border border-border bg-bg p-2 text-[13px]" /><div className="mt-2 flex gap-2"><button onClick={() => setConfirm(null)} className="flex-1 rounded border border-border py-2 text-[13px]">{t.cancel}</button><button onClick={() => void submit()} disabled={!reason.trim() || action.isPending || deletion.isPending} className="flex-1 rounded bg-accent py-2 text-[13px] text-accent-text disabled:opacity-50">{t.confirm}</button></div></div>}<h3 className="mt-6 text-[15px] font-semibold">{t.adminSessions}</h3>{user.sessions.length ? <div className="mt-2 space-y-2">{user.sessions.map((session) => <div key={session.id} className="rounded border border-border p-2 text-[12px]"><div>{session.device_type} · {session.browser} · {session.operating_system}</div><div className="text-muted">{session.active ? t.adminActive : t.adminDeleted} · {session.last_used_at}</div></div>)}</div> : <p className="mt-2 text-[13px] text-muted">{t.adminNoSessions}</p>}<h3 className="mt-6 text-[15px] font-semibold">{t.adminHistory}</h3>{user.moderation_history.length ? <div className="mt-2 space-y-2">{user.moderation_history.map((entry) => <div key={entry.id} className="rounded border border-border p-2 text-[12px]"><div className="font-semibold">{entry.action}</div><div>{entry.reason}</div><div className="text-muted">{entry.created_at}</div></div>)}</div> : <p className="mt-2 text-[13px] text-muted">{t.adminNoAuditLogs}</p>}<h3 className="mt-6 text-[15px] font-semibold">{t.adminUsers}: {t.storiesCount}</h3>{stories.map((story) => <div key={story.id} className="mt-2 flex items-center justify-between gap-2 rounded border border-border p-2 text-[12px]"><span className="truncate">{story.title} · {story.moderation_status}</span><button onClick={() => { const next = window.prompt(t.adminReasonPlaceholder); if (next?.trim()) void storyDeletion.mutateAsync({ storyId: story.id, reason: next.trim() }); }} aria-label={t.deleteStory} className="text-[#E5484D]"><Trash2 size={15} /></button></div>)}</aside>;
}

function AuditTab() {
  const t = useDict();
  const { data, isLoading } = useAdminAuditLogs();
  if (isLoading) return <State text={t.loading} />;
  if (!data?.items.length) return <State text={t.adminNoAuditLogs} />;
  return <section className="divide-y divide-border rounded-sheet border border-border">{data.items.map((log) => <div key={log.id} className="p-3 text-[13px]"><div className="flex justify-between gap-3"><span className="font-semibold">{log.action}</span><span className="text-muted">{log.created_at}</span></div><div className="mt-1 text-muted">admin #{log.admin_id}{log.target_user_id ? ` · user #${log.target_user_id}` : ""}{log.reason ? ` · ${log.reason}` : ""}</div></div>)}</section>;
}
