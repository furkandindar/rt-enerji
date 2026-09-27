import type { Metadata } from "next";

import { CalendarWidget } from "./_home/calendar/calendar-widget";
import { DashboardGreeting } from "./_home/dashboard-greeting";
import { NotesWidget } from "./_home/notes-widget";
import { WorkOverview } from "./_home/work-overview";

export const metadata: Metadata = {
  title: "Ana Sayfa | RT Enerji",
};

// Kırılımlar ekran değil içerik alanı genişliğine göre (@container/page):
// sidebar açık/kapalıyken aynı ekranda kullanılabilir genişlik ~250px değişiyor.
//
//   dar   : Bekleyen Onaylar → Taleplerim → Takvim → Notlar (tek kolon, order-*)
//   @2xl  : üstte iki özet kartı yan yana, takvim ve notlar tam genişlik
//   @4xl  : solda takvim, sağda özet kolonu.
//
// @4xl'de takvimin yüksekliği ekrana sabitlenir — sağ kolondaki veri artınca
// uzamasın. Sağ kolon kısaysa satırı takvim belirler, Notlar kalan boşluğu
// doldurur (alt kenarlar hizalı); uzunsa sayfa kayar, takvim sticky kalır.
// Sağ kolon sarmalayıcısı @4xl altında `contents`: kartlar doğrudan grid
// elemanı olur ve order-* ile takvimin önüne/arkasına dizilir.
export default function HomePage() {
  return (
    <div className="@container/page mx-auto flex w-full max-w-[96rem] flex-col gap-4 pb-6 pt-1 sm:px-2">
      <DashboardGreeting />

      <div className="grid gap-4 @2xl/page:grid-cols-2 @4xl/page:grid-cols-[minmax(0,1fr)_20rem] @6xl/page:grid-cols-[minmax(0,1fr)_23rem]">
        <CalendarWidget className="order-3 @2xl/page:col-span-2 @4xl/page:sticky @4xl/page:top-4 @4xl/page:col-span-1 @4xl/page:col-start-1 @4xl/page:row-start-1 @4xl/page:h-[calc(100svh-10rem)] @4xl/page:min-h-128 @4xl/page:self-start" />

        <div className="contents @4xl/page:col-start-2 @4xl/page:row-start-1 @4xl/page:flex @4xl/page:flex-col @4xl/page:gap-4">
          <WorkOverview
            pendingClassName="order-1 @4xl/page:shrink-0"
            requestsClassName="order-2 @4xl/page:shrink-0"
          />
          <NotesWidget className="order-4 @2xl/page:col-span-2 @4xl/page:flex-1" />
        </div>
      </div>
    </div>
  );
}
