"use client";

import { useEffect } from "react";

import { useUiStore } from "@/stores/ui-store";

export function ThemeProvider() {
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);
  return null;
}
