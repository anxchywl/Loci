import { apiFetch } from "@/lib/api";

export interface AuthUser {
  id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  language_code: string | null;
  is_admin?: boolean;
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
  browser: string | null;
  operating_system: string | null;
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

export async function startGoogleLogin(redirect: string): Promise<void> {
  const { authorization_url } = await apiFetch<{ authorization_url: string }>(
    `/auth/google/start?redirect=${encodeURIComponent(redirect)}`,
  );
  window.location.assign(authorization_url);
}

export async function startGoogleLink(redirect: string): Promise<void> {
  const { authorization_url } = await apiFetch<{ authorization_url: string }>(
    `/auth/google/link/start?redirect=${encodeURIComponent(redirect)}`,
  );
  window.location.assign(authorization_url);
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

export function logoutEverywhere(): Promise<void> {
  return apiFetch("/auth/logout-all", { method: "POST" });
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
