"use client";

import {
  Bookmark,
  BookOpen,
  ChevronLeft,
  Flame,
  Info,
  MapPin,
  Menu,
  Navigation,
  Search,
  Settings,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { useDict } from "@/lib/i18n/use-dict";

interface DesktopSidebarProps {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  onTrending: () => void;
  onNearby: () => void;
  onSearchFocus: () => void;
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
      {chevron && <ChevronLeft size={16} className="rotate-180 text-muted opacity-50" />}
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

type Panel = "saved" | "my-stories" | "profile" | "settings" | "about" | null;

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
}: DesktopSidebarProps) {
  const t = useDict();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [activePanel, setActivePanel] = useState<Panel>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activePanel) setActivePanel(null);
        else if (open) onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose, activePanel]);

  useEffect(() => {
    if (!open) {
      // reset panel when sidebar closes
      const id = setTimeout(() => setActivePanel(null), 230);
      return () => clearTimeout(id);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const id = setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 50);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, onClose]);

  const panelLabels: Record<Exclude<Panel, null>, string> = {
    saved: t.savedStories,
    "my-stories": t.myStories,
    profile: t.profile,
    settings: t.settings,
    about: t.about,
  };

  return (
    <>
    {/* Mini icon strip — visible when sidebar is closed */}
    <div
      aria-hidden={open}
      className={[
        "pointer-events-none fixed left-0 top-0 z-40 hidden h-full w-12 select-none flex-col items-center py-2 lg:flex",
        "bg-bg border-r border-border",
        "transition-opacity duration-[230ms] ease-lm",
        open ? "opacity-0" : "opacity-100 pointer-events-auto",
      ].join(" ")}
    >
      <button
        aria-label="Open menu"
        onClick={onOpen}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface"
      >
        <Menu size={20} />
      </button>
      <div className="my-2 w-6 h-px bg-border" />
      <div className="flex flex-col items-center gap-1">
        <button title={t.searchPlaceholder} onClick={() => { onSearchFocus(); }} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface">
          <Search size={18} />
        </button>
        <button title={t.trending} onClick={onTrending} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface">
          <Flame size={18} />
        </button>
        <button title={t.nearby} onClick={onNearby} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface">
          <Navigation size={18} />
        </button>
      </div>
      <div className="my-2 w-6 h-px bg-border" />
      <div className="flex flex-col items-center gap-1">
        <button title={t.savedStories} onClick={onOpen} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface">
          <Bookmark size={18} />
        </button>
        <button title={t.myStories} onClick={onOpen} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface">
          <BookOpen size={18} />
        </button>
      </div>
      <div className="flex-1" />
      <Link href="/profile" title={t.profile} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface">
        <UserRound size={18} />
      </Link>
    </div>

    <div
      ref={sidebarRef}
      role="navigation"
      aria-label="Main navigation"
      aria-hidden={!open}
      className={[
        "pointer-events-none fixed left-0 top-0 z-40 hidden h-full w-[320px] select-none flex-col overflow-hidden",
        "bg-bg shadow-[2px_0_12px_rgba(0,0,0,0.08)] lg:flex",
        "rounded-r-[16px]",
        "transition-transform duration-[230ms] ease-lm will-change-transform",
        open ? "translate-x-0 pointer-events-auto" : "-translate-x-full",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Sliding container: main + panel side-by-side, translate to show active */}
      <div
        className="flex h-full w-[640px] transition-transform duration-[230ms] ease-lm"
        style={{ transform: activePanel ? "translateX(-320px)" : "translateX(0)" }}
      >
        {/* ── Main nav (left slot) ── */}
        <div className="flex h-full w-[320px] shrink-0 flex-col">
          {/* Logo */}
          <div className="flex h-14 items-center gap-2.5 px-5">
            <MapPin size={20} className="text-accent" />
            <span className="text-[17px] font-semibold tracking-tight">{t.appName}</span>
          </div>

          <div className="mx-4 h-px bg-border" />

          <nav className="flex-1 overflow-y-auto px-2 py-3">
            <div className="space-y-0.5">
              <NavItem
                icon={<Search size={18} />}
                label={t.searchPlaceholder}
                onClick={() => { onSearchFocus(); onClose(); }}
              />
              <NavItem
                icon={<Flame size={18} />}
                label={t.trending}
                onClick={() => { onTrending(); onClose(); }}
              />
              <NavItem
                icon={<Navigation size={18} />}
                label={t.nearby}
                onClick={() => { onNearby(); onClose(); }}
              />
            </div>

            <div className="mx-1 my-3 h-px bg-border" />

            <div className="space-y-0.5">
              <NavItem
                icon={<Bookmark size={18} />}
                label={t.savedStories}
                chevron
                onClick={() => setActivePanel("saved")}
              />
              <NavItem
                icon={<BookOpen size={18} />}
                label={t.myStories}
                chevron
                onClick={() => setActivePanel("my-stories")}
              />
              <NavItem
                icon={<UserRound size={18} />}
                label={t.profile}
                chevron
                onClick={() => setActivePanel("profile")}
              />
            </div>
          </nav>

          <div className="mx-4 h-px bg-border" />

          <div className="px-2 py-3">
            <div className="space-y-0.5">
              <NavItem
                icon={<Settings size={18} />}
                label={t.settings}
                chevron
                onClick={() => setActivePanel("settings")}
              />
              <NavItem
                icon={<Info size={18} />}
                label={t.about}
                chevron
                onClick={() => setActivePanel("about")}
              />
            </div>
          </div>
        </div>

        {/* ── Panel (right slot) ── */}
        <div className="flex h-full w-[320px] shrink-0 flex-col">
          {/* Panel header */}
          <div className="flex h-14 items-center gap-1 px-3">
            <button
              onClick={() => setActivePanel(null)}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[14px] font-medium text-muted transition-colors hover:bg-surface"
            >
              <ChevronLeft size={18} />
              <span>{activePanel ? panelLabels[activePanel] : ""}</span>
            </button>
          </div>

          <div className="mx-4 h-px bg-border" />

          <div className="flex flex-1 flex-col overflow-y-auto px-2 py-3">
            {activePanel === "saved" && (
              <PanelPlaceholder label={t.savedStories} />
            )}
            {activePanel === "my-stories" && (
              <PanelPlaceholder label={t.myStories} />
            )}
            {activePanel === "profile" && (
              <div className="space-y-0.5">
                <NavItem icon={<UserRound size={18} />} label={t.profile} href="/profile" onClick={onClose} />
              </div>
            )}
            {activePanel === "settings" && (
              <PanelPlaceholder label={t.settings} />
            )}
            {activePanel === "about" && (
              <PanelPlaceholder label={t.about} />
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
