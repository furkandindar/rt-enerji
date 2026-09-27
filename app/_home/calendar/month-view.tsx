"use client";

import { useMemo } from "react";
import { addDays, differenceInCalendarDays, format, isSameDay, isSameMonth } from "date-fns";
import { tr } from "date-fns/locale";

import { cn } from "@/lib/utils";

import { type CalendarEvent, dayKey, eventsOnDay, showAsStyle } from "./calendar-utils";
import { EventPopover } from "./event-popover";

const MAX_CHIPS = 3;

interface MonthViewProps {
  anchor: Date;
  start: Date;
  end: Date;
  events: CalendarEvent[];
  today: Date;
  now: number;
  onOpenDay: (day: Date) => void;
  className?: string;
}

// Kartın genişliğine göre (@container): genişte etiketli etkinlik çipleri,
// darda nokta göstergesi — hücreye dokunmak o günün görünümünü açar.
export function MonthView({ anchor, start, end, events, today, now, onOpenDay, className }: MonthViewProps) {
  const days = useMemo(
    () => Array.from({ length: differenceInCalendarDays(end, start) }, (_, i) => addDays(start, i)),
    [start, end]
  );
  const weeks = days.length / 7;

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="grid grid-cols-7 border-b">
        {days.slice(0, 7).map((d) => (
          <div key={dayKey(d)} className="py-1.5 text-center text-[11px] font-medium text-muted-foreground">
            {format(d, "EEE", { locale: tr })}
          </div>
        ))}
      </div>

      <div
        className="grid flex-1 grid-cols-7"
        style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}
      >
        {days.map((day, i) => {
          const dayEvents = eventsOnDay(events, day);
          const isToday = isSameDay(day, today);
          const outside = !isSameMonth(day, anchor);
          const more = dayEvents.length > MAX_CHIPS ? dayEvents.length - (MAX_CHIPS - 1) : 0;
          const visible = more > 0 ? dayEvents.slice(0, MAX_CHIPS - 1) : dayEvents;

          return (
            <div
              key={dayKey(day)}
              className={cn(
                "relative flex min-h-14 min-w-0 flex-col gap-0.5 overflow-hidden p-1 @lg:min-h-24",
                i % 7 !== 6 && "border-r",
                i < days.length - 7 && "border-b",
                outside && "bg-muted/30"
              )}
            >
              {/* Hücrenin tamamı o günü açar; çipler bunun üstünde kendi popover'ını açar. */}
              <button
                type="button"
                onClick={() => onOpenDay(day)}
                aria-label={`${format(day, "d MMMM EEEE", { locale: tr })}${dayEvents.length ? `, ${dayEvents.length} etkinlik` : ""} — gün görünümünü aç`}
                className="absolute inset-0 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
              />
              <span
                className={cn(
                  "pointer-events-none relative mx-auto flex size-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums @lg:mx-0",
                  isToday
                    ? "bg-primary font-semibold text-primary-foreground"
                    : outside
                      ? "text-muted-foreground/60"
                      : "font-medium"
                )}
              >
                {format(day, "d")}
              </span>

              {/* Dar: nokta */}
              <div aria-hidden className="pointer-events-none relative flex justify-center gap-0.5 @lg:hidden">
                {dayEvents.slice(0, 3).map((ev) => (
                  <span key={ev.id} className={cn("size-1.5 rounded-full", showAsStyle(ev.showAs).dot)} />
                ))}
              </div>

              {/* Geniş: çip */}
              <div className="pointer-events-none relative hidden min-w-0 flex-col gap-0.5 @lg:flex">
                {visible.map((ev) => {
                  const style = showAsStyle(ev.showAs);
                  const isPast = !ev.isAllDay && new Date(ev.endUtc).getTime() <= now;
                  return (
                    <EventPopover key={ev.id} event={ev}>
                      {ev.isAllDay ? (
                        <button
                          type="button"
                          className={cn(
                            "pointer-events-auto truncate rounded border-l-[3px] px-1.5 py-px text-left text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                            style.block
                          )}
                        >
                          {ev.subject}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={cn(
                            "pointer-events-auto flex min-w-0 items-center gap-1 rounded px-1 py-px text-left text-[11px] outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60",
                            isPast && "opacity-60"
                          )}
                        >
                          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", style.dot)} />
                          <span className="hidden shrink-0 tabular-nums text-muted-foreground @2xl:inline">
                            {format(new Date(ev.startUtc), "HH:mm")}
                          </span>
                          <span className="truncate">{ev.subject}</span>
                        </button>
                      )}
                    </EventPopover>
                  );
                })}
                {more > 0 && (
                  <button
                    type="button"
                    onClick={() => onOpenDay(day)}
                    className="pointer-events-auto truncate rounded px-1 text-left text-[11px] font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    +{more} daha
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
