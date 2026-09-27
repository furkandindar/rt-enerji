import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { tr } from "date-fns/locale";

// /api/calendar/events cevabındaki etkinlik şekli (lib/msgraph/calendar.ts).
export interface CalendarEvent {
  id: string;
  subject: string;
  startUtc: string;
  endUtc: string;
  isAllDay: boolean;
  location: string | null;
  webLink: string | null;
  showAs: string;
}

export type CalendarView = "day" | "week" | "month";

export const WEEK_OPTS = { weekStartsOn: 1 } as const;

// Outlook "showAs" durumu → blok rengi. Metin her zaman okunur koyu/açık ton;
// renk yalnız ayırt edici (etiketi popover'da yazıyla da var).
export const SHOW_AS_STYLES: Record<string, { label: string; block: string; dot: string }> = {
  busy: {
    label: "Meşgul",
    block: "border-blue-500 bg-blue-50 text-blue-950 dark:bg-blue-500/20 dark:text-blue-50",
    dot: "bg-blue-500",
  },
  tentative: {
    label: "Belirsiz",
    block: "border-blue-400 bg-card text-blue-950 ring-1 ring-inset ring-blue-200 dark:text-blue-50 dark:ring-blue-500/40",
    dot: "bg-blue-300",
  },
  oof: {
    label: "Ofis dışında",
    block: "border-purple-500 bg-purple-50 text-purple-950 dark:bg-purple-500/20 dark:text-purple-50",
    dot: "bg-purple-500",
  },
  workingElsewhere: {
    label: "Başka yerde çalışıyor",
    block: "border-teal-500 bg-teal-50 text-teal-950 dark:bg-teal-500/20 dark:text-teal-50",
    dot: "bg-teal-500",
  },
  free: {
    label: "Müsait",
    block: "border-muted-foreground/40 bg-muted text-foreground",
    dot: "bg-muted-foreground/50",
  },
};

export function showAsStyle(showAs: string) {
  return SHOW_AS_STYLES[showAs] ?? SHOW_AS_STYLES.busy;
}

export const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

// Tüm gün etkinlikleri takvim günüdür (saat dilimsiz); Graph onları gece yarısı
// sınırlarıyla döndürür. Yerel saate çevirmek sınırı komşu güne kaydırabildiği
// için en yakın UTC gece yarısına yuvarlayıp tarih kısmını kullanıyoruz.
function allDayKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 12 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function occursOn(ev: CalendarEvent, day: Date): boolean {
  if (ev.isAllDay) {
    const key = dayKey(day);
    const start = allDayKey(ev.startUtc);
    const end = allDayKey(ev.endUtc); // hariç
    return key >= start && (key < end || (start === end && key === start));
  }
  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(startOfDay(day), 1).getTime();
  const start = new Date(ev.startUtc).getTime();
  const end = new Date(ev.endUtc).getTime();
  return start < dayEnd && (end > dayStart || (start === end && start >= dayStart));
}

export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
  return a.startUtc.localeCompare(b.startUtc);
}

export function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events.filter((ev) => occursOn(ev, day)).sort(compareEvents);
}

/** Görünümde ekrana giren gün aralığı; end hariç. */
export function visibleRange(view: CalendarView, anchor: Date): { start: Date; end: Date } {
  if (view === "day") {
    const start = startOfDay(anchor);
    return { start, end: addDays(start, 1) };
  }
  if (view === "week") {
    const start = startOfWeek(anchor, WEEK_OPTS);
    return { start, end: addDays(start, 7) };
  }
  const start = startOfWeek(startOfMonth(anchor), WEEK_OPTS);
  const end = addDays(startOfWeek(endOfMonth(anchor), WEEK_OPTS), 7);
  return { start, end };
}

export function shiftAnchor(view: CalendarView, anchor: Date, dir: 1 | -1): Date {
  if (view === "day") return addDays(anchor, dir);
  if (view === "week") return addDays(anchor, 7 * dir);
  return addMonths(anchor, dir);
}

