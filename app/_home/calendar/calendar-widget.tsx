"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, differenceInCalendarDays, isSameDay, startOfDay } from "date-fns";
import { tr } from "date-fns/locale";
import { AlertCircle, ChevronDown, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import {
  type CalendarEvent,
  type CalendarView,
  rangeTitle,
  shiftAnchor,
  visibleRange,
} from "./calendar-utils";
import { MonthView } from "./month-view";
import { TimeGridView } from "./time-grid-view";

const OUTLOOK_CALENDAR_URL = "https://outlook.office.com/calendar/view/week";
const VIEW_STORAGE_KEY = "rt-home-calendar-view";

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: "day", label: "Gün" },
  { value: "week", label: "Hafta" },
  { value: "month", label: "Ay" },
];

// Görünüm tercihi yalnız bu tarayıcıya ait bir kolaylık; okunamazsa
// telefonda gün, diğerlerinde hafta ile başlanır.
function initialView(): CalendarView {
  if (typeof window === "undefined") return "week";
  try {
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === "day" || saved === "week" || saved === "month") return saved;
  } catch {
    // depolama kapalı olabilir (gizli pencere vb.)
  }
  return window.matchMedia("(max-width: 639px)").matches ? "day" : "week";
}

// Sayfa düzeni @container/page'e göre: yan kolonla yan yanayken (@4xl) kartın
// yüksekliği ekrana sabit (page.tsx), görünüm gövdesi kalan yüksekliği doldurur.
// h-0 + grow: kaydırılan 24 saatlik içerik kartı şişirmesin.
const FILL_BODY = "@4xl/page:h-0 @4xl/page:grow";

export function CalendarWidget({ className }: { className?: string }) {
  const [today] = useState(() => startOfDay(new Date()));
  const [anchor, setAnchor] = useState<Date>(today);
  const [view, setView] = useState<CalendarView>(initialView);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Görünümler/aralıklar arasında gidip gelirken tekrar istek atmamak için.
  const cache = useRef(new Map<string, CalendarEvent[]>());

  const range = useMemo(() => visibleRange(view, anchor), [view, anchor]);
  const rangeKey = `${range.start.toISOString()}|${range.end.toISOString()}`;

  // "Şimdi" çizgisi ve geçmiş etkinliklerin soluklaşması için dakikalık saat.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const cached = cache.current.get(rangeKey);
    if (cached) {
      setEvents(cached);
      setError(null);
      setLoading(false);
      return;
    }

    const [from, to] = rangeKey.split("|");
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setEvents([]);

    fetch(`/api/calendar/events?${new URLSearchParams({ from, to })}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          if (res.status === 412 && data?.error === "reauth_required") {
            throw new Error("Microsoft hesabı bağlı değil. Çıkış yapıp tekrar girin.");
          }
          if (res.status === 412 && data?.error === "reconsent_required") {
            throw new Error("Oturum yenilenmeli. Çıkış yapıp tekrar girin.");
          }
          throw new Error(data?.message ?? `Hata: ${res.status}`);
        }
        return (data?.events ?? []) as CalendarEvent[];
      })
      .then((list) => {
        cache.current.set(rangeKey, list);
        setEvents(list);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Bilinmeyen hata");
        setLoading(false);
      });

    return () => controller.abort();
  }, [rangeKey]);

  const changeView = useCallback((next: CalendarView) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // yok say
    }
  }, []);

  const openDay = useCallback(
    (day: Date) => {
      setAnchor(startOfDay(day));
      changeView("day");
    },
    [changeView]
  );

  const days = useMemo(
    () =>
      Array.from({ length: differenceInCalendarDays(range.end, range.start) }, (_, i) =>
        addDays(range.start, i)
      ),
    [range]
  );

  return (
    <Card className={cn("@container flex flex-col overflow-hidden", className)}>
      {/* Araç çubuğu — dar kartta görünüm seçici tam genişlikte alt satıra iner */}
      <div className="relative flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAnchor(today)}
            disabled={isSameDay(anchor, today)}
          >
            Bugün
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setAnchor((a) => shiftAnchor(view, a, -1))}
            aria-label="Önceki"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setAnchor((a) => shiftAnchor(view, a, 1))}
            aria-label="Sonraki"
          >
            <ChevronRight />
          </Button>

          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-base font-semibold outline-none transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50"
                aria-label="Tarihe git"
              >
                <span className="truncate">{rangeTitle(view, anchor)}</span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                required
                selected={anchor}
                defaultMonth={anchor}
                onSelect={(d) => {
                  setAnchor(startOfDay(d));
                  setPickerOpen(false);
                }}
                locale={tr}
                weekStartsOn={1}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex w-full items-center gap-1 @md:ml-auto @md:w-auto">
          <div
            role="group"
            aria-label="Takvim görünümü"
            className="flex flex-1 rounded-lg bg-muted p-0.5 @md:inline-flex @md:flex-none"
          >
            {VIEWS.map((v) => (
              <button
                key={v.value}
                type="button"
                onClick={() => changeView(v.value)}
                aria-pressed={view === v.value}
                className={cn(
                  "flex-1 rounded-md px-3 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
                  view === v.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon-sm" asChild className="text-muted-foreground">
            <a
              href={OUTLOOK_CALENDAR_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Outlook Takvimi'nde aç"
              title="Outlook Takvimi'nde aç"
            >
              <ExternalLink />
            </a>
          </Button>
        </div>

        {loading && (
          <div aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 animate-pulse bg-primary/40" />
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 border-b bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      )}

      {view === "month" ? (
        <MonthView
          anchor={anchor}
          start={range.start}
          end={range.end}
          events={events}
          today={today}
          now={now}
          onOpenDay={openDay}
          className={FILL_BODY}
        />
      ) : (
        <TimeGridView
          key={view}
          days={days}
          events={events}
          today={today}
          now={now}
          onOpenDay={view === "week" ? openDay : undefined}
          className={cn("h-112 @2xl/page:h-144", FILL_BODY)}
        />
      )}
    </Card>
  );
}
