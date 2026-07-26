import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthPanel } from "@/features/auth/auth-panel";
import { useAuthStore } from "@/stores/auth-store";
import { useUiStore } from "@/stores/ui-store";
import { renderWithQuery } from "@/test/utils";

vi.mock("@/features/auth/api", () => ({
  confirmPasswordReset: vi.fn(),
  fetchAuthProviders: vi.fn(),
  loginEmail: vi.fn(),
  registerEmail: vi.fn(),
  requestPasswordReset: vi.fn(),
  resendEmailCode: vi.fn(),
  startGoogleLogin: vi.fn(),
  verifyEmail: vi.fn(),
}));

vi.mock("@/lib/telegram/init", () => ({
  openTelegramLink: vi.fn(),
  openExternalLink: vi.fn(),
}));

import {
  fetchAuthProviders,
  loginEmail,
  registerEmail,
  requestPasswordReset,
  startGoogleLogin,
} from "@/features/auth/api";
import { openExternalLink, openTelegramLink } from "@/lib/telegram/init";

describe("AuthPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(registerEmail).mockResolvedValue({ detail: "accepted" });
    vi.mocked(fetchAuthProviders).mockResolvedValue({ google: true, email: true });
    vi.mocked(requestPasswordReset).mockResolvedValue({ detail: "accepted" });
    vi.mocked(startGoogleLogin).mockResolvedValue("same-tab");
    window.history.replaceState(null, "", "/profile");
    useAuthStore.setState({
      status: "signed-out",
      user: null,
      inTelegram: false,
      returnNotice: null,
    });
    useUiStore.setState({ locale: "en", openStoryId: null });
  });

  it("shows a cancelled provider return instead of silently discarding it", () => {
    useAuthStore.setState({ returnNotice: "cancelled" });
    renderWithQuery(<AuthPanel />);

    expect(screen.getByRole("status")).toHaveTextContent("Sign-in was cancelled.");
  });

  it("uses a non-submitting back button inside the login form", () => {
    renderWithQuery(<AuthPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with email" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(loginEmail).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue with email" })).toBeInTheDocument();
  });

  it("normalizes authentication fields without blocking password symbols", async () => {
    vi.mocked(loginEmail).mockRejectedValue(new Error("stop after request"));
    renderWithQuery(<AuthPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with email" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "  person @example.com " },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: " \u200bvalid ' OR 1=1 password" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(loginEmail).toHaveBeenCalledWith(
      "person@example.com",
      "valid ' OR 1=1 password",
    ));
  });

  it("moves the email flow into a host sheet instead of opening a dialog", () => {
    const sheet = {
      setView: vi.fn(),
      transition: vi.fn((apply: () => void) => apply()),
    };
    const onViewChange = vi.fn();
    renderWithQuery(
      <AuthPanel useDialogForEmail sheet={sheet} onViewChange={onViewChange} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Continue with email" }));

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(sheet.transition).toHaveBeenCalledOnce();
    expect(sheet.setView).toHaveBeenCalledWith(expect.objectContaining({ title: "Sign in" }));
    expect(onViewChange).toHaveBeenCalledWith(true);

    const loginSheetView = sheet.setView.mock.calls.at(-1)?.[0];
    act(() => loginSheetView?.onBack());

    expect(screen.getByRole("button", { name: "Continue with email" })).toBeInTheDocument();
    expect(sheet.setView).toHaveBeenLastCalledWith(null);
    expect(onViewChange).toHaveBeenLastCalledWith(false);
  });

  it("moves Google into the host sheet before starting its handoff", async () => {
    const sheet = {
      setView: vi.fn(),
      transition: vi.fn((apply: () => void) => apply()),
    };
    renderWithQuery(<AuthPanel useDialogForEmail sheet={sheet} />);

    fireEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));

    expect(sheet.setView).toHaveBeenCalledWith(expect.objectContaining({
      title: "Continue with Google",
    }));
    await waitFor(() => expect(startGoogleLogin).toHaveBeenCalledOnce());
  });

  it("preserves query and open-story intent for Google, without the hash", async () => {
    // the hash carries Telegram's launch payload in the mini app, which the API
    // rejects on length — nothing in the app routes on it
    window.history.replaceState(null, "", "/profile?lang=en&auth=cancelled#account");
    useUiStore.setState({ openStoryId: "story-1" });
    renderWithQuery(<AuthPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));

    await waitFor(() =>
      expect(startGoogleLogin).toHaveBeenCalledWith("/profile?lang=en&story=story-1"),
    );
  });

  it("moves registration to an accessible code form with resend cooldown", async () => {
    renderWithQuery(<AuthPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with email" }));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "person@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "a-long-test-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(registerEmail).toHaveBeenCalledOnce());
    const code = await screen.findByLabelText("Verification code");
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    expect(code).toHaveAttribute("minlength", "6");
    expect(screen.getByRole("button", { name: "Resend in 60s" })).toBeDisabled();
  });

  it("moves password recovery to code and new-password inputs", async () => {
    renderWithQuery(<AuthPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with email" }));
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "person@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    await screen.findByRole("heading", { name: "Set a new password" });
    expect(screen.getByLabelText("Verification code")).toHaveAttribute(
      "autocomplete",
      "one-time-code",
    );
    expect(screen.getByLabelText("New password")).toHaveAttribute(
      "autocomplete",
      "new-password",
    );
  });

  it("hides Google when the server has not configured it", async () => {
    vi.mocked(fetchAuthProviders).mockResolvedValue({ google: false, email: true });
    renderWithQuery(<AuthPanel />);

    expect(await screen.findByRole("button", { name: "Continue with email" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue with Google" })).not.toBeInTheDocument();
  });

  it("opens Telegram @loci_app_bot when clicking Continue with Telegram", async () => {
    vi.mocked(openTelegramLink).mockReturnValue(false);
    renderWithQuery(<AuthPanel />);

    const button = await screen.findByRole("button", { name: "Continue with Telegram" });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);

    expect(openTelegramLink).toHaveBeenCalledWith("https://t.me/loci_app_bot");
    expect(openExternalLink).toHaveBeenCalledWith("https://t.me/loci_app_bot");
  });
});
