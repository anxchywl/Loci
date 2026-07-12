"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useMemo, useState } from "react";

interface StoryCalendarProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  calendarLabel: string;
  previousLabel: string;
  nextLabel: string;
  closeLabel: string;
}

function toDate(value: string, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export function StoryCalendar({ value, onChange, onClose, calendarLabel, previousLabel, nextLabel, closeLabel }: StoryCalendarProps) {
  const today = useMemo(() => new Date(), []);
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

  const selectDay = (day: number) => {
    const year = month.getFullYear();
    const monthNumber = String(month.getMonth() + 1).padStart(2, "0");
    onChange(`${year}-${monthNumber}-${String(day).padStart(2, "0")}`);
    onClose();
  };

  return (
    <div className="story-calendar motion-safe:animate-story-state" aria-label={calendarLabel}>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" aria-label={previousLabel} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="icon-button">
          <ChevronLeft size={18} />
        </button>
        <div className="text-[15px] font-semibold">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label={nextLabel} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="icon-button">
            <ChevronRight size={18} />
          </button>
          <button type="button" aria-label={closeLabel} onClick={onClose} className="icon-button">
            <X size={18} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted">
        {Array.from({ length: 7 }, (_, index) => <span key={index}>{["S", "M", "T", "W", "T", "F", "S"][index]}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, index) => {
          const isSelected = day !== null && selected?.getFullYear() === month.getFullYear() && selected.getMonth() === month.getMonth() && selected.getDate() === day;
          return day === null ? <span key={index} className="h-9" /> : (
            <button key={index} type="button" onClick={() => selectDay(day)} className={`h-9 rounded text-[13px] transition-colors duration-150 ease-lm ${isSelected ? "bg-accent font-semibold text-accent-text" : "hover:bg-surface"}`}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
