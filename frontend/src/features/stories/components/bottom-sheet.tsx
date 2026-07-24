"use client";

import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  onBack?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  // aria-labels; user-facing, so callers pass localized strings
  backLabel?: string;
  prevLabel?: string;
  nextLabel?: string;
  onHeightChange?: (height: number) => void;
  navigationAtBottom?: boolean;
  title?: string;
  subtitle?: string;
  titleColor?: string;
  isEditing?: boolean;
  desktopModal?: boolean;
  scrollKey?: string | null;
  children: ReactNode;
}

export function swipeDirection(deltaX: number, deltaY: number): "prev" | "next" | null {
  if (Math.abs(deltaX) <= 60 || Math.abs(deltaX) <= Math.abs(deltaY)) return null;
  return deltaX < 0 ? "next" : "prev";
}

export function BottomSheet({
  open,
  onClose,
  onBack,
  onPrev,
  onNext,
  backLabel = "back",
  prevLabel = "previous story",
  nextLabel = "next story",
  onHeightChange,
  navigationAtBottom = false,
  title,
  subtitle,
  titleColor,
  isEditing = false,
  desktopModal = false,
  scrollKey,
  children,
}: BottomSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [startY, setStartY] = useState<number | null>(null);
  const [startX, setStartX] = useState<number | null>(null);

  useEffect(() => {
    if (scrollKey !== undefined) {
      scrollRef.current?.scrollTo({ top: 0 });
    }
  }, [scrollKey]);
  useEffect(() => {
    if (!onHeightChange || !scrollRef.current) return;
    const report = () => onHeightChange(scrollRef.current?.getBoundingClientRect().height ?? 0);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(scrollRef.current);
    return () => observer.disconnect();
  }, [onHeightChange]);
  const [dragY, setDragY] = useState(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    setStartY(e.touches[0].clientY);
    setStartX(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY === null) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY;
    if (diff > 0) {
      setDragY(diff);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const endX = e.changedTouches[0]?.clientX;
    const deltaX = startX !== null && endX !== undefined ? endX - startX : 0;
    const direction = swipeDirection(deltaX, dragY);
    if (direction === "next") {
      onNext?.();
    } else if (direction === "prev") {
      onPrev?.();
    } else if (dragY > 60) {
      onClose();
    }
    setStartY(null);
    setStartX(null);
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
        ref={scrollRef}
        className={`absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-sheet bg-bg pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_32px_rgba(0,0,0,0.18)] motion-safe:animate-sheet-up transition-[transform,max-height] duration-250 ease-lm lg:inset-0 lg:m-auto lg:max-h-[80dvh] lg:w-[calc(100%-2rem)] lg:max-w-[640px] lg:rounded-sheet lg:shadow-[0_12px_40px_rgba(0,0,0,0.18)] ${desktopModal ? "lg:motion-safe:animate-dialog-in" : ""} ${isEditing ? "keyboard-sheet-editing" : ""}`}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
      >
        <div 
          className="sticky top-0 z-10 flex flex-col items-center justify-center bg-bg pt-3"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="mb-3 h-1.5 w-20 shrink-0 rounded-full bg-border/80 lg:hidden" />
          {!navigationAtBottom && (title || onBack || onPrev || onNext) ? (
            <div className={`keyboard-sheet-title-row relative flex w-full min-h-[32px] items-center justify-center pb-3 ${isEditing ? "keyboard-sheet-title-row-editing" : ""}`}>
              {/* left cluster: history back (ArrowLeft, only when adjacent nav is
                  also present so the two reads distinctly) + geographic prev */}
              <div className="absolute left-2 flex items-center">
                {onBack && (
                  <button
                    aria-label={backLabel}
                    onClick={onBack}
                    className="flex h-8 w-8 items-center justify-center bg-transparent text-muted transition-colors hover:text-accent focus-visible:text-accent active:scale-95"
                  >
                    {onPrev || onNext ? <ArrowLeft size={22} /> : <ChevronLeft size={24} />}
                  </button>
                )}
                {onPrev && (
                  <button
                    aria-label={prevLabel}
                    onClick={onPrev}
                    className="flex h-8 w-8 items-center justify-center bg-transparent text-muted transition-colors hover:text-accent focus-visible:text-accent active:scale-95"
                  >
                    <ChevronLeft size={24} />
                  </button>
                )}
              </div>
              {title && (
                <div className={`keyboard-sheet-title px-12 text-[17px] font-semibold text-center ${isEditing ? "keyboard-sheet-title-hidden" : ""}`}>
                  {title}
                </div>
              )}
              {onNext && (
                <button
                  aria-label={nextLabel}
                  onClick={onNext}
                  className="absolute right-2 flex h-8 w-8 items-center justify-center bg-transparent text-muted transition-colors hover:text-accent focus-visible:text-accent active:scale-95"
                >
                  <ChevronRight size={24} />
                </button>
              )}
            </div>
          ) : (
            <div className="pb-1" />
          )}
        </div>
        <div className={navigationAtBottom ? "px-4 pb-2" : "px-4 pb-5"}>{children}</div>
        {navigationAtBottom && (title || onBack || onPrev || onNext) && (
          <div className="sticky bottom-0 z-10 flex min-h-14 items-center justify-center border-t border-border bg-bg px-2 pb-[env(safe-area-inset-bottom)] pt-2">
            <div className="absolute left-2 flex items-center">
              {onBack && (
                <button
                  aria-label={backLabel}
                  onClick={onBack}
                  className="flex h-9 w-9 items-center justify-center text-muted transition-colors hover:text-accent focus-visible:text-accent active:scale-95"
                >
                  <ArrowLeft size={21} />
                </button>
              )}
              {onPrev && (
                <button
                  aria-label={prevLabel}
                  onClick={onPrev}
                  className="flex h-9 w-9 items-center justify-center text-muted transition-colors hover:text-accent focus-visible:text-accent active:scale-95"
                >
                  <ChevronLeft size={24} />
                </button>
              )}
            </div>
            {title && (
              <div className="max-w-[72%] px-10 text-center">
                <div className="break-words text-[15px] font-semibold leading-tight" style={titleColor ? { color: titleColor } : undefined}>{title}</div>
                {subtitle && <div className="mt-0.5 break-words text-[12px] font-normal leading-tight text-muted">{subtitle}</div>}
              </div>
            )}
            {onNext && (
              <button
                aria-label={nextLabel}
                onClick={onNext}
                className="absolute right-2 flex h-9 w-9 items-center justify-center text-muted transition-colors hover:text-accent focus-visible:text-accent active:scale-95"
              >
                <ChevronRight size={24} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
