import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveUserName, type AuthUser } from "@/features/auth/api";
import { EditableName } from "@/features/auth/editable-name";
import { renderWithQuery } from "@/test/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useUiStore } from "@/stores/ui-store";

vi.mock("@/features/auth/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/auth/api")>()),
  updateDisplayName: vi.fn(),
}));

import { updateDisplayName } from "@/features/auth/api";

const baseUser: AuthUser = {
  id: 1,
  username: "loci_mapper",
  first_name: "Aru",
  last_name: "M",
  display_name: null,
  photo_url: null,
  language_code: "en",
};

describe("resolveUserName", () => {
  it("prefers the chosen display name, then provider name, then handle", () => {
    expect(resolveUserName({ ...baseUser, display_name: "Chosen" })).toBe("Chosen");
    expect(resolveUserName(baseUser)).toBe("Aru M");
    expect(
      resolveUserName({ ...baseUser, first_name: null, last_name: null }),
    ).toBe("@loci_mapper");
  });
});

describe("EditableName", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUiStore.setState({ locale: "en" });
    useAuthStore.setState({ user: baseUser, status: "authenticated" });
  });

  it("saves an edited name and reflects it in the session", async () => {
    vi.mocked(updateDisplayName).mockResolvedValue({ ...baseUser, display_name: "New Name" });
    renderWithQuery(<EditableName user={baseUser} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit name" }));
    const input = screen.getByPlaceholderText("Your name");
    fireEvent.change(input, { target: { value: "  New   Name  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // collapses whitespace before sending
    await waitFor(() => expect(updateDisplayName).toHaveBeenCalledWith("New Name"));
    expect(useAuthStore.getState().user?.display_name).toBe("New Name");
  });

  it("does not call the API when the name is unchanged", async () => {
    renderWithQuery(<EditableName user={baseUser} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit name" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(updateDisplayName).not.toHaveBeenCalled();
    // returns to the read view
    expect(screen.getByRole("button", { name: "Edit name" })).toBeInTheDocument();
  });
});
