import { beforeEach, describe, expect, it } from "vitest";

import { currentAuthRedirectTarget } from "@/features/auth/redirect";
import { useUiStore } from "@/stores/ui-store";

function goTo(url: string) {
  window.history.replaceState(null, "", url);
}

describe("currentAuthRedirectTarget", () => {
  beforeEach(() => {
    useUiStore.setState({ openStoryId: null });
    goTo("/");
  });

  it("keeps the path and query but drops the auth notice", () => {
    goTo("/profile?auth=cancelled&tab=devices");
    expect(currentAuthRedirectTarget()).toBe("/profile?tab=devices");
  });

  it("carries the open story so sign-in returns to it", () => {
    useUiStore.setState({ openStoryId: "story-7" });
    expect(currentAuthRedirectTarget()).toBe("/?story=story-7");
  });

  it("drops Telegram's launch hash, which would exceed the redirect length limit", () => {
    // the real mini-app hash is ~2kB of tgWebAppData; the API caps redirect at 512
    goTo(`/#tgWebAppData=${"x".repeat(900)}&tgWebAppVersion=9.6`);
    const target = currentAuthRedirectTarget();
    expect(target).toBe("/");
    expect(target.length).toBeLessThan(512);
  });
});
