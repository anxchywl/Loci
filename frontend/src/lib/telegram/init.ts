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
  switchInlineQuery?: (query: string, choose_chat_types?: string[]) => void;
}

function webApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  return tg && tg.initData ? tg : null;
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

export function initTelegram(): TelegramLaunch | null {
  const tg = webApp();
  if (!tg) return null;

  applyThemeParams(tg);
  tg.onEvent?.("themeChanged", () => applyThemeParams(tg));
  tg.ready?.();
  tg.expand?.();

  return {
    initDataRaw: tg.initData,
    languageCode: tg.initDataUnsafe?.user?.language_code,
    startParam: tg.initDataUnsafe?.start_param,
  };
}

export function openTelegramLink(url: string): boolean {
  const tg = webApp();
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
    return true;
  }
  return false;
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
