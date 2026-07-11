"use client";

import {
  Bookmark,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Flame,
  Info,
  MapPin,
  Menu,
  Navigation,
  Search,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef } from "react";

import { useDict } from "@/lib/i18n/use-dict";

export type Panel = "saved" | "my-stories" | "profile" | "settings" | "about" | null;

interface DesktopSidebarProps {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  onTrending: () => void;
  onNearby: () => void;
  onSearchFocus: () => void;
  activePanel: Panel;
  onSetActivePanel: (p: Panel) => void;
}

interface ItemProps {
  icon: React.ReactNode;
  label: string;
  open: boolean;
  onClick: () => void;
  chevron?: boolean;
}

function Item({ icon, label, open: sidebarOpen, onClick, chevron }: ItemProps) {
  return (
    <button
      onClick={onClick}
      className="mx-1 flex w-[calc(100%-8px)] items-center rounded-lg py-2.5 text-left transition-colors duration-100 hover:bg-surface active:bg-surface"
    >
      <span className="flex w-10 shrink-0 items-center justify-center text-muted">
        {icon}
      </span>
      <span className={[
        "flex-1 whitespace-nowrap text-[14px] font-medium text-text transition-opacity duration-[230ms]",
        sidebarOpen ? "opacity-100" : "opacity-0",
      ].join(" ")}>
        {label}
      </span>
      {chevron && (
        <ChevronRight size={15} className={[
          "mr-2 shrink-0 text-muted opacity-40 transition-opacity duration-[230ms]",
          sidebarOpen ? "opacity-40" : "opacity-0",
        ].join(" ")} />
      )}
    </button>
  );
}

function PanelPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-12 text-center">
      <span className="text-[13px] text-muted">{label}</span>
    </div>
  );
}

