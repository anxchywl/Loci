import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  ApiError: class extends Error {},
}));
vi.mock("@/lib/telegram/init", () => ({
  isTelegramWebApp: vi.fn(),
  openExternalLink: vi.fn(),
}));

import { startGoogleLink, startGoogleLogin } from "@/features/auth/api";
import { apiFetch } from "@/lib/api";
import { isTelegramWebApp, openExternalLink } from "@/lib/telegram/init";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth?client_id=x";

describe("Google hand-off", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(apiFetch).mockResolvedValue({ authorization_url: AUTH_URL });
  });

  it("opens outside the app in Telegram, where Google rejects the webview", async () => {
    vi.mocked(isTelegramWebApp).mockReturnValue(true);

    await expect(startGoogleLogin("/")).resolves.toBe("external");
    expect(openExternalLink).toHaveBeenCalledWith(AUTH_URL);
  });

  it("uses the same hand-off when linking an account from the mini app", async () => {
    vi.mocked(isTelegramWebApp).mockReturnValue(true);

    await expect(startGoogleLink("/profile")).resolves.toBe("external");
    expect(openExternalLink).toHaveBeenCalledWith(AUTH_URL);
  });

  it("navigates in place in a normal browser", async () => {
    vi.mocked(isTelegramWebApp).mockReturnValue(false);
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });

    await expect(startGoogleLogin("/")).resolves.toBe("same-tab");
    expect(openExternalLink).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith(AUTH_URL);
  });
});
