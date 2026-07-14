export interface TelegramLaunch {
  initDataRaw: string;
  languageCode: string | undefined;
  startParam: string | undefined;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: {
    user?: { language_code?: string };
    start_param?: string;
  };
  themeParams?: Record<string, string>;
  colorScheme?: string;
  ready?: () => void;
  expand?: () => void;
  onEvent?: (event: string, handler: () => void) => void;
  openTelegramLink?: (url: string) => void;
  openLink?: (url: string) => void;
  switchInlineQuery?: (query: string, choose_chat_types?: string[]) => void;
}

function webApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  return tg ?? null;
}

function launchDataFromLocation(): { initData: string; startParam?: string } {
  if (typeof window === "undefined") return { initData: "" };
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  return {
    initData: hash.get("tgWebAppData") ?? "",
    startParam: hash.get("tgWebAppStartParam") ?? query.get("tgWebAppStartParam") ?? undefined,
  };
}

const THEME_KEYS = [
  "bg_color",
  "secondary_bg_color",
  "text_color",
  "hint_color",
  "button_color",
  "button_text_color",
  "link_color",
] as const;

function applyThemeParams(tg: TelegramWebApp): void {
  const params = tg.themeParams ?? {};
  const root = document.documentElement;
  for (const key of THEME_KEYS) {
    const value = params[key];
    if (value) root.style.setProperty(`--tg-theme-${key.replaceAll("_", "-")}`, value);
  }
  // marks the telegram theme as authoritative so the browser dark-mode fallback steps aside
  root.dataset.tg = "1";
}

export async function initTelegram(): Promise<TelegramLaunch | null> {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const tg = webApp();
    const locationData = launchDataFromLocation();
    const initDataRaw = tg?.initData || locationData.initData;
    if (!initDataRaw) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
      continue;
    }

    if (tg) {
      applyThemeParams(tg);
      tg.onEvent?.("themeChanged", () => applyThemeParams(tg));
      tg.ready?.();
      tg.expand?.();
    }

    return {
      initDataRaw,
      languageCode: tg?.initDataUnsafe?.user?.language_code,
      startParam: tg?.initDataUnsafe?.start_param ?? locationData.startParam,
    };
  }
  return null;
}

export function openTelegramLink(url: string): boolean {
  const tg = webApp();
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
    return true;
  }
  return false;
}

export function openExternalLink(url: string): void {
  const tg = webApp();
  if (tg?.openLink) {
    tg.openLink(url);
    return;
  }
  if (typeof window !== "undefined") {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export function switchInlineQuery(query: string, choose_chat_types?: string[]): boolean {
  const tg = webApp();
  if (tg?.switchInlineQuery) {
    try {
      tg.switchInlineQuery(query, choose_chat_types);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }
  return false;
}
