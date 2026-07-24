import { afterEach, describe, expect, it, vi } from "vitest";

import { refreshAccessToken, setAccessToken } from "@/lib/api";

describe("auth cookie requests", () => {
  afterEach(() => {
    document.cookie = "csrf_token=; Max-Age=0; path=/";
    setAccessToken(null);
    vi.unstubAllGlobals();
  });

  it("sends the readable CSRF cookie as a refresh header", async () => {
    document.cookie = "csrf_token=browser-csrf-token; path=/";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "access" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(await refreshAccessToken()).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/refresh"),
      expect.objectContaining({
        headers: { "X-CSRF-Token": "browser-csrf-token" },
      }),
    );
  });
});
