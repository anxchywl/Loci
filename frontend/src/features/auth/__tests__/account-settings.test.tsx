import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AccountSettings, DeleteAccountIconButton } from "@/features/auth/account-settings";
import { renderWithQuery } from "@/test/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useUiStore } from "@/stores/ui-store";

vi.mock("@/features/auth/api", () => ({
  fetchAuthProviders: vi.fn(),
  eraseAccount: vi.fn(),
  listIdentities: vi.fn(),
  listSessions: vi.fn(),
  logout: vi.fn(),
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
        device_model: "Mac",
        browser: "Chrome",
        browser_version: "137",
        operating_system: "macOS",
        os_version: "10.15.7",
        in_app: false,
      },
    ]);
    vi.mocked(unlinkIdentity).mockResolvedValue();
    vi.mocked(revokeSession).mockResolvedValue();
    vi.mocked(eraseAccount).mockResolvedValue();
  });

  it("takes unlinking through a confirmation step naming the method", async () => {
    renderWithQuery(<AccountSettings />);
    const googleLabel = await screen.findByText("Google");
    const googleRow = googleLabel.closest<HTMLElement>("div.flex.items-center");
    if (!googleRow) throw new Error("google identity row missing");

    fireEvent.click(within(googleRow).getByRole("button", { name: "Remove" }));
    expect(unlinkIdentity).not.toHaveBeenCalled();
    // the step takes over the panel: the sessions list is gone, the method named
    expect(screen.queryByText("Active sessions")).not.toBeInTheDocument();
    expect(screen.getByText("You will no longer be able to sign in this way.")).toBeInTheDocument();
    expect(screen.getByText("Google")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(unlinkIdentity).toHaveBeenCalledOnce());
    expect(vi.mocked(unlinkIdentity).mock.calls[0]?.[0]).toBe("google");
  });

  it("renders current-session device details from the session API", async () => {
    renderWithQuery(<AccountSettings />);

    expect(await screen.findByText("Mac · macOS 10.15.7")).toBeInTheDocument();
    expect(screen.getByText("Chrome 137")).toBeInTheDocument();
    expect(screen.getByText("This device")).toBeInTheDocument();
  });

  it("labels an in-app webview session and hides revoked ones", async () => {
    vi.mocked(listSessions).mockResolvedValue([
      {
        id: "session-phone",
        current: false,
        active: true,
        created_at: now,
        last_used_at: now,
        device_type: "mobile",
        device_model: "SM-A536E",
        browser: "Chrome",
        browser_version: "137",
        operating_system: "Android",
        os_version: "13",
        in_app: true,
      },
      {
        id: "session-gone",
        current: false,
        active: false,
        created_at: now,
        last_used_at: now,
        device_type: "desktop",
        device_model: "Windows PC",
        browser: "Edge",
        browser_version: "120",
        operating_system: "Windows",
        os_version: "10+",
        in_app: false,
      },
    ]);
    renderWithQuery(<AccountSettings />);

    expect(await screen.findByText("SM-A536E · Android 13")).toBeInTheDocument();
    expect(screen.getByText("Chrome 137 · In-app browser")).toBeInTheDocument();
    expect(screen.queryByText("Windows PC · Windows 10+")).not.toBeInTheDocument();
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
        device_model: null,
        browser: "Firefox",
        browser_version: "128",
        operating_system: "Linux",
        os_version: null,
        in_app: false,
      },
    ]);
    renderWithQuery(<AccountSettings />);
    const sessionLabel = await screen.findByText("Computer · Linux");
    const sessionRow = sessionLabel.closest<HTMLElement>("div.flex.items-center");
    if (!sessionRow) throw new Error("session row missing");

    fireEvent.click(within(sessionRow).getByRole("button", { name: "Remove" }));
    // confirmation step first, with the device it is about
    expect(screen.getByText("This device will be signed out immediately.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(revokeSession).toHaveBeenCalledOnce());
    expect(vi.mocked(revokeSession).mock.calls[0]?.[0]).toBe("session-2");
  });

  it("shows a cancelled Google link return for an authenticated account", async () => {
    useAuthStore.setState({ returnNotice: "cancelled" });
    renderWithQuery(<AccountSettings />);

    expect(screen.getByText("Sign-in was cancelled.")).toHaveAttribute("role", "status");
  });

  it("requires the exact phrase before permanently deleting the account", async () => {
    renderWithQuery(<DeleteAccountIconButton />);

    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
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
