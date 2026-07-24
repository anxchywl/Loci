"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, Monitor, Smartphone, Tablet, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useId, useState } from "react";

import {
  listIdentities,
  listSessions,
  fetchAuthProviders,
  eraseAccount,
  logout,
  revokeSession,
  startEmailLink,
  startGoogleLink,
  unlinkIdentity,
  verifyEmailLink,
  type IdentitySummary,
  type SessionSummary,
} from "@/features/auth/api";
import { SettingsRow, SettingsSection } from "@/components/settings-section";
import { ChangeNameButton } from "@/features/auth/editable-name";
import { signOutState } from "@/features/auth/hooks";
import { currentAuthRedirectTarget } from "@/features/auth/redirect";
import { ApiError } from "@/lib/api";
import type { AuthStrings } from "@/lib/i18n/dict";
import { useDict } from "@/lib/i18n/use-dict";
import { useAuthStore } from "@/stores/auth-store";
import { useUiStore } from "@/stores/ui-store";

const PROVIDERS: IdentitySummary["provider"][] = ["telegram", "google", "email"];
const ACCOUNT_ERASURE_PHRASE = "DELETE MY ACCOUNT";
const UNSAFE_CONFIRMATION_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function relativeTime(iso: string, locale: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();
  const format = (value: number, unit: Intl.RelativeTimeFormatUnit) =>
    new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-value, unit);
  if (elapsed < HOUR) return format(Math.max(1, Math.round(elapsed / MINUTE)), "minute");
  if (elapsed < DAY) return format(Math.round(elapsed / HOUR), "hour");
  if (elapsed < 30 * DAY) return format(Math.round(elapsed / DAY), "day");
  return format(Math.round(elapsed / (30 * DAY)), "month");
}

/** "Other" is the parser giving up — show nothing rather than a meaningless word. */
const known = (value: string | null | undefined) =>
  value && value !== "Other" ? value : null;

function deviceLines(session: SessionSummary, t: AuthStrings) {
  const deviceTypes: Record<string, string> = {
    mobile: t.devicePhone,
    tablet: t.deviceTablet,
    desktop: t.deviceComputer,
  };
  const device = session.device_model ?? deviceTypes[session.device_type ?? ""] ?? null;
  const os = [known(session.operating_system), session.os_version].filter(Boolean).join(" ");
  const browser = [known(session.browser), session.browser_version].filter(Boolean).join(" ");
  return {
    device: [device, os].filter(Boolean).join(" · ") || t.unknownDevice,
    client: [browser, session.in_app ? t.inAppBrowser : null].filter(Boolean).join(" · "),
  };
}

function SessionRow({
  session,
  onRevoke,
}: {
  session: SessionSummary;
  onRevoke: () => void;
}) {
  const t = useDict().auth;
  const locale = useUiStore((state) => state.locale);
  const { device, client } = deviceLines(session, t);
  const Icon =
    session.device_type === "mobile" ? Smartphone : session.device_type === "tablet" ? Tablet : Monitor;

  return (
    <SettingsRow>
      <Icon size={17} className="shrink-0 text-muted" />
      <div className="min-w-0">
        <div className="truncate text-[15px] font-medium leading-snug">{device}</div>
        {client && <div className="truncate text-[12px] leading-snug text-muted">{client}</div>}
        {/* one fact per line: a narrow phone truncates anything longer */}
        <div className="truncate text-[12px] leading-snug">
          {session.current ? (
            <>
              <span className="text-accent">{t.thisDevice}</span>
              <span className="text-muted"> · {t.signedIn} {relativeTime(session.created_at, locale)}</span>
            </>
          ) : (
            <span className="text-muted">
              {t.lastActive} {relativeTime(session.last_used_at, locale)}
            </span>
          )}
        </div>
      </div>
      {!session.current && (
        <button
          onClick={onRevoke}
          className="ml-auto shrink-0 self-center text-[13px] font-medium text-muted transition-colors hover:text-[var(--lm-danger,#dc2626)]"
        >
          {t.remove}
        </button>
      )}
    </SettingsRow>
  );
}

/** every step that leaves the list behind and takes over the panel */
type Confirm =
  | { kind: "log-out" }
  | { kind: "remove-device"; session: SessionSummary }
  | { kind: "remove-method"; provider: IdentitySummary["provider"] }
  | { kind: "add-method"; provider: "google" | "email" };

