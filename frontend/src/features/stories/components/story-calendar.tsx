"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

interface StoryCalendarProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  calendarLabel: string;
  previousLabel: string;
  nextLabel: string;
}

const MIN_YEAR = 1990;

function toDate(value: string, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function StoryCalendar({ value, onChange, onClose, calendarLabel, previousLabel, nextLabel }: StoryCalendarProps) {
  const today = useMemo(() => new Date(), []);
  const minMonth = useMemo(() => new Date(MIN_YEAR, 0, 1), []);
  const maxMonth = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);
  const [month, setMonth] = useState(() => {
    const date = toDate(value, today);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const selected = value ? new Date(`${value}T12:00:00`) : null;
  const cells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, i) => {
    const day = i - firstWeekday + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });

  const canPrev = month > minMonth;
  const canNext = month < maxMonth;
  const isFutureDay = (day: number) =>
    month.getFullYear() === today.getFullYear() &&
    month.getMonth() === today.getMonth() &&
    day > today.getDate();

  const selectDay = (day: number) => {
    if (isFutureDay(day)) return;
    const year = month.getFullYear();
    const monthNumber = String(month.getMonth() + 1).padStart(2, "0");
    onChange(`${year}-${monthNumber}-${String(day).padStart(2, "0")}`);
    onClose();
  };

  return (
    <div className="story-calendar story-calendar-full motion-safe:animate-story-state" aria-label={calendarLabel}>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" aria-label={previousLabel} disabled={!canPrev} onClick={() => canPrev && setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="icon-button disabled:opacity-30">
          <ChevronLeft size={18} />
        </button>
        <div className="text-[15px] font-semibold">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </div>
        <button type="button" aria-label={nextLabel} disabled={!canNext} onClick={() => canNext && setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="icon-button disabled:opacity-30">
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted">
        {Array.from({ length: 7 }, (_, index) => <span key={index}>{["S", "M", "T", "W", "T", "F", "S"][index]}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, index) => {
          const isSelected = day !== null && selected?.getFullYear() === month.getFullYear() && selected.getMonth() === month.getMonth() && selected.getDate() === day;
          const disabled = day !== null && isFutureDay(day);
          return day === null ? <span key={index} className="h-9" /> : (
            <button key={index} type="button" disabled={disabled} onClick={() => selectDay(day)} className={`h-9 rounded text-[13px] transition-colors duration-150 ease-lm ${isSelected ? "bg-accent font-semibold text-accent-text" : "hover:bg-surface"} ${disabled ? "opacity-30" : ""}`}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
