import { create } from "zustand";

import type { AuthUser } from "@/features/auth/api";

export type AuthStatus = "loading" | "authenticated" | "signed-out";
export type AuthReturnNotice = "cancelled" | "error" | null;

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  inTelegram: boolean;
  returnNotice: AuthReturnNotice;
  setSession: (user: AuthUser | null, status: AuthStatus) => void;
  setInTelegram: (value: boolean) => void;
  setReturnNotice: (notice: AuthReturnNotice) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  user: null,
  inTelegram: false,
  returnNotice: null,
  setSession: (user, status) => set({ user, status }),
  setInTelegram: (value) => set({ inTelegram: value }),
  setReturnNotice: (returnNotice) => set({ returnNotice }),
}));