export function rangeTitle(view: CalendarView, anchor: Date): string {
  // Gün başlığı ızgarada hafta gününü zaten gösteriyor.
  if (view === "day") return format(anchor, "d MMMM yyyy", { locale: tr });
  if (view === "month") return format(anchor, "LLLL yyyy", { locale: tr });

  const start = startOfWeek(anchor, WEEK_OPTS);
  const end = addDays(start, 6);
  if (start.getFullYear() !== end.getFullYear()) {
    return `${format(start, "d MMM yyyy", { locale: tr })} – ${format(end, "d MMM yyyy", { locale: tr })}`;
  }
  if (start.getMonth() !== end.getMonth()) {
    return `${format(start, "d MMM", { locale: tr })} – ${format(end, "d MMM yyyy", { locale: tr })}`;
  }
  return `${format(start, "d")}–${format(end, "d MMMM yyyy", { locale: tr })}`;
}

export function formatEventWhen(ev: CalendarEvent): string {
  const start = new Date(ev.startUtc);
  const end = new Date(ev.endUtc);
  if (ev.isAllDay) {
    const lastDay = addDays(new Date(`${allDayKey(ev.endUtc)}T00:00:00`), -1);
    const firstDay = new Date(`${allDayKey(ev.startUtc)}T00:00:00`);
    if (lastDay <= firstDay) return `${format(firstDay, "d MMMM EEEE", { locale: tr })} · Tüm gün`;
    return `${format(firstDay, "d MMM", { locale: tr })} – ${format(lastDay, "d MMM", { locale: tr })} · Tüm gün`;
  }
  if (dayKey(start) === dayKey(end) || end.getTime() - start.getTime() <= 0) {
    return `${format(start, "d MMMM EEEE", { locale: tr })} · ${format(start, "HH:mm")} – ${format(end, "HH:mm")}`;
  }
  return `${format(start, "d MMM HH:mm", { locale: tr })} – ${format(end, "d MMM HH:mm", { locale: tr })}`;
}

// ---------------------------------------------------------------------------
// Saat ızgarası yerleşimi: çakışan etkinlikler yan yana kolonlara bölünür.
// ---------------------------------------------------------------------------

/** Çok kısa etkinlik de tıklanabilir yükseklikte çizilsin. */
const MIN_BLOCK_MINUTES = 20;

export interface TimedPlacement {
  event: CalendarEvent;
  /** Gün başından dakika (0–1440), güne kırpılmış */
  startMin: number;
  endMin: number;
  col: number;
  cols: number;
}

export function layoutTimedEvents(events: CalendarEvent[], day: Date): TimedPlacement[] {
  const dayStart = startOfDay(day).getTime();
  const items: TimedPlacement[] = events
    .filter((ev) => !ev.isAllDay && occursOn(ev, day))
    .map((ev) => {
      const startMin = Math.max(0, (new Date(ev.startUtc).getTime() - dayStart) / 60000);
      const rawEnd = Math.min(1440, (new Date(ev.endUtc).getTime() - dayStart) / 60000);
      const endMin = Math.max(rawEnd, Math.min(1440, startMin + MIN_BLOCK_MINUTES));
      return { event: ev, startMin, endMin, col: 0, cols: 1 };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  // Birbirine zincirle değen etkinlikler bir küme; küme içinde her etkinlik
  // boşalan ilk kolona yerleşir, kümenin kolon sayısı genişliği belirler.
  let cluster: TimedPlacement[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    for (const it of cluster) it.cols = colEnds.length;
    cluster = [];
    colEnds = [];
  };

  for (const it of items) {
    if (it.startMin >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    let col = colEnds.findIndex((end) => end <= it.startMin);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(it.endMin);
    } else {
      colEnds[col] = it.endMin;
    }
    it.col = col;
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  flush();

  return items;
}
