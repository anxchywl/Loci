"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, Monitor, Smartphone, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import {
  listIdentities,
  listSessions,
  fetchAuthProviders,
  eraseAccount,
  logout,
  logoutEverywhere,
  revokeSession,
  startEmailLink,
  startGoogleLink,
  unlinkIdentity,
  verifyEmailLink,
  type IdentitySummary,
} from "@/features/auth/api";
import { signOutState } from "@/features/auth/hooks";
import { currentAuthRedirectTarget } from "@/features/auth/redirect";
import { ApiError } from "@/lib/api";
import { useDict } from "@/lib/i18n/use-dict";
import { useAuthStore } from "@/stores/auth-store";

const PROVIDERS: IdentitySummary["provider"][] = ["telegram", "google", "email"];
const ACCOUNT_ERASURE_PHRASE = "DELETE MY ACCOUNT";

export function AccountSettings() {
  const t = useDict().auth;
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [addingEmail, setAddingEmail] = useState(false);
  const [confirmProvider, setConfirmProvider] = useState<IdentitySummary["provider"] | null>(null);
  const [accountActionPending, setAccountActionPending] = useState(false);
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const returnNotice = useAuthStore((state) => state.returnNotice);
  const setReturnNotice = useAuthStore((state) => state.setReturnNotice);

  const identities = useQuery({ queryKey: ["identities"], queryFn: listIdentities });
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: listSessions });
  const providers = useQuery({
    queryKey: ["auth-providers"],
    queryFn: fetchAuthProviders,
    staleTime: 5 * 60 * 1000,
  });

  const providerName = (p: IdentitySummary["provider"]) =>
    p === "telegram" ? t.telegram : p === "google" ? t.google : t.emailProvider;

  const unlink = useMutation({
    mutationFn: unlinkIdentity,
    onSuccess: () => {
      setConfirmProvider(null);
      return qc.invalidateQueries({ queryKey: ["identities"] });
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
    onError: () => setError(t.accountActionError),
  });

  const linked = new Map((identities.data ?? []).map((i) => [i.provider, i]));

  async function runAccountAction(action: () => Promise<void>) {
    setAccountActionPending(true);
    setError(null);
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
    try {
      await startGoogleLink(currentAuthRedirectTarget());
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

  async function deleteAccount() {
    setAccountActionPending(true);
    setError(null);
    try {
      await eraseAccount(deletionConfirmation);
      signOutState();
      window.location.assign("/");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setError(t.reauthNeeded);
      else setError(t.deleteAccountError);
    } finally {
      setAccountActionPending(false);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
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
      {!error && returnNotice === "error" && <p role="alert" className="text-[13px] text-[var(--lm-danger,#dc2626)]">{t.genericError}</p>}
      {!error && returnNotice === "cancelled" && <p role="status" className="text-[13px] text-muted">{t.cancelled}</p>}

      <section>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{t.methods}</h2>
        <div className="divide-y divide-border rounded-lg border border-border">
          {identities.isPending && (
            <div role="status" className="flex items-center justify-center gap-2 px-3 py-6 text-[13px] text-muted">
              <Loader2 size={15} className="animate-spin" /> {t.loadingAccount}
            </div>
          )}
          {identities.isError && (
            <p role="alert" className="px-3 py-4 text-[13px] text-[var(--lm-danger,#dc2626)]">{t.accountLoadError}</p>
          )}
          {identities.isSuccess && PROVIDERS.filter(
            (provider) => provider !== "google" || providers.data?.google,
          ).map((provider) => {
            const identity = linked.get(provider);
            return (
              <div key={provider} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-[15px] font-medium">{providerName(provider)}</div>
                  {identity?.email && <div className="truncate text-[12px] text-muted">{identity.email}</div>}
                </div>
                <div className="ml-auto">
                  {identity ? (
                    (identities.data?.length ?? 0) > 1 ? (
                      confirmProvider === provider ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setConfirmProvider(null)}
                            className="text-[13px] text-muted transition-colors hover:text-text"
                          >
                            {t.cancel}
                          </button>
                          <button
                            disabled={unlink.isPending}
                            onClick={() => { setError(null); unlink.mutate(provider); }}
                            className="text-[13px] font-semibold text-[var(--lm-danger,#dc2626)] disabled:opacity-60"
                          >
                            {t.confirmRemove}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setError(null); setConfirmProvider(provider); }}
                          className="text-[13px] font-medium text-muted transition-colors hover:text-[var(--lm-danger,#dc2626)]"
                        >
                          {t.remove}
                        </button>
                      )
                    ) : (
                      <span className="text-[13px] text-muted">{t.connected}</span>
                    )
                  ) : provider === "google" ? (
                    <button disabled={accountActionPending} onClick={addGoogle} className="text-[13px] font-semibold text-accent disabled:opacity-60">{t.add}</button>
                  ) : provider === "email" ? (
                    <button onClick={() => setAddingEmail((v) => !v)} className="text-[13px] font-semibold text-accent">{t.add}</button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {addingEmail && !linked.get("email") && (
          <AddEmail onDone={() => { setAddingEmail(false); qc.invalidateQueries({ queryKey: ["identities"] }); }} />
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{t.sessions}</h2>
        <div className="divide-y divide-border rounded-lg border border-border">
          {sessions.isPending && (
            <div role="status" className="flex items-center justify-center gap-2 px-3 py-6 text-[13px] text-muted">
              <Loader2 size={15} className="animate-spin" /> {t.loadingAccount}
            </div>
          )}
          {sessions.isError && (
            <p role="alert" className="px-3 py-4 text-[13px] text-[var(--lm-danger,#dc2626)]">{t.accountLoadError}</p>
          )}
          {sessions.isSuccess && sessions.data.length === 0 && (
            <p className="px-3 py-4 text-[13px] text-muted">{t.noSessions}</p>
          )}
          {sessions.data?.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2.5">
              {s.device_type === "mobile" ? <Smartphone size={16} className="text-muted" /> : <Monitor size={16} className="text-muted" />}
              <div className="min-w-0">
                <div className="text-[14px]">{[s.browser, s.operating_system].filter(Boolean).join(" · ") || "—"}</div>
                {s.current && <div className="text-[12px] text-accent">{t.thisDevice}</div>}
              </div>
              {!s.current && s.active && (
                <button onClick={() => revoke.mutate(s.id)} className="ml-auto text-[13px] font-medium text-muted transition-colors hover:text-[var(--lm-danger,#dc2626)]">{t.remove}</button>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-2">
        <button
          disabled={accountActionPending}
          onClick={() => runAccountAction(logout)}
          className="flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2.5 text-[15px] font-medium transition-colors hover:border-accent"
        >
          {accountActionPending ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />} {t.logOut}
        </button>
        <button
          disabled={accountActionPending}
          onClick={() => runAccountAction(logoutEverywhere)}
          className="text-[13px] text-muted transition-colors hover:text-text disabled:opacity-60"
        >
          {t.logOutEverywhere}
        </button>
      </div>

      <section>
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">{t.dangerZone}</h2>
        <div className="rounded-lg border border-border p-3">
          <div className="text-[15px] font-medium">{t.deleteAccount}</div>
          <p className="mt-1 text-[13px] text-muted">{t.deleteAccountDescription}</p>
          {!deletionOpen ? (
            <button
              onClick={() => setDeletionOpen(true)}
              className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-[var(--lm-danger,#dc2626)]"
            >
              <Trash2 size={15} /> {t.deleteAccount}
            </button>
          ) : (
            <div className="mt-3 border-t border-border pt-3">
              <p className="text-[13px] font-medium text-[var(--lm-danger,#dc2626)]">{t.deleteAccountWarning}</p>
              <label className="mt-3 block text-[13px] text-muted" htmlFor="account-erasure-confirmation">
                {t.deleteConfirmationLabel} <span className="font-mono text-text">{ACCOUNT_ERASURE_PHRASE}</span>
              </label>
              <input
                id="account-erasure-confirmation"
                value={deletionConfirmation}
                onChange={(event) => setDeletionConfirmation(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="mt-2 w-full rounded-lg border border-border bg-bg px-3 py-2 text-[15px] outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-[var(--lm-focus)]"
              />
              <div className="mt-3 flex gap-2">
                <button
                  disabled={accountActionPending}
                  onClick={() => { setDeletionOpen(false); setDeletionConfirmation(""); }}
                  className="flex-1 rounded-lg border border-border px-3 py-2 text-[14px]"
                >
                  {t.cancel}
                </button>
                <button
                  disabled={deletionConfirmation !== ACCOUNT_ERASURE_PHRASE || accountActionPending}
                  onClick={() => void deleteAccount()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--lm-danger,#dc2626)] px-3 py-2 text-[14px] font-semibold text-white disabled:opacity-40"
                >
                  {accountActionPending && <Loader2 size={15} className="animate-spin" />}
                  {t.deleteAccountAction}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function AddEmail({ onDone }: { onDone: () => void }) {
  const t = useDict().auth;
  const fieldId = useId();
  const [step, setStep] = useState<"form" | "code">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-[15px] outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-[var(--lm-focus)]";

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
    <form className="mt-3 flex flex-col gap-2 rounded-lg border border-border p-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="text-[13px] font-semibold">{t.addEmailTitle}</div>
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
      <button type="submit" disabled={pending} className="flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-[14px] font-semibold text-accent-text disabled:opacity-60">
        {pending && <Loader2 size={15} className="animate-spin" />}
        {step === "form" ? t.sendCode : t.verifyAction}
      </button>
    </form>
  );
}
