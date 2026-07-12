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

export function postTelegramAuth(initData: string): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/auth/telegram", {
    method: "POST",
    body: JSON.stringify({ init_data: initData }),
  });
}

export function fetchCurrentUser(): Promise<AuthUser> {
  return apiFetch<AuthUser>("/profile/me");
}
