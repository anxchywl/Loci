import { useUiStore } from "@/stores/ui-store";

export function currentAuthRedirectTarget(): string {
  if (typeof window === "undefined") return "/";
  const target = new URL(window.location.href);
  const storyId = useUiStore.getState().openStoryId;
  target.searchParams.delete("auth");
  if (storyId) target.searchParams.set("story", storyId);
  // the hash is dropped deliberately: in the mini app it holds Telegram's
  // launch payload (tgWebAppData…), which is both useless as a destination and
  // long enough to blow past the redirect parameter's length limit
  return `${target.pathname}${target.search}`;
}
