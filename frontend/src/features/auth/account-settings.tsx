"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, Monitor, Smartphone, Tablet, Trash2 } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  listIdentities,
  listSessions,
  fetchAuthProviders,
  eraseAccount,
  logout,
  revokeSession,
  startEmailLink,
  startGoogleLink,
  startTelegramLink,
  unlinkIdentity,
  verifyEmailLink,
  type IdentitySummary,
  type SessionSummary,
} from "@/features/auth/api";
import { SettingsRow, SettingsSection } from "@/components/settings-section";
import { ChangeNameButton, NameEditor } from "@/features/auth/editable-name";
import { signOutState } from "@/features/auth/hooks";
import { cleanEmailInput, cleanPasswordInput } from "@/features/auth/input";
import { currentAuthRedirectTarget } from "@/features/auth/redirect";
import { ApiError } from "@/lib/api";
import type { AuthStrings } from "@/lib/i18n/dict";
import { useDict } from "@/lib/i18n/use-dict";
import { isTelegramWebApp, openTelegramLink } from "@/lib/telegram/init";
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
  | { kind: "remove-device"; session: SessionSummary }
  | { kind: "remove-method"; provider: IdentitySummary["provider"] }
  // adding google or telegram is a single hand-off with nothing to confirm; only
  // email needs a step of its own, because it needs an address and a password
  | { kind: "add-method"; provider: "email" };

/** how a host sheet lends its header to one of those steps */
export interface SettingsSheet {
  /** null restores the host's own title and back behaviour */
  setView: (view: { title: string; onBack: () => void } | null) => void;
  /** applies the swap inside the host's view transition, so both animate as one */
  transition: (apply: () => void) => void;
}

