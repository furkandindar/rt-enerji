import type { Metadata } from "next";

import { CalendarWidget } from "./_home/calendar-widget";
import { NotesWidget } from "./_home/notes-widget";

export const metadata: Metadata = {
  title: "Ana Sayfa | RT Enerji",
};

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ana Sayfa</h1>
        <p className="text-muted-foreground">
          Takvim ve kişisel notlarınız
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <CalendarWidget />
        <NotesWidget />
      </div>
    </div>
  );
}

