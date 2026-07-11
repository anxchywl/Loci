"use client";

import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
  title?: string;
  children: ReactNode;
}

export function BottomSheet({ open, onClose, onBack, title, children }: BottomSheetProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
      <button
        aria-label="close"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-sheet bg-bg pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_32px_rgba(0,0,0,0.18)] motion-safe:animate-sheet-up transition-[height,transform] duration-200 ease-lm">
        <div className="sticky top-0 z-10 flex flex-col items-center justify-center bg-bg px-4 pb-3 pt-3">
          <div className="mb-3 h-1.5 w-12 shrink-0 rounded-full bg-border/80" />
          {onBack && (
            <button
              aria-label="back"
              onClick={onBack}
              className="absolute left-4 top-3 flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:text-accent focus-visible:text-accent active:scale-95"
            >
              <ChevronLeft size={24} />
            </button>
          )}
          {title && <div className="text-[17px] font-semibold text-center">{title}</div>}
        </div>
        <div className="px-4 pb-6">{children}</div>
      </div>
    </div>
  );
}
