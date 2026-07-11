"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";

function isMobileKeyboardTarget() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches && window.innerWidth <= 820;
}

export function useMobileFocusMode() {
  const [focusedSection, setFocusedSection] = useState<string | null>(null);
  const [mobileKeyboardTarget, setMobileKeyboardTarget] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const blurTimer = useRef<number | null>(null);
  const switchTimer = useRef<number | null>(null);

  useEffect(() => {
    const updateKeyboardTarget = () => setMobileKeyboardTarget(isMobileKeyboardTarget());

    updateKeyboardTarget();
    window.addEventListener("resize", updateKeyboardTarget);
    window.visualViewport?.addEventListener("resize", updateKeyboardTarget);

    return () => {
      window.removeEventListener("resize", updateKeyboardTarget);
      window.visualViewport?.removeEventListener("resize", updateKeyboardTarget);
    };
  }, []);

  const handleFocus = useCallback(
    (section: string) => (event: React.FocusEvent<HTMLElement>) => {
      if (!mobileKeyboardTarget) return;
      const target = event.currentTarget;

      if (blurTimer.current) {
        window.clearTimeout(blurTimer.current);
        blurTimer.current = null;
      }

      const isEnteringFocusMode = focusedSection === null;
      if (!isEnteringFocusMode && focusedSection !== section) {
        setIsSwitching(true);
        if (switchTimer.current) window.clearTimeout(switchTimer.current);
        switchTimer.current = window.setTimeout(() => setIsSwitching(false), 50);
      }

      setFocusedSection(section);

      if (isEnteringFocusMode) {
        window.setTimeout(() => {
          if (target.isConnected) {
            target.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
          }
        }, 150);
      }
    },
    [focusedSection, mobileKeyboardTarget],
  );

  const handleBlur = useCallback(() => {
    blurTimer.current = window.setTimeout(() => {
      const active = document.activeElement;
      if (!mobileKeyboardTarget || !active || !active.closest("[data-story-form]")) {
        setFocusedSection(null);
        setIsSwitching(false);
      }
    }, 120);
  }, [mobileKeyboardTarget]);

  const clearFocus = useCallback(() => {
    if (blurTimer.current) {
      window.clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    window.setTimeout(() => {
      setFocusedSection(null);
      setIsSwitching(false);
    }, 200);
  }, []);

  return {
    focusedSection,
    isFocusMode: mobileKeyboardTarget && Boolean(focusedSection),
    isSwitching,
    clearFocus,
    onFieldBlur: handleBlur,
    fieldFocusProps: (section: string) => ({
      "data-active-section": focusedSection === section ? "true" : undefined,
      onFocus: handleFocus(section),
    }),
    sectionClass: (section: string) =>
      mobileKeyboardTarget && focusedSection && focusedSection !== section
        ? "keyboard-form-section-collapsed"
        : "keyboard-form-section-active",
  };
}
