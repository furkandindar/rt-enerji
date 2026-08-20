"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
} from "date-fns";
import { tr } from "date-fns/locale";
import { CalendarDays, Loader2 } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface CalendarEvent {
  id: string;
  subject: string;
  startUtc: string;
  endUtc: string;
  isAllDay: boolean;
  location: string | null;
  webLink: string | null;
  showAs: string;
}

export function CalendarWidget() {
  const today = new Date();
  const [month, setMonth] = useState<Date>(today);
  const [selected, setSelected] = useState<Date | undefined>(today);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const fromDate = startOfMonth(month);
    const toDate = addDays(endOfMonth(month), 1);

    const params = new URLSearchParams({
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    });

    setLoading(true);
    setError(null);

    fetch(`/api/calendar/events?${params}`, { signal: controller.signal })
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
        return data as { events: CalendarEvent[] };
      })
      .then((data) => setEvents(data.events ?? []))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Bilinmeyen hata");
        setEvents([]);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [month]);

  const eventDays = useMemo(() => {
    const dates = new Map<string, Date>();
    const monthDays = eachDayOfInterval({
      start: startOfMonth(month),
      end: endOfMonth(month),
    });

    for (const day of monthDays) {
      if (events.some((event) => eventOverlapsDay(event, day))) {
        dates.set(format(day, "yyyy-MM-dd"), day);
      }
    }
    return Array.from(dates.values());
  }, [events, month]);

  const selectedDayEvents = useMemo(() => {
    if (!selected) return [];
    return events
      .filter((event) => eventOverlapsDay(event, selected))
      .sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  }, [events, selected]);

  const headerDate = selected ?? today;

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-base font-semibold">Takvim</CardTitle>
          <CardDescription>
            {format(headerDate, "d MMMM yyyy, EEEE", { locale: tr })}
          </CardDescription>
        </div>
        <CalendarDays className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <Calendar
          mode="single"
          month={month}
          onMonthChange={setMonth}
          selected={selected}
          onSelect={setSelected}
          locale={tr}
          weekStartsOn={1}
          showOutsideDays
          modifiers={{ hasEvent: eventDays }}
          modifiersClassNames={{
            hasEvent:
              "relative after:pointer-events-none after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-current after:opacity-70",
          }}
          className="w-full"
        />

        <div className="w-full border-t pt-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {selected ? format(selected, "d MMMM EEEE", { locale: tr }) : "—"}
            </span>
            {loading && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Yükleniyor
              </span>
            )}
          </div>

          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : selectedDayEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground">Bu gün için etkinlik yok</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {selectedDayEvents.map((ev) => (
                <li key={ev.id} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 shrink-0 font-medium tabular-nums text-muted-foreground">
                    {ev.isAllDay ? "Tüm gün" : format(new Date(ev.startUtc), "HH:mm")}
                  </span>
                  <a
                    href={ev.webLink ?? "#"}
                    target={ev.webLink ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="line-clamp-2 hover:underline"
                  >
                    {ev.subject}
                    {ev.location && (
                      <span className="text-muted-foreground"> • {ev.location}</span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function eventOverlapsDay(event: CalendarEvent, day: Date): boolean {

  const eventStart = new Date(event.startUtc);
  const eventEnd = new Date(event.endUtc);

  return eventStart <= endOfDay(day) && eventEnd > startOfDay(day);
}
