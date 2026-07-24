"use client";

import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
import { applySession } from "@/features/auth/hooks";
import { currentAuthRedirectTarget } from "@/features/auth/redirect";
import { ApiError } from "@/lib/api";
import { useDict } from "@/lib/i18n/use-dict";
import { useAuthStore } from "@/stores/auth-store";

type View = "choose" | "login" | "register" | "verify" | "forgot" | "reset";

export function AuthPanel() {
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

  const reset = (next: View) => {
    setView(next);
    setError(null);
    setNotice(null);
    setCode("");
    setPassword("");
    setReturnNotice(null);
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

  const onGoogle = () =>
    run(async () => {
      await startGoogleLogin(currentAuthRedirectTarget());
    });

  const onLogin = () =>
    run(async () => {
      const res = await loginEmail(email, password);
      applySession(res.user, res.access_token);
    });

  const onRegister = () =>
    run(async () => {
      await registerEmail(email, password);
      reset("verify");
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
      reset("reset");
      setNotice(t.checkEmail);
    });

  const onResetConfirm = () =>
    run(async () => {
      try {
        await confirmPasswordReset(email, code, password);
        reset("login");
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
    "flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-bg px-3 py-2.5 text-[15px] font-medium transition-colors hover:border-accent";

  const Back = ({ to }: { to: View }) => (
    <button type="button" onClick={() => reset(to)} className="flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-text">
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

  return (
    <div className="mx-auto w-full max-w-sm">
      {view === "choose" && (
        <div className="flex flex-col gap-3">
          <div className="mb-1 text-center">
            <h2 className="text-[19px] font-semibold">{t.signIn}</h2>
            <p className="mt-1 text-[14px] text-muted">{t.subtitle}</p>
          </div>
          {providers.data?.google && (
            <button onClick={onGoogle} disabled={pending} className={secondary}>
              {t.continueGoogle}
            </button>
          )}
          <button onClick={() => reset("login")} className={secondary}>
            <Mail size={18} /> {t.continueEmail}
          </button>
          <Feedback />
        </div>
      )}

      {view === "login" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onLogin();
          }}
        >
          <Back to="choose" />
          <h2 className="text-[19px] font-semibold">{t.signIn}</h2>
          <label className="text-[13px] font-medium text-muted" htmlFor="auth-email">{t.email}</label>
          <input id="auth-email" type="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} className={input} />
          <label className="text-[13px] font-medium text-muted" htmlFor="auth-password">{t.password}</label>
          <input id="auth-password" type="password" autoComplete="current-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} className={input} />
          <Feedback />
          <button type="submit" disabled={pending} className={primary}><Spinner /> {t.signInAction}</button>
          <div className="flex items-center justify-between text-[13px]">
            <button type="button" onClick={() => reset("forgot")} className="text-muted hover:text-text">{t.forgot}</button>
            <button type="button" onClick={() => reset("register")} className="font-medium text-accent">{t.createAccount}</button>
          </div>
        </form>
      )}

      {view === "register" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onRegister();
          }}
        >
          <Back to="login" />
          <h2 className="text-[19px] font-semibold">{t.createAccount}</h2>
          <label className="text-[13px] font-medium text-muted" htmlFor="reg-email">{t.email}</label>
          <input id="reg-email" type="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} className={input} />
          <label className="text-[13px] font-medium text-muted" htmlFor="reg-password">{t.password}</label>
          <input id="reg-password" type="password" autoComplete="new-password" required minLength={12} value={password}
            onChange={(e) => setPassword(e.target.value)} className={input} />
          <p className="text-[12px] text-muted">{t.passwordHint}</p>
          <Feedback />
          <button type="submit" disabled={pending} className={primary}><Spinner /> {t.createAccount}</button>
          <button type="button" onClick={() => reset("login")} className="text-[13px] text-muted hover:text-text">{t.toLogin}</button>
        </form>
      )}

      {(view === "verify" || view === "reset") && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            view === "verify" ? onVerify() : onResetConfirm();
          }}
        >
          <Back to={view === "verify" ? "register" : "forgot"} />
          <h2 className="text-[19px] font-semibold">{view === "verify" ? t.verifyTitle : t.resetTitle}</h2>
          <p className="text-[14px] text-muted">{t.verifySubtitle}</p>
          <label className="text-[13px] font-medium text-muted" htmlFor="auth-code">{t.code}</label>
          <input id="auth-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6}
            required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`${input} text-center text-[20px] tracking-[0.4em]`} />
          {view === "reset" && (
            <>
              <label className="text-[13px] font-medium text-muted" htmlFor="reset-password">{t.newPassword}</label>
              <input id="reset-password" type="password" autoComplete="new-password" required minLength={12}
                value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
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
      )}

      {view === "forgot" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onForgot();
          }}
        >
          <Back to="login" />
          <h2 className="text-[19px] font-semibold">{t.forgotTitle}</h2>
          <p className="text-[14px] text-muted">{t.forgotSubtitle}</p>
          <label className="text-[13px] font-medium text-muted" htmlFor="forgot-email">{t.email}</label>
          <input id="forgot-email" type="email" autoComplete="email" required value={email}
            onChange={(e) => setEmail(e.target.value)} className={input} />
          <Feedback />
          <button type="submit" disabled={pending} className={primary}><Spinner /> {t.sendCode}</button>
        </form>
      )}
    </div>
  );
}
