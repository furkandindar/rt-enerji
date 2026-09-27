"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { format, isSameDay, isWeekend, startOfDay } from "date-fns";
import { tr } from "date-fns/locale";

import { cn } from "@/lib/utils";

import {
  type CalendarEvent,
  dayKey,
  eventsOnDay,
  layoutTimedEvents,
  showAsStyle,
} from "./calendar-utils";
import { EventPopover } from "./event-popover";

const HOUR_PX = 44;
const DAY_START_HOUR = 8;
const MAX_ALL_DAY_CHIPS = 2;
/** Bundan kısa bloklarda başlık ve saat tek satıra sığdırılır. */
const COMPACT_BLOCK_PX = 36;

interface TimeGridViewProps {
  days: Date[];
  events: CalendarEvent[];
  today: Date;
  now: number;
  /** Hafta görünümünde gün başlığına tıklayınca o günün görünümüne geç */
  onOpenDay?: (day: Date) => void;
  className?: string;
}

export function TimeGridView({ days, events, today, now, onOpenDay, className }: TimeGridViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isSingleDay = days.length === 1;

  // Açılışta mesai başına (08:00) kaydır; yükseklik ne kadar el veriyorsa oradan
  // aşağısı görünür. Yalnız mount'ta — haftalar arası gezinirken kullanıcının
  // kaydırdığı yer korunur. -8px: 08:00 etiketi yapışkan başlığın altında kalmasın.
  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = DAY_START_HOUR * HOUR_PX - 8;
  }, []);

  const columns = useMemo(
    () =>
      days.map((day) => ({
        day,
        allDay: eventsOnDay(events, day).filter((ev) => ev.isAllDay),
        timed: layoutTimedEvents(events, day),
      })),
    [days, events]
  );
  const hasAllDay = columns.some((c) => c.allDay.length > 0);
  const nowTop = ((now - startOfDay(new Date(now)).getTime()) / 3_600_000) * HOUR_PX;

  return (
    <div ref={scrollRef} className={cn("relative overflow-y-auto overscroll-contain", className)}>
      {/* Gün başlıkları + tüm gün satırı kaydırmada üstte kalır */}
      <div className="sticky top-0 z-30 border-b bg-card">
        <div className="flex">
          <div className="w-12 shrink-0" />
          {columns.map(({ day }) => {
            const isToday = isSameDay(day, today);
            const header = (
              <>
                <span
                  className={cn(
                    "text-[11px] font-medium",
                    isToday ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {format(day, isSingleDay ? "EEEE" : "EEE", { locale: tr })}
                </span>
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full text-base tabular-nums",
                    isToday ? "bg-primary font-semibold text-primary-foreground" : "font-medium"
                  )}
                >
                  {format(day, "d")}
                </span>
              </>
            );
            const headerClass = cn(
              "flex min-w-0 flex-1 flex-col items-center gap-0.5 py-1.5",
              isSingleDay && "items-start pl-2"
            );
            return onOpenDay && !isSingleDay ? (
              <button
                key={dayKey(day)}
                type="button"
                onClick={() => onOpenDay(day)}
                className={cn(
                  headerClass,
                  "rounded-md outline-none transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
                )}
                aria-label={`${format(day, "d MMMM EEEE", { locale: tr })} — gün görünümünü aç`}
              >
                {header}
              </button>
            ) : (
              <div key={dayKey(day)} className={headerClass}>
                {header}
              </div>
            );
          })}
        </div>

        {hasAllDay && (
          <div className="flex border-t">
            <div className="flex w-12 shrink-0 items-start justify-end pr-1.5 pt-1.5 text-[10px] leading-none text-muted-foreground">
              Tüm gün
            </div>
            {columns.map(({ day, allDay }) => {
              // Tek gün görünümünde hepsi gösterilir; haftada fazlası o güne yönlendirir.
              const hidden = isSingleDay ? 0 : allDay.length - MAX_ALL_DAY_CHIPS;
              const visible = hidden > 0 ? allDay.slice(0, MAX_ALL_DAY_CHIPS - 1) : allDay;
              return (
                <div key={dayKey(day)} className="flex min-w-0 flex-1 flex-col gap-0.5 border-l p-0.5">
                  {visible.map((ev) => (
                    <EventPopover key={ev.id} event={ev}>
                      <button
                        type="button"
                        className={cn(
                          "truncate rounded border-l-[3px] px-1.5 py-0.5 text-left text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                          showAsStyle(ev.showAs).block
                        )}
                      >
                        {ev.subject}
                      </button>
                    </EventPopover>
                  ))}
                  {hidden > 0 && (
                    <button
                      type="button"
                      onClick={() => onOpenDay?.(day)}
                      className="truncate rounded px-1.5 text-left text-[11px] font-medium text-muted-foreground hover:bg-muted"
                    >
                      +{hidden + 1} daha
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="relative flex" style={{ height: 24 * HOUR_PX }}>
        {/* Saat etiketleri */}
        <div className="relative w-12 shrink-0" aria-hidden>
          {Array.from({ length: 23 }, (_, i) => i + 1).map((h) => (
            <span
              key={h}
              className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
              style={{ top: h * HOUR_PX }}
            >
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>

        {/* Gün kolonları; saat çizgileri arka plan olarak */}
        <div
          className="relative flex min-w-0 flex-1"
          style={{
            backgroundImage: "linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)",
            backgroundSize: `100% ${HOUR_PX}px`,
          }}
        >
          {columns.map(({ day, timed }) => {
            const isToday = isSameDay(day, today);
            return (
              <div
                key={dayKey(day)}
                className={cn("relative min-w-0 flex-1 border-l", isWeekend(day) && "bg-muted/30")}
              >
                {timed.map((p) => {
                  const style = showAsStyle(p.event.showAs);
                  const height = ((p.endMin - p.startMin) / 60) * HOUR_PX;
                  const compact = height < COMPACT_BLOCK_PX;
                  const isPast = new Date(p.event.endUtc).getTime() <= now;
                  const time = `${format(new Date(p.event.startUtc), "HH:mm")} – ${format(new Date(p.event.endUtc), "HH:mm")}`;
                  return (
                    <EventPopover key={p.event.id} event={p.event}>
                      <button
                        type="button"
                        aria-label={`${p.event.subject}, ${time}`}
                        className={cn(
                          "@container absolute z-10 overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-xs outline-none transition-[filter] hover:z-20 hover:brightness-95 focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring/60 dark:hover:brightness-125",
                          style.block,
                          isPast && "opacity-60"
                        )}
                        style={{
                          top: (p.startMin / 60) * HOUR_PX + 1,
                          height: Math.max(height - 2, 14),
                          left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
                          width: `calc(${100 / p.cols}% - 4px)`,
                        }}
                      >
                        {/* Çok dar blokta (telefonda çakışan etkinlik) yazı anlamsız kırpılıyor —
                            yalnız renkli blok kalır, dokununca detay açılır. */}
                        <span className="hidden @[1.25rem]:contents">
                          {compact ? (
                            <span className="block truncate">
                              <span className="font-semibold">{p.event.subject}</span>
                              <span className="opacity-75">, {format(new Date(p.event.startUtc), "HH:mm")}</span>
                            </span>
                          ) : (
                            <>
                              <span className="line-clamp-2 font-semibold">{p.event.subject}</span>
                              <span className="block truncate opacity-75">{time}</span>
                              {isSingleDay && p.event.location && (
                                <span className="block truncate opacity-75">{p.event.location}</span>
                              )}
                            </>
                          )}
                        </span>
                      </button>
                    </EventPopover>
                  );
                })}

                {isToday && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-red-500"
                    style={{ top: nowTop }}
                  >
                    <span className="absolute -left-1 -top-[3px] size-2 rounded-full bg-red-500" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
