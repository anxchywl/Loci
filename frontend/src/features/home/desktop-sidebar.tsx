"use client";

import {
  Bookmark,
  BookOpen,
  Flame,
  Info,
  MapPin,
  Navigation,
  Search,
  Settings,
  UserRound,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
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

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
  chevron?: boolean;
}

function NavItem({ icon, label, onClick, href, chevron }: NavItemProps) {
  const base =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium text-text transition-colors duration-100 hover:bg-surface active:bg-surface";

  const content = (
    <>
      <span className="text-muted">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {chevron && <ChevronRight size={15} className="text-muted opacity-40" />}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={base} onClick={onClick}>
        {content}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={`${base} w-full`}>
      {content}
    </button>
  );
}

function PanelPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
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

  const panelLabels: Record<Exclude<Panel, null>, string> = {
    saved: t.savedStories,
    "my-stories": t.myStories,
    profile: t.profile,
    settings: t.settings,
    about: t.about,
  };

  return (
    <>
      {/* Mini icon strip — always visible on desktop, sits behind the full sidebar */}
      <div
        aria-hidden={open}
        className={[
          "fixed left-0 top-0 z-30 hidden h-full w-12 select-none flex-col items-center lg:flex",
          "bg-bg border-r border-border",
          "transition-opacity duration-[230ms] ease-lm",
          open ? "opacity-0 pointer-events-none" : "opacity-100",
        ].join(" ")}
      >
        {/* Spacer for the toggle button at top-3 (12px) + h-9 (36px) */}
        <div className="mt-3 h-9 w-9 shrink-0" />
        <div className="my-2 w-6 h-px bg-border" />
        <div className="flex flex-col items-center gap-0.5">
          <button title={t.searchPlaceholder} onClick={onSearchFocus} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface">
            <Search size={17} />
          </button>
          <button title={t.trending} onClick={onTrending} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface">
            <Flame size={17} />
          </button>
          <button title={t.nearby} onClick={onNearby} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface">
            <Navigation size={17} />
          </button>
        </div>
        <div className="my-2 w-6 h-px bg-border" />
        <div className="flex flex-col items-center gap-0.5">
          <button title={t.savedStories} onClick={onOpen} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface">
            <Bookmark size={17} />
          </button>
          <button title={t.myStories} onClick={onOpen} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface">
            <BookOpen size={17} />
          </button>
        </div>
        <div className="flex-1" />
        <div className="mb-2 flex flex-col items-center gap-0.5">
          <Link href="/profile" title={t.profile} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface">
            <UserRound size={17} />
          </Link>
        </div>
      </div>

      {/* Click-outside overlay — sits between map (z-0) and sidebar (z-40) */}
      {open && (
        <div
          className="fixed inset-0 z-[39] hidden lg:block"
          onClick={onClose}
        />
      )}

      {/* Full sidebar */}
      <div
        ref={sidebarRef}
        role="navigation"
        aria-label="Main navigation"
        aria-hidden={!open}
        className={[
          "fixed left-0 top-0 z-40 hidden h-full w-[320px] select-none flex-col overflow-hidden",
          "bg-bg shadow-[2px_0_12px_rgba(0,0,0,0.08)] lg:flex",
          "rounded-r-[16px]",
          "transition-transform duration-[230ms] ease-lm will-change-transform",
          open ? "translate-x-0" : "-translate-x-full pointer-events-none",
        ].join(" ")}
      >
        {/* Shared header — shows Loci brand or panel name */}
        <div className="flex h-14 shrink-0 items-center pl-14 pr-4">
          <div className="relative flex-1 overflow-hidden h-6">
            {/* Loci brand */}
            <div className={[
              "absolute inset-0 flex items-center gap-1.5 transition-all duration-[230ms] ease-lm",
              activePanel ? "opacity-0 -translate-x-3 pointer-events-none" : "opacity-100 translate-x-0",
            ].join(" ")}>
              <MapPin size={16} className="text-accent shrink-0" />
              <span className="text-[15px] font-semibold tracking-tight">{t.appName}</span>
            </div>
            {/* Panel name */}
            <div className={[
              "absolute inset-0 flex items-center transition-all duration-[230ms] ease-lm",
              activePanel ? "opacity-100 translate-x-0" : "opacity-0 translate-x-3 pointer-events-none",
            ].join(" ")}>
              <span className="text-[15px] font-semibold">
                {activePanel ? panelLabels[activePanel] : ""}
              </span>
            </div>
          </div>
        </div>

        <div className="mx-4 h-px bg-border shrink-0" />

        {/* Sliding content */}
        <div className="flex-1 overflow-hidden">
          <div
            className="flex h-full transition-transform duration-[230ms] ease-lm will-change-transform"
            style={{
              width: "640px",
              transform: activePanel ? "translateX(-320px)" : "translateX(0)",
            }}
          >
            {/* ── Main nav ── */}
            <div className="flex h-full w-[320px] shrink-0 flex-col">
              <nav className="flex-1 overflow-y-auto px-2 py-3">
                <div className="space-y-0.5">
                  <NavItem icon={<Search size={18} />} label={t.searchPlaceholder} onClick={() => { onSearchFocus(); onClose(); }} />
                  <NavItem icon={<Flame size={18} />} label={t.trending} onClick={() => { onTrending(); onClose(); }} />
                  <NavItem icon={<Navigation size={18} />} label={t.nearby} onClick={() => { onNearby(); onClose(); }} />
                </div>

                <div className="mx-1 my-3 h-px bg-border" />

                <div className="space-y-0.5">
                  <NavItem icon={<Bookmark size={18} />} label={t.savedStories} chevron onClick={() => onSetActivePanel("saved")} />
                  <NavItem icon={<BookOpen size={18} />} label={t.myStories} chevron onClick={() => onSetActivePanel("my-stories")} />
                </div>
              </nav>

              <div className="mx-4 h-px bg-border shrink-0" />

              <div className="px-2 py-3 shrink-0">
                <div className="space-y-0.5">
                  <NavItem icon={<UserRound size={18} />} label={t.profile} chevron onClick={() => onSetActivePanel("profile")} />
                  <NavItem icon={<Settings size={18} />} label={t.settings} chevron onClick={() => onSetActivePanel("settings")} />
                  <NavItem icon={<Info size={18} />} label={t.about} chevron onClick={() => onSetActivePanel("about")} />
                </div>
              </div>
            </div>

            {/* ── Panel content ── */}
            <div className="flex h-full w-[320px] shrink-0 flex-col overflow-y-auto px-2 py-3">
              {activePanel === "saved" && <PanelPlaceholder label={t.savedStories} />}
              {activePanel === "my-stories" && <PanelPlaceholder label={t.myStories} />}
              {activePanel === "profile" && (
                <div className="space-y-0.5">
                  <NavItem icon={<UserRound size={18} />} label={t.profile} href="/profile" onClick={onClose} />
                </div>
              )}
              {activePanel === "settings" && <PanelPlaceholder label={t.settings} />}
              {activePanel === "about" && <PanelPlaceholder label={t.about} />}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
