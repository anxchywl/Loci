"use client";

import {
  Bookmark,
  Flame,
  Info,
  MapPin,
  Navigation,
  Search,
  Settings,
  UserRound,
  BookOpen,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { useDict } from "@/lib/i18n/use-dict";

interface DesktopSidebarProps {
  open: boolean;
  onClose: () => void;
  onTrending: () => void;
  onNearby: () => void;
  onSearchFocus: () => void;
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  href?: string;
}

function NavItem({ icon, label, onClick, href }: NavItemProps) {
  const base =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium text-text transition-colors duration-100 hover:bg-surface active:bg-surface";

  if (href) {
    return (
      <Link href={href} className={base} onClick={onClick}>
        <span className="text-muted">{icon}</span>
        {label}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={base}>
      <span className="text-muted">{icon}</span>
      {label}
    </button>
  );
}

export function DesktopSidebar({
  open,
  onClose,
  onTrending,
  onNearby,
  onSearchFocus,
}: DesktopSidebarProps) {
  const t = useDict();
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // delay so the toggle button click doesn't immediately close it
    const id = setTimeout(() => document.addEventListener("mousedown", handleClickOutside), 50);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, onClose]);

  return (
    <div
      ref={sidebarRef}
      role="navigation"
      aria-label="Main navigation"
      aria-hidden={!open}
      className={[
        "pointer-events-none fixed left-0 top-0 z-40 hidden h-full w-[320px] select-none flex-col",
        "bg-bg shadow-[2px_0_12px_rgba(0,0,0,0.08)] lg:flex",
        "rounded-r-[16px]",
        "transition-transform duration-[230ms] ease-lm will-change-transform",
        open ? "translate-x-0 pointer-events-auto" : "-translate-x-full",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2.5 px-5">
        <MapPin size={20} className="text-accent" />
        <span className="text-[17px] font-semibold tracking-tight">{t.appName}</span>
      </div>

      <div className="mx-4 h-px bg-border" />

      {/* Main nav */}
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
            href="/profile"
            onClick={onClose}
          />
          <NavItem
            icon={<BookOpen size={18} />}
            label={t.myStories}
            href="/profile"
            onClick={onClose}
          />
          <NavItem
            icon={<UserRound size={18} />}
            label={t.profile}
            href="/profile"
            onClick={onClose}
          />
        </div>
      </nav>

      <div className="mx-4 h-px bg-border" />

      {/* Bottom nav */}
      <div className="px-2 py-3">
        <div className="space-y-0.5">
          <NavItem icon={<Settings size={18} />} label={t.settings} onClick={onClose} />
          <NavItem icon={<Info size={18} />} label={t.about} onClick={onClose} />
        </div>
      </div>
    </div>
  );
}