/** how a host sheet lends its header to one of those steps */
export interface SettingsSheet {
  /** null restores the host's own title and back behaviour */
  setView: (view: { title: string; onBack: () => void } | null) => void;
  /** applies the swap inside the host's view transition, so both animate as one */
  transition: (apply: () => void) => void;
}

export function LogoutIconButton() {
  const t = useDict().auth;
  const showToast = useUiStore((state) => state.showToast);
  const [pending, setPending] = useState(false);

  const handleLogout = async () => {
    setPending(true);
    try {
      await logout();
      signOutState();
      window.location.assign("/");
    } catch {
      setPending(false);
      showToast(t.accountActionError);
    }
  };

  return (
    <button
      onClick={() => void handleLogout()}
      disabled={pending}
      aria-label={t.logOut}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:text-accent focus-visible:text-accent disabled:opacity-50"
    >
      {pending ? <Loader2 size={17} className="animate-spin" /> : <LogOut size={17} />}
    </button>
  );
}

export function DeleteAccountIconButton() {
  const t = useDict().auth;
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.deleteAccount}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--lm-danger,#dc2626)] transition-colors hover:bg-surface focus-visible:bg-surface"
      >
        <Trash2 size={17} />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
          <button type="button" aria-label={t.cancel} onClick={() => setOpen(false)} className="absolute inset-0 bg-black/30 motion-safe:animate-fade-in" />
          <div className="relative w-full max-w-sm rounded-sheet border border-border bg-bg p-4 shadow-[0_12px_40px_rgba(0,0,0,0.18)] motion-safe:animate-dialog-in">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="delete-account-title" className="text-[17px] font-semibold">{t.deleteAccount}</h2>
              <button type="button" aria-label={t.cancel} onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-text">
                <X size={17} />
              </button>
            </div>
            <DeleteAccountForm onCancel={() => setOpen(false)} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * `sheet` is passed by surfaces that can give a step its own header and back
 * button (the mobile bottom sheet). Without it — the desktop panel — the step
 * takes over the panel body and carries its own cancel control instead.
 */
