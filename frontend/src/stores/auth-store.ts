import { create } from "zustand";

import type { AuthUser } from "@/features/auth/api";
import { bumpAuthEpoch } from "@/lib/api";

export type AuthStatus = "loading" | "authenticated" | "signed-out";
/**
 * `telegram-failed` means a signed launch was present but could not be
 * authenticated. It is deliberately not a silent restore: the cookie session may
 * belong to a different account than the one now launching the mini app.
 */
export type AuthReturnNotice = "cancelled" | "error" | "telegram-failed" | null;

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  inTelegram: boolean;
  returnNotice: AuthReturnNotice;
  /**
   * Increments whenever the resolved account changes. Everything holding
   * account-scoped state (the query cache, story/compose UI state) watches this
   * and drops what it has, so one account's data can never outlive the switch.
   */
  accountEpoch: number;
  setSession: (user: AuthUser | null, status: AuthStatus) => void;
  /** patch fields on the signed-in user (e.g. after a profile edit); no-op when signed out */
  updateUser: (patch: Partial<AuthUser>) => void;
  setInTelegram: (value: boolean) => void;
  setReturnNotice: (notice: AuthReturnNotice) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  user: null,
  inTelegram: false,
  returnNotice: null,
  accountEpoch: 0,
  setSession: (user, status) =>
    set((state) => {
      const previousId = state.user?.id ?? null;
      const nextId = user?.id ?? null;
      if (previousId === nextId) return { user, status };
      return { user, status, accountEpoch: bumpAuthEpoch() };
    }),
  updateUser: (patch) => set((state) => (state.user ? { user: { ...state.user, ...patch } } : {})),
  setInTelegram: (value) => set({ inTelegram: value }),
  setReturnNotice: (returnNotice) => set({ returnNotice }),
}));
