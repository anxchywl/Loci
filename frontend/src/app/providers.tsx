"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";

import { ThemeProvider } from "@/components/theme-provider";
import { applyAccountSignal } from "@/features/auth/hooks";
import { subscribeToAccountSignals } from "@/lib/auth/cross-tab";
import { useAuthStore } from "@/stores/auth-store";
import { useUiStore } from "@/stores/ui-store";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (failureCount, error) => {
              const status = (error as { status?: number }).status;
              return status !== 401 && status !== 403 && status !== 404 && failureCount < 1;
            },
            staleTime: 15_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            refetchOnMount: false,
          },
          mutations: { retry: false },
        },
      }),
  );
  // the query cache is account-scoped state: a switch has to leave nothing of the
  // previous account behind, including replies still in flight for it
  useEffect(() => {
    let seen = useAuthStore.getState().accountEpoch;
    return useAuthStore.subscribe((state) => {
      if (state.accountEpoch === seen) return;
      seen = state.accountEpoch;
      void queryClient.cancelQueries();
      queryClient.clear();
      useUiStore.getState().resetAccountState();
    });
  }, [queryClient]);

  // a sibling tab switched accounts, logged out, or had its session revoked
  useEffect(
    () => subscribeToAccountSignals((signal) => void applyAccountSignal(signal)),
    [],
  );

  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        void queryClient.invalidateQueries({ refetchType: "active" });
      }
    };
    const onVisibility = () => { if (document.visibilityState === "visible") revalidate(); };
    const onOnline = () => revalidate();
    const interval = window.setInterval(revalidate, 30_000);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
  }, [queryClient]);

  return <QueryClientProvider client={queryClient}><ThemeProvider />{children}</QueryClientProvider>;
}
