import { apiFetch } from "@/lib/api";
import { isTelegramWebApp, openExternalLink } from "@/lib/telegram/init";

export interface AuthUser {
  id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  /** user-chosen name; overrides the provider's first/last name when set */
  display_name: string | null;
  photo_url: string | null;
  language_code: string | null;
  is_admin?: boolean;
}

/** The name to show for a user: their chosen name, else the provider's, else a handle. */
export function resolveUserName(user: AuthUser): string {
  const provided = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return user.display_name || provided || (user.username ? `@${user.username}` : "");
}

export interface TokenResponse {
  access_token: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
  user: AuthUser;
}

export interface IdentitySummary {
  provider: "telegram" | "google" | "email";
  email: string | null;
  created_at: string;
  last_used_at: string;
}

export interface SessionSummary {
  id: string;
  current: boolean;
  active: boolean;
  created_at: string;
  last_used_at: string;
  device_type: string | null;
  device_model?: string | null;
  browser: string | null;
  browser_version?: string | null;
  operating_system: string | null;
  os_version?: string | null;
  /** opened inside a native client's webview (e.g. Telegram) rather than a browser */
  in_app?: boolean;
}

export interface AuthProviders {
  google: boolean;
  email: boolean;
}

export function fetchAuthProviders(): Promise<AuthProviders> {
  return apiFetch<AuthProviders>("/auth/providers");
}

export function postTelegramAuth(initData: string): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/telegram", {
    method: "POST",
    body: JSON.stringify({ init_data: initData }),
  });
}

export function fetchCurrentUser(): Promise<AuthUser> {
  return apiFetch<AuthUser>("/profile/me");
}

export function updateDisplayName(displayName: string): Promise<AuthUser> {
  return apiFetch<AuthUser>("/profile/me", {
    method: "PATCH",
    body: JSON.stringify({ display_name: displayName }),
  });
}

export function registerEmail(email: string, password: string): Promise<{ detail: string }> {
  return apiFetch("/auth/email/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function resendEmailCode(email: string): Promise<{ detail: string }> {
  return apiFetch("/auth/email/resend", { method: "POST", body: JSON.stringify({ email }) });
}

export function verifyEmail(email: string, code: string): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/email/verify", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export function loginEmail(email: string, password: string): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/email/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function requestPasswordReset(email: string): Promise<{ detail: string }> {
  return apiFetch("/auth/password/reset/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function confirmPasswordReset(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  return apiFetch("/auth/password/reset/confirm", {
    method: "POST",
    body: JSON.stringify({ email, code, new_password: newPassword }),
  });
}

/** where the provider's page was opened, which decides what the UI says next */
export type ProviderHandoff = "external" | "same-tab";

function openProvider(authorizationUrl: string): ProviderHandoff {
  // Google refuses OAuth inside embedded webviews (disallowed_useragent) and the
  // mini app is one, so in Telegram the URL goes to openLink — which hands it to
  // a real browser. The flow finishes there and the app picks the result up when
  // it regains focus.
  if (isTelegramWebApp()) {
    openExternalLink(authorizationUrl);
    return "external";
  }
  window.location.assign(authorizationUrl);
  return "same-tab";
}

export async function startGoogleLogin(redirect: string): Promise<ProviderHandoff> {
  const { authorization_url } = await apiFetch<{ authorization_url: string }>(
    `/auth/google/start?redirect=${encodeURIComponent(redirect)}`,
  );
  return openProvider(authorization_url);
}

export async function startGoogleLink(redirect: string): Promise<ProviderHandoff> {
  const { authorization_url } = await apiFetch<{ authorization_url: string }>(
    `/auth/google/link/start?redirect=${encodeURIComponent(redirect)}`,
  );
  return openProvider(authorization_url);
}

export function listIdentities(): Promise<IdentitySummary[]> {
  return apiFetch<IdentitySummary[]>("/auth/identities");
}

export function unlinkIdentity(provider: string): Promise<void> {
  return apiFetch(`/auth/identities/${provider}`, { method: "DELETE" });
}

export function startEmailLink(email: string, password: string): Promise<{ detail: string }> {
  return apiFetch("/auth/identities/email/start", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function verifyEmailLink(email: string, code: string): Promise<void> {
  return apiFetch("/auth/identities/email/verify", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export function listSessions(): Promise<SessionSummary[]> {
  return apiFetch<SessionSummary[]>("/auth/sessions");
}

export function revokeSession(id: string): Promise<void> {
  return apiFetch(`/auth/sessions/${id}`, { method: "DELETE" });
}

export function logout(): Promise<void> {
  return apiFetch("/auth/logout", { method: "POST" });
}

export function eraseAccount(confirmation: string): Promise<void> {
  return apiFetch("/auth/account", {
    method: "DELETE",
    body: JSON.stringify({ confirmation }),
  });
}
