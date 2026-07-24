const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;

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
  refreshPromise = (async () => {
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders(),
      });
      if (!response.ok) {
        accessToken = null;
        return false;
      }
      const body = (await response.json()) as { access_token: string };
      accessToken = body.access_token;
      return true;
    } catch {
      accessToken = null;
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
  if (response.status === 401 && accessToken) {
    if (await refreshAccessToken()) {
      response = await request();
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
