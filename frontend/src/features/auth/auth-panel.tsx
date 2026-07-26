"use client";

import { ArrowLeft, Loader2, Mail, Send } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";

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
import { applySession } from "@/features/auth/hooks";
import { cleanEmailInput, cleanPasswordInput } from "@/features/auth/input";
import { currentAuthRedirectTarget } from "@/features/auth/redirect";
import { ApiError } from "@/lib/api";
import { useDict } from "@/lib/i18n/use-dict";
import { openExternalLink, openTelegramLink } from "@/lib/telegram/init";
import { useAuthStore } from "@/stores/auth-store";

type View = "choose" | "google" | "login" | "register" | "verify" | "forgot" | "reset";

function GoogleIcon({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
    </svg>
  );
}

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
    queryKey: ["auth-providers"],
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

  const viewTitle = (next: Exclude<View, "choose">) =>
    next === "google" ? t.continueGoogle
      : next === "register" ? t.createAccount
        : next === "verify" ? t.verifyTitle
          : next === "forgot" ? t.forgotTitle
            : next === "reset" ? t.resetTitle
              : t.signIn;

  const backTarget = (next: Exclude<View, "choose">): View =>
    next === "register" || next === "forgot" ? "login"
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

  const onGoogle = () => {
    navigate("google");
    run(async () => {
      const handoff = await startGoogleLogin(currentAuthRedirectTarget());
      if (handoff === "external") setNotice(t.continueInBrowser);
    });
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
    "flex w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-bg px-3.5 py-2.5 text-[15px] font-medium text-text transition-[colors,transform] duration-150 ease-lm hover:border-accent active:scale-[0.99] disabled:opacity-60";

  const Back = ({ to }: { to: View }) => (
    <button type="button" onClick={() => navigate(to)} className="flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-text">
      <ArrowLeft size={15} /> {t.back}
    </button>
  );

  const Feedback = () => {
    const visibleError = error ?? (returnNotice === "error" ? t.genericError : null);
    const visibleNotice = notice ?? (returnNotice === "cancelled" ? t.cancelled : null);
    return (
      <>
        {visibleError && <p role="alert" className="text-[13px] text-[var(--lm-danger,#dc2626)]">{visibleError}</p>}
        {visibleNotice && !visibleError && <p role="status" className="text-[13px] text-muted">{visibleNotice}</p>}
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
        onChange={(e) => setEmail(cleanEmailInput(e.target.value))} className={input} />
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
        onChange={(e) => setEmail(cleanEmailInput(e.target.value))} className={input} />
      <label className="text-[13px] font-medium text-muted" htmlFor="reg-password">{t.password}</label>
      <input id="reg-password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} value={password}
        onChange={(e) => setPassword(cleanPasswordInput(e.target.value))} className={input} />
      <p className="text-[12px] text-muted">{t.passwordHint}</p>
      <Feedback />
      <button type="submit" disabled={pending} className={primary}><Spinner /> {t.createAccount}</button>
      <button type="button" onClick={() => navigate("login")} className="text-[13px] text-muted hover:text-text">{t.toLogin}</button>
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
          <input id="reset-password" type="password" autoComplete="new-password" required minLength={12} maxLength={256}
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
        onChange={(e) => setEmail(cleanEmailInput(e.target.value))} className={input} />
      <Feedback />
      <button type="submit" disabled={pending} className={primary}><Spinner /> {t.sendCode}</button>
    </form>
  );

  const emailContent = view === "login" ? loginForm
    : view === "register" ? registerForm
    : view === "verify" || view === "reset" ? verifyResetForm
    : view === "forgot" ? forgotForm
    : null;

  const emailDialog = emailContent && useDialogForEmail && !sheet && typeof document !== "undefined"
    ? createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <button type="button" aria-label="close" onClick={() => navigate("choose")} className="absolute inset-0 bg-black/30 motion-safe:animate-fade-in" />
          <div className="relative w-full max-w-sm rounded-sheet border border-border bg-bg p-5 shadow-[0_12px_40px_rgba(0,0,0,0.18)] motion-safe:animate-dialog-in">
            {emailContent}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="mx-auto w-full max-w-sm">
      {view === "choose" && (
        <div className="flex flex-col gap-3">
          <div className="mb-1 text-center">
            <h2 className="text-[19px] font-semibold">{t.signIn}</h2>
            <p className="mt-1 text-[14px] text-muted">{t.subtitle}</p>
          </div>
          {providers.data?.google && (
            <button type="button" onClick={onGoogle} disabled={pending} className={secondary}>
              <GoogleIcon size={18} />
              <span>{t.continueGoogle}</span>
            </button>
          )}
          <button type="button" onClick={onTelegram} disabled={pending} className={secondary}>
            <Send size={18} />
            <span>{t.continueTelegram}</span>
          </button>
          <button type="button" onClick={() => navigate("login")} className={secondary}>
            <Mail size={18} />
            <span>{t.continueEmail}</span>
          </button>
          <Feedback />
        </div>
      )}
      {view === "google" && (
        <div className="flex min-h-28 flex-col items-center justify-center gap-3 text-center">
          {pending && <Loader2 size={20} className="animate-spin text-muted" />}
          {!error && !notice && <p className="text-[14px] text-muted">{t.continueGoogle}</p>}
          <Feedback />
        </div>
      )}
      {emailContent && (!useDialogForEmail || sheet) && emailContent}
      {emailDialog}
    </div>
  );
}