export function LogoutIconButton({
  sheet,
  onOpenChange,
}: {
  sheet?: SettingsSheet;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const t = useDict().auth;
  const [open, setOpen] = useState(false);
  const controlled = onOpenChange !== undefined;
  const close = () => {
    if (sheet) sheet.transition(() => {
      onOpenChange?.(false);
      sheet.setView(null);
    });
    else setOpen(false);
  };
  const begin = () => {
    if (sheet) sheet.transition(() => {
      onOpenChange?.(true);
      sheet.setView({ title: t.logOut, onBack: close });
    });
    else setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={begin}
        aria-label={t.logOut}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-accent focus-visible:bg-surface focus-visible:text-accent"
      >
        <LogOut size={17} />
      </button>
      {!controlled && open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="log-out-title">
          <button type="button" aria-label={t.cancel} onClick={close} className="absolute inset-0 bg-black/30 motion-safe:animate-fade-in" />
          <div className="relative w-full max-w-sm rounded-sheet border border-border bg-bg p-5 shadow-[0_12px_40px_rgba(0,0,0,0.18)] motion-safe:animate-dialog-in">
            <h2 id="log-out-title" className="mb-4 text-[17px] font-semibold">{t.logOut}</h2>
            <LogoutConfirmation onCancel={close} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export function LogoutConfirmation({ onCancel }: { onCancel?: () => void }) {
  const t = useDict().auth;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await logout();
      signOutState();
      window.location.assign("/");
    } catch {
      setError(t.accountActionError);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] leading-snug text-muted">{t.logOutConfirm}</p>
      {error && <p role="alert" className="text-[13px] text-[var(--lm-danger,#dc2626)]">{error}</p>}
      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border px-3 py-2.5 text-[14px] disabled:opacity-50"
          >
            {t.cancel}
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => void submit()}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--lm-danger,#dc2626)] px-3 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
        >
          {pending && <Loader2 size={15} className="animate-spin" />}
          {t.logOut}
        </button>
      </div>
    </div>
  );
}

export function DeleteAccountIconButton({
  sheet,
  onOpenChange,
}: {
  sheet?: SettingsSheet;
  onOpenChange?: (open: boolean) => void;
} = {}) {
  const t = useDict().auth;
  const [open, setOpen] = useState(false);
  const controlled = onOpenChange !== undefined;
  const close = () => {
    if (sheet) sheet.transition(() => {
      onOpenChange?.(false);
      sheet.setView(null);
    });
    else setOpen(false);
  };
  const begin = () => {
    if (sheet) sheet.transition(() => {
      onOpenChange?.(true);
      sheet.setView({ title: t.deleteAccount, onBack: close });
    });
    else setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={begin}
        aria-label={t.deleteAccount}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--lm-danger,#dc2626)] transition-colors hover:bg-surface focus-visible:bg-surface"
      >
        <Trash2 size={17} />
      </button>
      {!controlled && open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
          <button type="button" aria-label={t.cancel} onClick={close} className="absolute inset-0 bg-black/30 motion-safe:animate-fade-in" />
          <div className="relative w-full max-w-sm rounded-sheet border border-border bg-bg p-5 shadow-[0_12px_40px_rgba(0,0,0,0.18)] motion-safe:animate-dialog-in">
            <h2 id="delete-account-title" className="mb-4 text-[17px] font-semibold">{t.deleteAccount}</h2>
            <DeleteAccountForm onCancel={close} />
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
  const [confirm, setConfirm] = useState<{ step: Confirm; title: string } | null>(null);
  const [nameEditing, setNameEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [accountActionPending, setAccountActionPending] = useState(false);
  // set while the user is over in Telegram pressing Start; the identities query
  // polls until the bot's link lands, so the row connects itself
  const [telegramPending, setTelegramPending] = useState(false);
  const returnNotice = useAuthStore((state) => state.returnNotice);
  const setReturnNotice = useAuthStore((state) => state.setReturnNotice);
  const user = useAuthStore((state) => state.user);

  const identities = useQuery({
    queryKey: ["identities"],
    queryFn: listIdentities,
    refetchInterval: telegramPending ? 2000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: telegramPending,
  });
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
      setConfirm({ step: next, title });
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
  const telegramLinked = linked.has("telegram");

  // the poll answers as soon as the bot has done its part; stop it either when
  // the link lands or when the token behind it has expired unused
  useEffect(() => {
    if (!telegramPending || !telegramLinked) return;
    setTelegramPending(false);
    setNotice(t.telegramConnected);
  }, [t.telegramConnected, telegramLinked, telegramPending]);

  useEffect(() => {
    if (!telegramPending) return;
    const timer = window.setTimeout(() => setTelegramPending(false), 3 * 60_000);
    return () => window.clearTimeout(timer);
  }, [telegramPending]);

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

  /**
   * Opens the bot on the one-time deep link and leaves the poll running. The
   * tab is claimed synchronously, before the token request, because a tab
   * opened after an await is a popup as far as Safari is concerned; keeping
   * this page alive is what lets the row update itself when the user comes back.
   */
  async function addTelegram() {
    setAccountActionPending(true);
    setError(null);
    setReturnNotice(null);
    setNotice(null);
    const inTelegram = isTelegramWebApp();
    const tab = inTelegram ? null : window.open("about:blank", "_blank");
    try {
      const { url } = await startTelegramLink();
      if (inTelegram) openTelegramLink(url);
      else if (tab) tab.location.href = url;
      // popups blocked: hand the whole tab over instead, and pick the link up on return
      else window.location.assign(url);
      setTelegramPending(true);
      setNotice(t.telegramWaiting);
    } catch (err) {
      tab?.close();
      if (err instanceof ApiError && err.status === 403) setError(t.reauthNeeded);
      else if (err instanceof ApiError && err.status === 409) setError(t.providerConflict);
      else setError(t.accountActionError);
    } finally {
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
    window.location.assign("/");
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

  const confirmStepEl = confirm ? (
    <ConfirmStep
      confirm={confirm.step}
      providerName={providerName}
      pending={accountActionPending || unlink.isPending || revoke.isPending}
      banner={errorBanner}
      notice={notice}
      onCancel={sheet ? undefined : closeConfirm}
      onConfirm={() => {
        setError(null);
        if (confirm.step.kind === "remove-device") revoke.mutate(confirm.step.session.id);
        else if (confirm.step.kind === "remove-method") unlink.mutate(confirm.step.provider);
      }}
      onEmailLinked={() => {
        void qc.invalidateQueries({ queryKey: ["identities"] });
        closeConfirm();
      }}
    />
  ) : null;

  if (confirm && sheet) {
    return confirmStepEl;
  }

  const closeNameEditor = () => apply(() => {
    setNameEditing(false);
    sheet?.setView(null);
  });

  const closeDelete = () => apply(() => {
    setDeleteOpen(false);
    sheet?.setView(null);
  });

  if (nameEditing && user) {
    return <NameEditor user={user} inline onClose={closeNameEditor} />;
  }

  if (deleteOpen) {
    return <DeleteAccountForm onCancel={closeDelete} />;
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

      {!confirm && <>
      {showProfile && user && (
        <SettingsSection title={dict.profile}>
          <SettingsRow>
            <div className="min-w-0 flex-1 truncate text-[15px] font-medium">
              {user.display_name || [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || dict.profile}
            </div>
            <ChangeNameButton user={user} sheet={sheet} onEditStateChange={setNameEditing} />
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
                  ) : (
                    // google and telegram start their hand-off on this click;
                    // only email opens a step, because it has a form to fill in
                    <button
                      disabled={accountActionPending}
                      onClick={() => {
                        if (provider === "email") {
                          openConfirm(
                            { kind: "add-method", provider: "email" },
                            `${t.add} ${providerName(provider)}`,
                          );
                        } else if (provider === "telegram") {
                          void addTelegram();
                        } else {
                          void addGoogle();
                        }
                      }}
                      className="flex items-center gap-1.5 text-[13px] font-semibold text-accent disabled:opacity-60"
                    >
                      {provider === "telegram" && telegramPending && (
                        <Loader2 size={13} className="animate-spin" />
                      )}
                      {t.add}
                    </button>
                  )}
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
            {!sheet && <LogoutIconButton />}
            <DeleteAccountIconButton sheet={sheet} onOpenChange={setDeleteOpen} />
          </SettingsRow>
        </SettingsSection>
      )}
      </>}

      {confirm && !sheet && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button type="button" aria-label={t.cancel} onClick={closeConfirm} className="absolute inset-0 bg-black/30 motion-safe:animate-fade-in" />
          <div className="relative w-full max-w-sm rounded-sheet border border-border bg-bg p-5 shadow-[0_12px_40px_rgba(0,0,0,0.18)] motion-safe:animate-dialog-in">
            <h2 className="mb-4 text-[17px] font-semibold">{confirm.title}</h2>
            {confirmStepEl}
          </div>
        </div>,
        document.body,
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

  if (confirm.kind === "add-method") {
    return (
      <div className="flex flex-col gap-3">
        {banner}
        <AddEmail onDone={onEmailLinked} onCancel={onCancel} />
      </div>
    );
  }

  const { body, item, action } = confirm.kind === "remove-device"
    ? {
        body: t.removeDeviceConfirm,
        item: deviceLines(confirm.session, t).device,
        action: t.remove,
      }
    : {
        body: t.removeMethodConfirm,
        item: providerName(confirm.provider),
        action: t.confirmRemove,
      };

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
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--lm-danger,#dc2626)] px-3 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
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
const HOLD_DURATION = 5000;

function HoldToDeleteButton({
  disabled,
  onComplete,
  children,
}: {
  disabled: boolean;
  onComplete: () => void;
  children: React.ReactNode;
}) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const startRef = useRef(0);
  const rafRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completedRef = useRef(false);

  const stop = useCallback(() => {
    setHolding(false);
    setProgress(0);
    cancelAnimationFrame(rafRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    completedRef.current = false;
  }, []);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const tick = useCallback(() => {
    const elapsed = Date.now() - startRef.current;
    const p = Math.min(elapsed / HOLD_DURATION, 1);
    setProgress(p);
    if (p >= 1 && !completedRef.current) {
      completedRef.current = true;
      onComplete();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [onComplete]);

  const start = () => {
    if (disabled) return;
    startRef.current = Date.now();
    completedRef.current = false;
    setHolding(true);
    rafRef.current = requestAnimationFrame(tick);
    timeoutRef.current = setTimeout(() => {
      if (completedRef.current) return;
      completedRef.current = true;
      setProgress(1);
      onComplete();
    }, HOLD_DURATION);
  };

  const opacity = holding ? 1 - progress * 0.6 : 1;

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={start}
      onMouseUp={stop}
      onMouseLeave={stop}
      onTouchStart={start}
      onTouchEnd={stop}
      onTouchCancel={stop}
      className="relative w-full overflow-hidden rounded-xl px-3 py-2.5 text-[14px] font-semibold text-white disabled:opacity-40"
      style={{
        backgroundColor: `rgba(220, 38, 38, ${opacity})`,
        transition: holding ? "none" : "background-color 0.3s ease",
      }}
    >
      {holding && (
        <span
          className="absolute inset-0 origin-left bg-white/20"
          style={{ transform: `scaleX(${progress})`, transition: "none" }}
        />
      )}
      <span className="relative flex items-center justify-center gap-2">
        {children}
      </span>
    </button>
  );
}

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
    <div className="flex flex-col gap-3">
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
          onChange={(event) => setConfirmation(event.target.value.normalize("NFC").replace(UNSAFE_CONFIRMATION_RE, "").replace(/^\s+/, ""))}
          autoComplete="off"
          spellCheck={false}
          className="mt-1.5 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-[15px] outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-[var(--lm-focus)]"
        />
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-[var(--lm-danger,#dc2626)]">{error}</p>
      )}
      <HoldToDeleteButton
        disabled={confirmation.trim() !== ACCOUNT_ERASURE_PHRASE || pending}
        onComplete={() => void submit()}
      >
        {pending && <Loader2 size={15} className="animate-spin" />}
        {t.deleteAccountAction}
      </HoldToDeleteButton>
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
    const trimmedEmail = email.trim();
    if (step === "form" && !trimmedEmail) return;
    setPending(true);
    setError(null);
    try {
      if (step === "form") {
        await startEmailLink(trimmedEmail, password);
        setEmail(trimmedEmail);
        setStep("code");
      } else {
        await verifyEmailLink(trimmedEmail, code.trim());
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
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {onCancel && <div className="text-[15px] font-semibold">{t.addEmailTitle}</div>}
      {step === "form" ? (
        <>
          <div>
            <label htmlFor={`${fieldId}-email`} className="mb-1 block text-[13px] text-muted">{t.email}</label>
            <input id={`${fieldId}-email`} type="email" required autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} placeholder={t.email} value={email} onChange={(e) => setEmail(cleanEmailInput(e.target.value))} className={input} />
          </div>
          <div>
            <label htmlFor={`${fieldId}-password`} className="mb-1 block text-[13px] text-muted">{t.password}</label>
            <input id={`${fieldId}-password`} type="password" required minLength={8} maxLength={256} autoComplete="new-password" placeholder={t.password} value={password} onChange={(e) => setPassword(cleanPasswordInput(e.target.value))} className={input} />
          </div>
        </>
      ) : (
        <div>
          <label htmlFor={`${fieldId}-code`} className="mb-1 block text-[13px] text-muted">{t.code}</label>
          <input id={`${fieldId}-code`} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required placeholder={t.code}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").trim())} className={`${input} text-center tracking-[0.3em]`} />
        </div>
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