export function AccountSettings({
  sheet,
  showProfile = true,
  showDelete = false,
}: {
  sheet?: SettingsSheet;
  showProfile?: boolean;
  showDelete?: boolean;
} = {}) {
  const dict = useDict();
  const t = dict.auth;
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [accountActionPending, setAccountActionPending] = useState(false);
  const returnNotice = useAuthStore((state) => state.returnNotice);
  const setReturnNotice = useAuthStore((state) => state.setReturnNotice);
  const user = useAuthStore((state) => state.user);

  const identities = useQuery({ queryKey: ["identities"], queryFn: listIdentities });
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: listSessions });
  const providers = useQuery({
    queryKey: ["auth-providers"],
    queryFn: fetchAuthProviders,
    staleTime: 5 * 60 * 1000,
  });

  const providerName = (p: IdentitySummary["provider"]) =>
    p === "telegram" ? t.telegram : p === "google" ? t.google : t.emailProvider;

  const apply = (fn: () => void) => (sheet ? sheet.transition(fn) : fn());

  const closeConfirm = () =>
    apply(() => {
      setConfirm(null);
      setError(null);
      setNotice(null);
      sheet?.setView(null);
    });

  const openConfirm = (next: Confirm, title: string) =>
    apply(() => {
      setConfirm(next);
      setError(null);
      setNotice(null);
      sheet?.setView({ title, onBack: closeConfirm });
    });

  const unlink = useMutation({
    mutationFn: unlinkIdentity,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["identities"] });
      closeConfirm();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 403) setError(t.reauthNeeded);
      else if (err instanceof ApiError && err.status === 400) setError(t.lastMethod);
      else if (err instanceof ApiError && err.status === 409) setError(t.providerConflict);
      else setError(t.genericError);
    },
  });

  const revoke = useMutation({
    mutationFn: revokeSession,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["sessions"] });
      closeConfirm();
    },
    onError: () => setError(t.accountActionError),
  });

  const linked = new Map((identities.data ?? []).map((i) => [i.provider, i]));
  const activeSessions = (sessions.data ?? []).filter((s) => s.active);

  async function runAccountAction(action: () => Promise<void>) {
    setAccountActionPending(true);
    setError(null);
    setNotice(null);
    setReturnNotice(null);
    try {
      await action();
      signOutState();
      window.location.assign("/");
    } catch {
      setError(t.accountActionError);
    } finally {
      setAccountActionPending(false);
    }
  }

  async function addGoogle() {
    setAccountActionPending(true);
    setError(null);
    setReturnNotice(null);
    setNotice(null);
    try {
      // outside Telegram this navigates away; inside, Google opens in a real
      // browser (it rejects webviews) and the link lands when the user returns —
      // the app revalidates its queries on focus, so the row updates itself
      if ((await startGoogleLink(currentAuthRedirectTarget())) === "external") {
        setNotice(t.continueInBrowser);
        setAccountActionPending(false);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setError(t.reauthNeeded);
      else if (err instanceof ApiError && err.status === 409) setError(t.providerConflict);
      else setError(t.accountActionError);
      setAccountActionPending(false);
    }
  }

  async function reauthenticate() {
    setAccountActionPending(true);
    try {
      await logout();
    } catch {
      // local sign-out still prevents a stale session from blocking recovery
    }
    signOutState();
    window.location.assign("/profile");
  }

  const errorBanner = error ? (
    <div className="flex flex-col gap-2">
      <p role="alert" className="text-[13px] text-[var(--lm-danger,#dc2626)]">{error}</p>
      {error === t.reauthNeeded && (
        <button
          disabled={accountActionPending}
          onClick={() => void reauthenticate()}
          className="self-start text-[13px] font-semibold text-accent disabled:opacity-60"
        >
          {t.reauthAction}
        </button>
      )}
    </div>
  ) : null;

  if (confirm) {
    return (
      <ConfirmStep
        confirm={confirm}
        providerName={providerName}
        pending={accountActionPending || unlink.isPending || revoke.isPending}
        banner={errorBanner}
        notice={notice}
        // a back button in the host's header replaces the cancel control
        onCancel={sheet ? undefined : closeConfirm}
        onConfirm={() => {
          setError(null);
          if (confirm.kind === "log-out") void runAccountAction(logout);
          else if (confirm.kind === "remove-device") revoke.mutate(confirm.session.id);
          else if (confirm.kind === "remove-method") unlink.mutate(confirm.provider);
          else if (confirm.kind === "add-method") void addGoogle();
        }}
        onEmailLinked={() => {
          void qc.invalidateQueries({ queryKey: ["identities"] });
          closeConfirm();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-[13px] text-[var(--lm-danger,#dc2626)]">{error}</p>
          {error === t.reauthNeeded && (
            <button
              disabled={accountActionPending}
              onClick={() => void reauthenticate()}
              className="self-start text-[13px] font-semibold text-accent disabled:opacity-60"
            >
              {t.reauthAction}
            </button>
          )}
        </div>
      )}
      {notice && <p role="status" className="px-1 text-[13px] text-muted">{notice}</p>}
      {!error && returnNotice === "error" && <p role="alert" className="text-[13px] text-[var(--lm-danger,#dc2626)]">{t.genericError}</p>}
      {!error && returnNotice === "cancelled" && <p role="status" className="text-[13px] text-muted">{t.cancelled}</p>}

      {showProfile && user && (
        <SettingsSection title={dict.profile}>
          <SettingsRow>
            <div className="min-w-0 flex-1 truncate text-[15px] font-medium">
              {user.display_name || [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || dict.profile}
            </div>
            <ChangeNameButton user={user} sheet={sheet} />
          </SettingsRow>
        </SettingsSection>
      )}

      <SettingsSection title={t.methods}>
        <>
          {identities.isPending && (
            <div role="status" className="flex items-center justify-center gap-2 px-3.5 py-6 text-[13px] text-muted">
              <Loader2 size={15} className="animate-spin" /> {t.loadingAccount}
            </div>
          )}
          {identities.isError && (
            <p role="alert" className="px-3.5 py-4 text-[13px] text-[var(--lm-danger,#dc2626)]">{t.accountLoadError}</p>
          )}
          {identities.isSuccess && PROVIDERS.filter(
            (provider) => provider !== "google" || providers.data?.google,
          ).map((provider) => {
            const identity = linked.get(provider);
            return (
              <SettingsRow key={provider}>
                <div className="min-w-0">
                  <div className="text-[15px] font-medium">{providerName(provider)}</div>
                  {identity?.email && <div className="truncate text-[12px] text-muted">{identity.email}</div>}
                </div>
                <div className="ml-auto">
                  {identity ? (
                    (identities.data?.length ?? 0) > 1 ? (
                      <button
                        onClick={() =>
                          openConfirm({ kind: "remove-method", provider }, t.removeMethodTitle)
                        }
                        className="text-[13px] font-medium text-muted transition-colors hover:text-[var(--lm-danger,#dc2626)]"
                      >
                        {t.remove}
                      </button>
                    ) : (
                      <span className="text-[13px] text-muted">{t.connected}</span>
                    )
                  ) : provider === "google" || provider === "email" ? (
                    <button
                      onClick={() =>
                        openConfirm(
                          { kind: "add-method", provider },
                          `${t.add} ${providerName(provider)}`,
                        )
                      }
                      className="text-[13px] font-semibold text-accent"
                    >
                      {t.add}
                    </button>
                  ) : null}
                </div>
              </SettingsRow>
            );
          })}
        </>
      </SettingsSection>

      <SettingsSection title={t.sessions}>
        <>
          {sessions.isPending && (
            <div role="status" className="flex items-center justify-center gap-2 px-3.5 py-6 text-[13px] text-muted">
              <Loader2 size={15} className="animate-spin" /> {t.loadingAccount}
            </div>
          )}
          {sessions.isError && (
            <p role="alert" className="px-3.5 py-4 text-[13px] text-[var(--lm-danger,#dc2626)]">{t.accountLoadError}</p>
          )}
          {/* revoked and expired sessions are nothing the user can act on — the
              section is about the devices that can reach the account right now */}
          {sessions.isSuccess && activeSessions.length === 0 && (
            <p className="px-3.5 py-4 text-[13px] text-muted">{t.noSessions}</p>
          )}
          {activeSessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              onRevoke={() => openConfirm({ kind: "remove-device", session: s }, t.removeDeviceTitle)}
            />
          ))}
        </>
      </SettingsSection>

      {showDelete && (
        <SettingsSection title={t.dangerZone}>
          <SettingsRow>
            <div className="min-w-0 flex-1 text-[15px] font-medium">{t.deleteAccount}</div>
            <DeleteAccountIconButton />
          </SettingsRow>
        </SettingsSection>
      )}

    </div>
  );
}

/**
 * The body of a confirmation step. Every one of them looks the same — a short
 * explanation, the thing being acted on, and a single decisive button — so the
 * sheet feels like one flow whether you are signing out, dropping a device,
 * adding a sign-in method, or erasing the account.
 */
function ConfirmStep({
  confirm,
  providerName,
  pending,
  banner,
  notice,
  onCancel,
  onConfirm,
  onEmailLinked,
}: {
  confirm: Confirm;
  providerName: (p: IdentitySummary["provider"]) => string;
  pending: boolean;
  banner: React.ReactNode;
  notice: string | null;
  onCancel?: () => void;
  onConfirm: () => void;
  onEmailLinked: () => void;
}) {
  const t = useDict().auth;

  if (confirm.kind === "add-method" && confirm.provider === "email") {
    return (
      <div className="flex flex-col gap-3">
        {banner}
        <AddEmail onDone={onEmailLinked} onCancel={onCancel} />
      </div>
    );
  }

  const danger = confirm.kind !== "add-method";
  const { body, item, action } =
    confirm.kind === "log-out"
      ? { body: t.logOutConfirm, item: null, action: t.logOut }
      : confirm.kind === "remove-device"
        ? {
            body: t.removeDeviceConfirm,
            item: deviceLines(confirm.session, t).device,
            action: t.remove,
          }
        : confirm.kind === "remove-method"
          ? {
              body: t.removeMethodConfirm,
              item: providerName(confirm.provider),
              action: t.confirmRemove,
            }
          : { body: t.addGoogleBody, item: null, action: t.continueGoogle };

  return (
    <div className="flex flex-col gap-3">
      {banner}
      {item && (
        <div className="rounded-2xl bg-surface px-3.5 py-2.5 text-[15px] font-medium">{item}</div>
      )}
      <p className="text-[14px] leading-snug text-muted">{body}</p>
      {notice && <p role="status" className="text-[13px] text-muted">{notice}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <button
            disabled={pending}
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border px-3 py-2.5 text-[14px]"
          >
            {t.cancel}
          </button>
        )}
        <button
          disabled={pending}
          onClick={onConfirm}
          className={[
            "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[14px] font-semibold disabled:opacity-50",
            danger ? "bg-[var(--lm-danger,#dc2626)] text-white" : "bg-accent text-accent-text",
          ].join(" ")}
        >
          {pending && <Loader2 size={15} className="animate-spin" />}
          {action}
        </button>
      </div>
    </div>
  );
}

/**
 * The irreversible step, on its own so the mobile sheet can navigate to it as a
 * view with a title and a back button while the desktop panel expands it inline.
 * `onCancel` renders a cancel control; surfaces with a back button omit it.
 */
export function DeleteAccountForm({ onCancel }: { onCancel?: () => void }) {
  const t = useDict().auth;
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await eraseAccount(confirmation);
      signOutState();
      window.location.assign("/");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setError(t.reauthNeeded);
      else setError(t.deleteAccountError);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[13px] font-medium leading-snug text-[var(--lm-danger,#dc2626)]">
        {t.deleteAccountWarning}
      </p>
      <div>
        <label className="block text-[13px] text-muted" htmlFor="account-erasure-confirmation">
          {t.deleteConfirmationLabel} <span className="font-mono text-text">{ACCOUNT_ERASURE_PHRASE}</span>
        </label>
        <input
          id="account-erasure-confirmation"
          value={confirmation}
          maxLength={ACCOUNT_ERASURE_PHRASE.length}
          onChange={(event) => setConfirmation(event.target.value.normalize("NFC").replace(UNSAFE_CONFIRMATION_RE, ""))}
          autoComplete="off"
          spellCheck={false}
          className="mt-1.5 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-[15px] outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-[var(--lm-focus)]"
        />
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-[var(--lm-danger,#dc2626)]">{error}</p>
      )}
      <div className="flex gap-2">
        {onCancel && (
          <button
            disabled={pending}
            onClick={() => { setConfirmation(""); onCancel(); }}
            className="flex-1 rounded-xl border border-border px-3 py-2.5 text-[14px]"
          >
            {t.cancel}
          </button>
        )}
        <button
          disabled={confirmation !== ACCOUNT_ERASURE_PHRASE || pending}
          onClick={() => void submit()}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--lm-danger,#dc2626)] px-3 py-2.5 text-[14px] font-semibold text-white disabled:opacity-40"
        >
          {pending && <Loader2 size={15} className="animate-spin" />}
          {t.deleteAccountAction}
        </button>
      </div>
    </div>
  );
}

function AddEmail({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const t = useDict().auth;
  const fieldId = useId();
  const [step, setStep] = useState<"form" | "code">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = "w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-[15px] outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-[var(--lm-focus)]";

  async function submit() {
    setPending(true);
    setError(null);
    try {
      if (step === "form") {
        await startEmailLink(email, password);
        setStep("code");
      } else {
        await verifyEmailLink(email, code);
        onDone();
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError(err.message);
      else if (err instanceof ApiError && err.status === 401) setError(t.invalidCode);
      else if (err instanceof ApiError && err.status === 400) setError(err.message);
      else setError(t.genericError);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {/* the host sheet's header already names the step; the desktop panel has none */}
      {onCancel && <div className="text-[13px] font-semibold">{t.addEmailTitle}</div>}
      {step === "form" ? (
        <>
          <label htmlFor={`${fieldId}-email`} className="sr-only">{t.email}</label>
          <input id={`${fieldId}-email`} type="email" required autoComplete="email" placeholder={t.email} value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
          <label htmlFor={`${fieldId}-password`} className="sr-only">{t.password}</label>
          <input id={`${fieldId}-password`} type="password" required minLength={12} autoComplete="new-password" placeholder={t.password} value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
        </>
      ) : (
        <>
          <label htmlFor={`${fieldId}-code`} className="sr-only">{t.code}</label>
          <input id={`${fieldId}-code`} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required placeholder={t.code}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={`${input} text-center tracking-[0.3em]`} />
        </>
      )}
      {error && <p role="alert" className="text-[13px] text-[var(--lm-danger,#dc2626)]">{error}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <button type="button" disabled={pending} onClick={onCancel}
            className="flex-1 rounded-xl border border-border px-3 py-2.5 text-[14px]">
            {t.cancel}
          </button>
        )}
        <button type="submit" disabled={pending} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-[14px] font-semibold text-accent-text disabled:opacity-60">
          {pending && <Loader2 size={15} className="animate-spin" />}
          {step === "form" ? t.sendCode : t.verifyAction}
        </button>
      </div>
    </form>
  );
}
