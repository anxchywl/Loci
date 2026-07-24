import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountSettings } from "@/features/auth/account-settings";
import { renderWithQuery } from "@/test/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useUiStore } from "@/stores/ui-store";

vi.mock("@/features/auth/api", () => ({
  fetchAuthProviders: vi.fn(),
  eraseAccount: vi.fn(),
  listIdentities: vi.fn(),
  listSessions: vi.fn(),
  logout: vi.fn(),
  logoutEverywhere: vi.fn(),
  revokeSession: vi.fn(),
  startEmailLink: vi.fn(),
  startGoogleLink: vi.fn(),
  unlinkIdentity: vi.fn(),
  verifyEmailLink: vi.fn(),
}));

import {
  fetchAuthProviders,
  eraseAccount,
  listIdentities,
  listSessions,
  revokeSession,
  unlinkIdentity,
} from "@/features/auth/api";

const now = "2026-07-24T00:00:00Z";

describe("AccountSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ locale: "en" });
    useAuthStore.setState({ returnNotice: null });
    vi.mocked(fetchAuthProviders).mockResolvedValue({ google: true, email: true });
    vi.mocked(listIdentities).mockResolvedValue([
      { provider: "google", email: "person@example.com", created_at: now, last_used_at: now },
      { provider: "email", email: "person@example.com", created_at: now, last_used_at: now },
    ]);
    vi.mocked(listSessions).mockResolvedValue([
      {
        id: "session-1",
        current: true,
        active: true,
        created_at: now,
        last_used_at: now,
        device_type: "desktop",
        browser: "Chrome",
        operating_system: "macOS",
      },
    ]);
    vi.mocked(unlinkIdentity).mockResolvedValue();
    vi.mocked(revokeSession).mockResolvedValue();
    vi.mocked(eraseAccount).mockResolvedValue();
  });

  it("requires inline confirmation before unlinking a provider", async () => {
    renderWithQuery(<AccountSettings />);
    const googleLabel = await screen.findByText("Google");
    const googleRow = googleLabel.closest<HTMLElement>("div.flex.items-center");
    if (!googleRow) throw new Error("google identity row missing");

    fireEvent.click(within(googleRow).getByRole("button", { name: "Remove" }));
    expect(unlinkIdentity).not.toHaveBeenCalled();
    expect(within(googleRow).getByRole("button", { name: "Cancel" })).toBeInTheDocument();

    fireEvent.click(within(googleRow).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(unlinkIdentity).toHaveBeenCalledOnce());
    expect(vi.mocked(unlinkIdentity).mock.calls[0]?.[0]).toBe("google");
  });

  it("renders current-session metadata from the session API", async () => {
    renderWithQuery(<AccountSettings />);

    expect(await screen.findByText("Chrome · macOS")).toBeInTheDocument();
    expect(screen.getByText("This device")).toBeInTheDocument();
  });

  it("revokes another active session", async () => {
    vi.mocked(listSessions).mockResolvedValue([
      {
        id: "session-2",
        current: false,
        active: true,
        created_at: now,
        last_used_at: now,
        device_type: "desktop",
        browser: "Firefox",
        operating_system: "Linux",
      },
    ]);
    renderWithQuery(<AccountSettings />);
    const sessionLabel = await screen.findByText("Firefox · Linux");
    const sessionRow = sessionLabel.closest<HTMLElement>("div.flex.items-center");
    if (!sessionRow) throw new Error("session row missing");

    fireEvent.click(within(sessionRow).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(revokeSession).toHaveBeenCalledOnce());
    expect(vi.mocked(revokeSession).mock.calls[0]?.[0]).toBe("session-2");
  });

  it("shows a cancelled Google link return for an authenticated account", async () => {
    useAuthStore.setState({ returnNotice: "cancelled" });
    renderWithQuery(<AccountSettings />);

    expect(screen.getByText("Sign-in was cancelled.")).toHaveAttribute("role", "status");
  });

  it("requires the exact phrase before permanently deleting the account", async () => {
    renderWithQuery(<AccountSettings />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete account" }));
    const confirmation = screen.getByLabelText(/Type this phrase to continue/);
    const submit = screen.getByRole("button", { name: "Delete permanently" });
    expect(submit).toBeDisabled();

    fireEvent.change(confirmation, { target: { value: "delete my account" } });
    expect(submit).toBeDisabled();
    fireEvent.change(confirmation, { target: { value: "DELETE MY ACCOUNT" } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(eraseAccount).toHaveBeenCalledWith("DELETE MY ACCOUNT"));
  });
});
