"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
      <button
        aria-label="close"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-sheet bg-bg pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_32px_rgba(0,0,0,0.18)] motion-safe:animate-sheet-up">
        <div className="sticky top-0 z-10 flex items-center justify-between bg-bg px-4 pb-2 pt-3">
          <div className="text-[17px] font-semibold">{title}</div>
          <button
            aria-label="close"
            onClick={onClose}
            className="rounded p-1.5 text-muted transition-[color,transform] duration-150 ease-lm hover:text-accent focus-visible:text-accent active:scale-95"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-4 pb-6">{children}</div>
      </div>
    </div>
  );
}
