import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  apiUrl: (path: string) => `https://loci.test/api/v1${path}`,
  ApiError: class extends Error {},
}));
vi.mock("@/lib/telegram/init", () => ({
  isTelegramWebApp: vi.fn(),
  openExternalLink: vi.fn(),
}));

import { startGoogleLink, startGoogleLogin, startTelegramLink } from "@/features/auth/api";
import { apiFetch } from "@/lib/api";
import { isTelegramWebApp, openExternalLink } from "@/lib/telegram/init";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth?client_id=x";
const REDIRECT_URL = "https://loci.test/api/v1/auth/google/redirect?redirect=%2F";

describe("Google hand-off", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockResolvedValue({ authorization_url: AUTH_URL });
  });

  it("sends sign-in straight to the backend redirect, without fetching first", () => {
    vi.mocked(isTelegramWebApp).mockReturnValue(false);
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });

    expect(startGoogleLogin("/")).toBe("same-tab");
    expect(apiFetch).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith(REDIRECT_URL);
  });

  it("opens outside the app in Telegram, where Google rejects the webview", () => {
    vi.mocked(isTelegramWebApp).mockReturnValue(true);

    expect(startGoogleLogin("/")).toBe("external");
    expect(openExternalLink).toHaveBeenCalledWith(REDIRECT_URL);
  });

  it("uses the same hand-off when linking an account from the mini app", async () => {
    vi.mocked(isTelegramWebApp).mockReturnValue(true);

    await expect(startGoogleLink("/profile")).resolves.toBe("external");
    expect(openExternalLink).toHaveBeenCalledWith(AUTH_URL);
  });
});

describe("Telegram link start", () => {
  it("asks the backend for a one-time deep link", async () => {
    vi.mocked(apiFetch).mockResolvedValue({ url: "https://t.me/bot?start=tok", expires_in: 600 });

    await expect(startTelegramLink()).resolves.toEqual({
      url: "https://t.me/bot?start=tok",
      expires_in: 600,
    });
    expect(apiFetch).toHaveBeenCalledWith("/auth/telegram/link/start", { method: "POST" });
  });
});