export function DesktopSidebar({
  open,
  onClose,
  onOpen,
  onTrending,
  onNearby,
  onSearchFocus,
  activePanel,
  onSetActivePanel,
}: DesktopSidebarProps) {
  const t = useDict();
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activePanel) onSetActivePanel(null);
        else if (open) onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose, activePanel, onSetActivePanel]);

  const handleToggle = () => {
    if (activePanel) { onSetActivePanel(null); return; }
    if (open) { onClose(); } else { onOpen(); }
  };

  const panelLabels: Record<Exclude<Panel, null>, string> = {
    saved: t.savedStories,
    "my-stories": t.myStories,
    profile: t.profile,
    settings: t.settings,
    about: t.about,
  };

  return (
    <>
      {/* Click-outside overlay */}
      {open && (
        <div className="fixed inset-0 z-[39] hidden lg:block" onClick={onClose} />
      )}

      {/* Single expanding sidebar */}
      <div
        ref={sidebarRef}
        role="navigation"
        aria-label="Main navigation"
        className={[
          "fixed left-0 top-0 z-40 hidden h-full select-none flex-col overflow-hidden lg:flex",
          "bg-bg border-r border-border",
          "transition-[width,box-shadow,border-radius] duration-[230ms] ease-lm will-change-[width]",
          open
            ? "w-[320px] shadow-[2px_0_12px_rgba(0,0,0,0.08)] rounded-r-2xl border-r-0"
            : "w-12 shadow-none rounded-r-none",
        ].join(" ")}
      >
        {/* Inner content always 320px wide; clipped when sidebar is narrow */}
        <div className="flex h-full w-[320px] flex-col">

          {/* ── Header ── */}
          <div className="flex h-14 shrink-0 items-center">
            {/* Toggle button — icon centered in the 48px strip */}
            <button
              aria-label={activePanel ? "Back" : open ? t.cancel : "Menu"}
              onClick={handleToggle}
              className="ml-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text transition-colors hover:bg-surface"
            >
              <span className={[
                "absolute transition-all duration-[200ms]",
                (!open && !activePanel) ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-90 scale-75",
              ].join(" ")}>
                <Menu size={18} />
              </span>
              <span className={[
                "absolute transition-all duration-[200ms]",
                (open && !activePanel) ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-75",
              ].join(" ")}>
                <X size={18} />
              </span>
              <span className={[
                "absolute transition-all duration-[200ms]",
                activePanel ? "opacity-100 scale-100 translate-x-0" : "opacity-0 scale-75 translate-x-2",
              ].join(" ")}>
                <ChevronLeft size={18} />
              </span>
            </button>

            {/* Brand / panel name crossfade */}
            <div className="relative ml-2 h-6 flex-1 overflow-hidden">
              <div className={[
                "absolute inset-0 flex items-center gap-1.5 transition-all duration-[230ms] ease-lm",
                activePanel ? "opacity-0 -translate-x-3 pointer-events-none" : "opacity-100 translate-x-0",
              ].join(" ")}>
                <MapPin size={15} className="shrink-0 text-accent" />
                <span className="whitespace-nowrap text-[15px] font-semibold tracking-tight">{t.appName}</span>
              </div>
              <div className={[
                "absolute inset-0 flex items-center transition-all duration-[230ms] ease-lm",
                activePanel ? "opacity-100 translate-x-0" : "opacity-0 translate-x-3 pointer-events-none",
              ].join(" ")}>
                <span className="whitespace-nowrap text-[15px] font-semibold">
                  {activePanel ? panelLabels[activePanel] : ""}
                </span>
              </div>
            </div>
          </div>

          <div className="mx-3 h-px shrink-0 bg-border" />

          {/* ── Sliding content area ── */}
          <div className="flex-1 overflow-hidden">
            <div
              className="flex h-full transition-transform duration-[230ms] ease-lm will-change-transform"
              style={{ width: "640px", transform: activePanel ? "translateX(-320px)" : "translateX(0)" }}
            >
              {/* Main nav */}
              <div className="flex h-full w-[320px] shrink-0 flex-col">
                <nav className="flex-1 overflow-y-auto py-2">
                  <div className="space-y-0.5">
                    <Item icon={<Search size={17} />} label={t.searchPlaceholder} open={open}
                      onClick={() => { onSearchFocus(); onClose(); }} />
                    <Item icon={<Flame size={17} />} label={t.trending} open={open}
                      onClick={() => { onTrending(); onClose(); }} />
                    <Item icon={<Navigation size={17} />} label={t.nearby} open={open}
                      onClick={() => { onNearby(); onClose(); }} />
                  </div>

                  <div className="mx-3 my-2 h-px bg-border" />

                  <div className="space-y-0.5">
                    <Item icon={<Bookmark size={17} />} label={t.savedStories} open={open} chevron
                      onClick={() => onSetActivePanel("saved")} />
                    <Item icon={<BookOpen size={17} />} label={t.myStories} open={open} chevron
                      onClick={() => onSetActivePanel("my-stories")} />
                  </div>
                </nav>

                <div className="mx-3 h-px shrink-0 bg-border" />

                <div className="shrink-0 py-2">
                  <div className="space-y-0.5">
                    <Item icon={<UserRound size={17} />} label={t.profile} open={open} chevron
                      onClick={() => onSetActivePanel("profile")} />
                    <Item icon={<Settings size={17} />} label={t.settings} open={open} chevron
                      onClick={() => onSetActivePanel("settings")} />
                    <Item icon={<Info size={17} />} label={t.about} open={open} chevron
                      onClick={() => onSetActivePanel("about")} />
                  </div>
                </div>
              </div>

              {/* Panel content */}
              <div className="flex h-full w-[320px] shrink-0 flex-col overflow-y-auto py-2 px-2">
                {activePanel === "saved" && <PanelPlaceholder label={t.savedStories} />}
                {activePanel === "my-stories" && <PanelPlaceholder label={t.myStories} />}
                {activePanel === "profile" && <PanelPlaceholder label={t.profile} />}
                {activePanel === "settings" && <PanelPlaceholder label={t.settings} />}
                {activePanel === "about" && <PanelPlaceholder label={t.about} />}
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
