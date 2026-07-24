import { fireEvent, screen, waitFor } from "@testing-library/react";
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

import {
  fetchAuthProviders,
  loginEmail,
  registerEmail,
  requestPasswordReset,
  startGoogleLogin,
} from "@/features/auth/api";

describe("AuthPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(registerEmail).mockResolvedValue({ detail: "accepted" });
    vi.mocked(fetchAuthProviders).mockResolvedValue({ google: true, email: true });
    vi.mocked(requestPasswordReset).mockResolvedValue({ detail: "accepted" });
    vi.mocked(startGoogleLogin).mockResolvedValue();
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

  it("preserves query, hash, and open-story intent for Google", async () => {
    window.history.replaceState(null, "", "/profile?lang=en&auth=cancelled#account");
    useUiStore.setState({ openStoryId: "story-1" });
    renderWithQuery(<AuthPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Continue with Google" }));

    await waitFor(() =>
      expect(startGoogleLogin).toHaveBeenCalledWith(
        "/profile?lang=en&story=story-1#account",
      ),
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
});
