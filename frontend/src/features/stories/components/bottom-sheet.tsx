"use client";

import { ChevronLeft } from "lucide-react";
import { type ReactNode, useState } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
  title?: string;
  isEditing?: boolean;
  children: ReactNode;
}

export function BottomSheet({
  open,
  onClose,
  onBack,
  title,
  isEditing = false,
  children,
}: BottomSheetProps) {
  const [startY, setStartY] = useState<number | null>(null);
  const [dragY, setDragY] = useState(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY === null) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY;
    if (diff > 0) {
      setDragY(diff);
    }
  };

  const handleTouchEnd = () => {
    if (dragY > 60) {
      onClose();
    }
    setStartY(null);
    setDragY(0);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
      <button
        aria-label="close"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div
        className={`absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-sheet bg-bg pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_32px_rgba(0,0,0,0.18)] motion-safe:animate-sheet-up transition-[transform,max-height] duration-250 ease-lm ${isEditing ? "keyboard-sheet-editing" : ""}`}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
      >
        <div 
          className="sticky top-0 z-10 flex flex-col items-center justify-center bg-bg pt-3"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="mb-2 h-1 w-10 shrink-0 rounded-full bg-border/80" />
          {(title || onBack) ? (
            <div className={`keyboard-sheet-title-row relative flex w-full min-h-[32px] items-center justify-center pb-3 ${isEditing ? "keyboard-sheet-title-row-editing" : ""}`}>
              {onBack && (
                <button
                  aria-label="back"
                  onClick={onBack}
                  className="absolute left-2 flex h-8 w-8 items-center justify-center bg-transparent text-muted transition-colors hover:text-accent focus-visible:text-accent active:scale-95"
                >
                  <ChevronLeft size={24} />
                </button>
              )}
              {title && (
                <div className={`keyboard-sheet-title px-12 text-[17px] font-semibold text-center ${isEditing ? "keyboard-sheet-title-hidden" : ""}`}>
                  {title}
                </div>
              )}
            </div>
          ) : (
            <div className="pb-1" />
          )}
        </div>
        <div className="px-4 pb-5">{children}</div>
      </div>
    </div>
  );
}
