import { afterEach, describe, expect, it } from "vitest";

import { initTelegram, isTelegramWebApp } from "./init";

describe("initTelegram", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
    delete (window as Window & { Telegram?: unknown }).Telegram;
  });

  it("uses raw signed launch data from Telegram's URL fragment", async () => {
    const raw = "auth_date=123&hash=server-verified-later";
    window.history.replaceState(
      {},
      "",
      `/#tgWebAppData=${encodeURIComponent(raw)}&tgWebAppStartParam=share-token`,
    );

    const launch = await initTelegram();

    expect(launch?.initDataRaw).toBe(raw);
    expect(launch?.startParam).toBe("share-token");
  });
});

describe("isTelegramWebApp", () => {
  afterEach(() => {
    delete (window as Window & { Telegram?: unknown }).Telegram;
  });

  const setWebApp = (webApp: Record<string, unknown>) => {
    (window as Window & { Telegram?: unknown }).Telegram = { WebApp: webApp };
  };

  it("is false when the script is absent", () => {
    expect(isTelegramWebApp()).toBe(false);
  });

  it("is false in a plain browser, where the script loads but has no launch data", () => {
    // telegram-web-app.js ships on every page and always defines the object
    setWebApp({ initData: "", platform: "unknown" });
    expect(isTelegramWebApp()).toBe(false);
  });

  it("is true when Telegram provides signed launch data", () => {
    setWebApp({ initData: "auth_date=123&hash=abc", platform: "macos" });
    expect(isTelegramWebApp()).toBe(true);
  });

  it("is true when only the platform marks the Telegram client", () => {
    setWebApp({ initData: "", platform: "ios" });
    expect(isTelegramWebApp()).toBe(true);
  });
});
