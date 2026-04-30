// Outlook Calendar (Microsoft Graph delegated) helpers.
// Server-only. user-client üzerinden /me/calendarView'i çağırır.

import { graphUserFetch } from "./user-client";

// ============================================================================
// Types
// ============================================================================

/** Widget'ın kullanacağı sade event şekli. UTC ISO string'ler ile. */
export interface CalendarEvent {
  id: string;
  subject: string;
  startUtc: string;          // ISO UTC
  endUtc: string;            // ISO UTC
  isAllDay: boolean;
  location: string | null;
  webLink: string | null;
  showAs: string;            // free | tentative | busy | oof | workingElsewhere | unknown
}

interface GraphEventResponse {
  value: Array<{
    id: string;
    subject: string | null;
    isAllDay: boolean;
    showAs: string;
    webLink: string | null;
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
    location: { displayName?: string | null } | null;
  }>;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Verilen UTC aralıkta (genişletilmiş) takvim olaylarını döndürür.
 * /me/calendarView, recurring event'leri occurrence'lara çevirir — bu yüzden
 * widget'ta tek tek günlere düşürmek için en uygun endpoint.
 */
export async function getEventsInRange(
  userId: string,
  fromUtcIso: string,
  toUtcIso: string
): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({
    startDateTime: fromUtcIso,
    endDateTime: toUtcIso,
    $select: "id,subject,isAllDay,showAs,webLink,start,end,location",
    $orderby: "start/dateTime",
    $top: "200",
  });

  // URLSearchParams "$" karakterini encode eder; Graph $select gibi parametreleri
  // ham bekliyor. Bu yüzden encoding'i geri çevirmemiz gerek.
  const query = params.toString().replace(/%24/g, "$");

  const response = await graphUserFetch(userId, `/me/calendarView?${query}`);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`[MsCalendar] getEventsInRange failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as GraphEventResponse;

  return data.value.map((ev) => ({
    id: ev.id,
    subject: ev.subject ?? "(başlıksız)",
    startUtc: toUtcIso8601(ev.start),
    endUtc: toUtcIso8601(ev.end),
    isAllDay: ev.isAllDay,
    showAs: ev.showAs,
    location: ev.location?.displayName?.trim() || null,
    webLink: ev.webLink ?? null,
  }));
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Graph'tan dönen { dateTime, timeZone } yapısını ISO UTC string'e çevirir.
 * Prefer header set etmediğimiz için timeZone == "UTC" gelmesini bekleriz; yine de
 * defansif olarak diğer durumları da idare ediyoruz.
 */
function toUtcIso8601(t: { dateTime: string; timeZone: string }): string {
  // dateTime örnek: "2025-11-15T10:00:00.0000000"
  if (t.timeZone === "UTC") {
    // Sadece sonuna Z ekle (mikrosaniyeleri kırp)
    const trimmed = t.dateTime.replace(/\.\d+$/, "");
    return new Date(`${trimmed}Z`).toISOString();
  }
  // Bilinmeyen TZ: olduğu gibi parse et (browser bunu local kabul eder; nadir durum)
  return new Date(t.dateTime).toISOString();
}
