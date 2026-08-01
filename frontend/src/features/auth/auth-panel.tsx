"use client";

import Image from "next/image";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import type { ClipboardEvent, KeyboardEvent as ReactKeyboardEvent } from "react";

import {
  confirmPasswordReset,
  fetchAuthProviders,
  loginEmail,
  registerEmail,
  requestPasswordReset,
  resendEmailCode,
  startGoogleLogin,
  verifyEmail,
} from "@/features/auth/api";
import type { SettingsSheet } from "@/features/auth/account-settings";
import { applySession, continueWithBrowserSession } from "@/features/auth/hooks";
import { cleanEmailInput, cleanPasswordInput } from "@/features/auth/input";
import { currentAuthRedirectTarget } from "@/features/auth/redirect";
import { ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/query/cache-policy";
import { useDict } from "@/lib/i18n/use-dict";
import { openExternalLink, openTelegramLink } from "@/lib/telegram/init";
import { useAuthStore } from "@/stores/auth-store";

type View = "choose" | "login" | "register" | "verify" | "forgot" | "reset";

export function AuthPanel({
  useDialogForEmail = false,
  sheet,
  onViewChange,
}: {
  useDialogForEmail?: boolean;
  sheet?: SettingsSheet;
  onViewChange?: (active: boolean) => void;
} = {}) {
  const t = useDict().auth;
  const [view, setView] = useState<View>("choose");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendRemaining, setResendRemaining] = useState(0);
  const returnNotice = useAuthStore((state) => state.returnNotice);
  const setReturnNotice = useAuthStore((state) => state.setReturnNotice);
  const providers = useQuery({
    queryKey: queryKeys.authProviders,
    queryFn: fetchAuthProviders,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (resendRemaining <= 0) return;
    const timer = window.setInterval(
      () => setResendRemaining((remaining) => Math.max(0, remaining - 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [resendRemaining]);

  useEffect(() => {
    if (view === "choose" || !useDialogForEmail || sheet) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) navigate("choose");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, pending, sheet, useDialogForEmail, view]);

  const viewTitle = (next: Exclude<View, "choose">) =>
    next === "register" ? t.createAccount
      : next === "verify" ? t.verifyTitle
        : next === "forgot" ? t.forgotTitle
          : next === "reset" ? t.resetTitle
            : t.signIn;

  const backTarget = (next: Exclude<View, "choose">): View =>
    next === "register" ? "choose"
      : next === "forgot" ? "login"
      : next === "verify" ? "register"
        : next === "reset" ? "forgot"
          : "choose";

  function navigate(next: View) {
    const apply = () => {
      setView(next);
      setError(null);
      setNotice(null);
      setCode("");
      setPassword("");
      setReturnNotice(null);
      onViewChange?.(next !== "choose");
      sheet?.setView(next === "choose" ? null : {
        title: viewTitle(next),
        onBack: () => navigate(backTarget(next)),
      });
    };
    if (sheet) sheet.transition(apply);
    else apply();
  };

  function preventInvalidEmailKey(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key.length === 1 && !/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~@-]/.test(event.key)) {
      event.preventDefault();
    }
  }

  function sanitizeEmailPaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    setEmail(cleanEmailInput(event.clipboardData.getData("text")));
  }

  async function run(fn: () => Promise<void>) {
    setPending(true);
    setError(null);
    setReturnNotice(null);
    try {
      await fn();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setError(err.message);
      else if (err instanceof ApiError && err.status === 401) setError(t.invalidCredentials);
      else setError(t.genericError);
    } finally {
      setPending(false);
    }
  }

  // one click, one navigation: the browser leaves for Google immediately, and
  // only the mini app stays behind — there Google opens in a real browser
  const onGoogle = () => {
    setError(null);
    setReturnNotice(null);
    if (!providers.data?.google) {
      setError(t.googleUnavailable);
      return;
    }
    if (startGoogleLogin(currentAuthRedirectTarget()) === "external") {
      setNotice(t.continueInBrowser);
    }
  };

  const onTelegram = () => {
    if (!openTelegramLink("https://t.me/loci_app_bot")) {
      openExternalLink("https://t.me/loci_app_bot");
    }
  };

  const onLogin = () =>
    run(async () => {
      const res = await loginEmail(email, password);
      applySession(res.user, res.access_token);
    });

  const onRegister = () =>
    run(async () => {
      await registerEmail(email, password);
      navigate("verify");
      setResendRemaining(60);
      setNotice(t.checkEmail);
    });

  const onVerify = () =>
    run(async () => {
      try {
        const res = await verifyEmail(email, code);
        applySession(res.user, res.access_token);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setError(t.invalidCode);
          return;
        }
        throw err;
      }
    });

  const onForgot = () =>
    run(async () => {
      await requestPasswordReset(email);
      navigate("reset");
      setNotice(t.checkEmail);
    });

  const onResetConfirm = () =>
    run(async () => {
      try {
        await confirmPasswordReset(email, code, password);
        navigate("login");
        setNotice(t.resetDone);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setError(t.invalidCode);
          return;
        }
        throw err;
      }
    });

  const input =
    "w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-[15px] outline-none transition-colors focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-[var(--lm-focus)]";
  const primary =
    "flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-[15px] font-semibold text-accent-text transition-[transform,opacity] duration-150 ease-lm active:scale-[0.99] disabled:opacity-60";
  const secondary =
    "auth-provider-button flex w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-bg px-3.5 py-2.5 text-[15px] font-medium text-text transition-[colors,transform,box-shadow] duration-150 ease-lm hover:border-accent disabled:opacity-60";

  const Back = ({ to }: { to: View }) => (
    <button type="button" onClick={() => navigate(to)} className="flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-text">
      <ArrowLeft size={15} /> {t.back}
    </button>
  );

  const Feedback = () => {
    const telegramFailed = returnNotice === "telegram-failed";
    const visibleError =
      error ?? (returnNotice === "error" ? t.genericError : telegramFailed ? t.telegramAuthFailed : null);
    const visibleNotice = notice ?? (returnNotice === "cancelled" ? t.cancelled : null);
    return (
      <>
        {visibleError && <p role="alert" className="text-[13px] text-[var(--lm-danger,#dc2626)]">{visibleError}</p>}
        {visibleNotice && !visibleError && <p role="status" className="text-[13px] text-muted">{visibleNotice}</p>}
        {/* restoring the browser session has to be the user's call: it may
            belong to a different account than the one launching the mini app */}
        {telegramFailed && !error && (
          <button
            type="button"
            disabled={pending}
            onClick={() => void continueWithBrowserSession()}
            className="self-start text-[13px] font-semibold text-accent disabled:opacity-60"
          >
            {t.useExistingSession}
          </button>
        )}
      </>
    );
  };

  const Spinner = () => (pending ? <Loader2 size={16} className="animate-spin" /> : null);

  const loginForm = (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => { e.preventDefault(); onLogin(); }}
    >
      {!useDialogForEmail && !sheet && <Back to="choose" />}
      {!sheet && <h2 className="text-[19px] font-semibold">{t.signIn}</h2>}
      <label className="text-[13px] font-medium text-muted" htmlFor="auth-email">{t.email}</label>
      <input id="auth-email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email}
        onChange={(e) => setEmail(cleanEmailInput(e.target.value))} onKeyDown={preventInvalidEmailKey} onPaste={sanitizeEmailPaste} className={input} />
      <label className="text-[13px] font-medium text-muted" htmlFor="auth-password">{t.password}</label>
      <input id="auth-password" type="password" autoComplete="current-password" required maxLength={256} value={password}
        onChange={(e) => setPassword(cleanPasswordInput(e.target.value))} className={input} />
      <Feedback />
      <button type="submit" disabled={pending} className={primary}><Spinner /> {t.signInAction}</button>
      <div className="flex items-center justify-between text-[13px]">
        <button type="button" onClick={() => navigate("forgot")} className="text-muted hover:text-text">{t.forgot}</button>
        <button type="button" onClick={() => navigate("register")} className="font-medium text-accent">{t.createAccount}</button>
      </div>
    </form>
  );

  const registerForm = (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => { e.preventDefault(); onRegister(); }}
    >
      {!useDialogForEmail && !sheet && <Back to="login" />}
      {!sheet && <h2 className="text-[19px] font-semibold">{t.createAccount}</h2>}
      <label className="text-[13px] font-medium text-muted" htmlFor="reg-email">{t.email}</label>
      <input id="reg-email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email}
        onChange={(e) => setEmail(cleanEmailInput(e.target.value))} onKeyDown={preventInvalidEmailKey} onPaste={sanitizeEmailPaste} className={input} />
      <label className="text-[13px] font-medium text-muted" htmlFor="reg-password">{t.password}</label>
      <input id="reg-password" type="password" autoComplete="new-password" required minLength={8} maxLength={256} value={password}
        onChange={(e) => setPassword(cleanPasswordInput(e.target.value))} className={input} />
      <p className="text-[12px] text-muted">{t.passwordHint}</p>
      <Feedback />
      <button type="submit" disabled={pending} className={primary}><Spinner /> {t.createAccount}</button>
      <p className="text-center text-[13px] text-muted">
        {t.alreadyHaveAccount}{" "}
        <button type="button" onClick={() => navigate("choose")} className="font-medium text-accent hover:opacity-80">{t.signInLink}</button>
      </p>
    </form>
  );

  const verifyResetForm = (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => { e.preventDefault(); view === "verify" ? onVerify() : onResetConfirm(); }}
    >
      {!useDialogForEmail && !sheet && <Back to={view === "verify" ? "register" : "forgot"} />}
      {!sheet && <h2 className="text-[19px] font-semibold">{view === "verify" ? t.verifyTitle : t.resetTitle}</h2>}
      <p className="text-[14px] text-muted">{t.verifySubtitle}</p>
      <label className="text-[13px] font-medium text-muted" htmlFor="auth-code">{t.code}</label>
      <input id="auth-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6}
        required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        className={`${input} text-center text-[20px] tracking-[0.4em]`} />
      {view === "reset" && (
        <>
          <label className="text-[13px] font-medium text-muted" htmlFor="reset-password">{t.newPassword}</label>
          <input id="reset-password" type="password" autoComplete="new-password" required minLength={8} maxLength={256}
            value={password} onChange={(e) => setPassword(cleanPasswordInput(e.target.value))} className={input} />
          <p className="text-[12px] text-muted">{t.passwordHint}</p>
        </>
      )}
      <Feedback />
      <button type="submit" disabled={pending} className={primary}>
        <Spinner /> {view === "verify" ? t.verifyAction : t.resetAction}
      </button>
      {view === "verify" && (
        <button
          type="button"
          disabled={pending || resendRemaining > 0}
          onClick={() => run(async () => {
            await resendEmailCode(email);
            setResendRemaining(60);
            setNotice(t.resent);
          })}
          className="text-[13px] text-muted hover:text-text disabled:opacity-60"
        >
          {resendRemaining > 0
            ? t.resendIn.replace("{seconds}", String(resendRemaining))
            : t.resend}
        </button>
      )}
    </form>
  );

  const forgotForm = (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => { e.preventDefault(); onForgot(); }}
    >
      {!useDialogForEmail && !sheet && <Back to="login" />}
      {!sheet && <h2 className="text-[19px] font-semibold">{t.forgotTitle}</h2>}
      <label className="text-[13px] font-medium text-muted" htmlFor="forgot-email">{t.email}</label>
      <input id="forgot-email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email}
        onChange={(e) => setEmail(cleanEmailInput(e.target.value))} onKeyDown={preventInvalidEmailKey} onPaste={sanitizeEmailPaste} className={input} />
      <Feedback />
      <button type="submit" disabled={pending} className={primary}><Spinner /> {t.sendCode}</button>
    </form>
  );

  const emailContent = view === "login" ? loginForm
    : view === "register" ? registerForm
    : view === "verify" || view === "reset" ? verifyResetForm
    : view === "forgot" ? forgotForm
    : null;

  const chooserEmail = (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); navigate("login"); }}>
      <label className="sr-only" htmlFor="auth-chooser-email">{t.email}</label>
      <input id="auth-chooser-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none"
        spellCheck={false} required maxLength={254} value={email} placeholder={t.emailAddress}
        onChange={(e) => setEmail(cleanEmailInput(e.target.value))} onKeyDown={preventInvalidEmailKey} onPaste={sanitizeEmailPaste} className={`${input} auth-modal-input h-12 px-4`} />
      <button type="submit" className={`${primary} h-12`}>{t.continueEmail}</button>
    </form>
  );

  const emailDialog = emailContent && useDialogForEmail && !sheet && typeof document !== "undefined"
    ? createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button type="button" aria-label={t.cancel} onClick={() => !pending && navigate("choose")} className="absolute inset-0 bg-black/30 motion-safe:animate-fade-in" />
          <div className="auth-dialog relative w-full max-w-[460px] rounded-sheet border border-border bg-bg p-5 shadow-[0_12px_40px_rgba(0,0,0,0.18)] motion-safe:animate-dialog-in sm:p-6">
            {emailContent}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="auth-panel mx-auto w-full max-w-sm">
      {view === "choose" && (
        <div className="flex flex-col gap-3">
          <div className="text-center">
            <h2 className="text-[19px] font-semibold">{t.signInToLoci}</h2>
            <p className="mt-1 whitespace-nowrap text-[12px] text-muted">{t.subtitle}</p>
          </div>
          {chooserEmail}
          <div className="auth-divider my-1 flex items-center gap-3 text-[12px] text-muted">
            <span className="h-px flex-1 bg-border" /><span>{t.orContinueWith}</span><span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {providers.data?.google && (
              <button type="button" onClick={onGoogle} disabled={pending} className={secondary}>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center"><Image src="/google.svg" alt="" width={18} height={18} unoptimized /></span>
                <span>Google</span>
              </button>
            )}
            <button type="button" onClick={onTelegram} disabled={pending} className={secondary}>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center"><Image src="/telegram.svg" alt="" width={18} height={18} unoptimized /></span>
              <span>Telegram</span>
            </button>
          </div>
          <p className="text-center text-[13px] text-muted">{t.noAccount}{" "}
            <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); navigate("register"); }} className="font-medium text-accent">{t.createAccount}</button>
          </p>
          <Feedback />
        </div>
      )}
      {emailContent && (!useDialogForEmail || sheet) && emailContent}
      {emailDialog}
    </div>
  );
}
