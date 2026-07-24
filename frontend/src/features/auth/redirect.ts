import { useUiStore } from "@/stores/ui-store";

export function currentAuthRedirectTarget(): string {
  if (typeof window === "undefined") return "/";
  const target = new URL(window.location.href);
  const storyId = useUiStore.getState().openStoryId;
  target.searchParams.delete("auth");
  if (storyId) target.searchParams.set("story", storyId);
  return `${target.pathname}${target.search}${target.hash}`;
}
