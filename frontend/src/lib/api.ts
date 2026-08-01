const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

/**
 * For the few endpoints the browser navigates to instead of fetching. Always
 * absolute: a relative API base is fine for `location.assign` but not for the
 * Telegram client, which needs a full URL to hand to an external browser.
 */
export function apiUrl(path: string): string {
  const url = `${BASE_URL}${path}`;
  if (typeof window === "undefined" || /^https?:\/\//.test(url)) return url;
  return new URL(url, window.location.origin).toString();
}

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;
let authEpoch = 0;

/**
 * Bumped whenever the resolved account changes (a different `users.id`, or a
 * different Telegram identity launching the mini app). Requests carry the epoch
 * they started under, so a reply to the previous account can never be read as if
 * it belonged to the new one.
 */
export function bumpAuthEpoch(): number {
  accessToken = null;
  // a refresh already in flight was started for the previous account
  refreshPromise = null;
  return ++authEpoch;
}

export function getAuthEpoch(): number {
  return authEpoch;
}

/** the account changed while this request was in flight; its result is discarded */
export class StaleSessionError extends Error {
  constructor() {
    super("session changed while the request was in flight");
  }
}

function csrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const pair = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith("csrf_token="));
  return pair ? decodeURIComponent(pair.slice("csrf_token=".length)) : null;
}

function csrfHeaders(): Record<string, string> {
  const token = csrfToken();
  return token ? { "X-CSRF-Token": token } : {};
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  const epoch = authEpoch;
  refreshPromise = (async () => {
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders(),
      });
      // a token minted for the previous account must never become the current one
      if (authEpoch !== epoch) return false;
      if (!response.ok) {
        accessToken = null;
        return false;
      }
      const body = (await response.json()) as { access_token: string };
      accessToken = body.access_token;
      return true;
    } catch {
      if (authEpoch === epoch) accessToken = null;
      return false;
    }
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const epoch = authEpoch;
  const request = (): Promise<Response> =>
    fetch(`${BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...csrfHeaders(),
        ...init.headers,
      },
    });

  let response = await request();
  if (authEpoch !== epoch) throw new StaleSessionError();
  if (response.status === 401 && accessToken) {
    // avoid replaying a late previous-account request with the new token
    if (authEpoch !== epoch) throw new StaleSessionError();
    const refreshed = await refreshAccessToken();
    if (authEpoch !== epoch) throw new StaleSessionError();
    if (refreshed) {
      response = await request();
      if (authEpoch !== epoch) throw new StaleSessionError();
    }
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: string };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // non-json error body
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204 || response.status === 202) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
