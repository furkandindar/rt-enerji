"use client";

import { useState } from "react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

import { useUser } from "@/lib/contexts/user-context";

function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Günaydın";
  if (hour >= 12 && hour < 18) return "İyi günler";
  if (hour >= 18 && hour < 23) return "İyi akşamlar";
  return "İyi geceler";
}

export function DashboardGreeting() {
  const { user } = useUser();
  const [now] = useState(() => new Date());
  const firstName = user?.name.split(" ")[0];

  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
      <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
        {greetingFor(now.getHours())}
        {firstName ? `, ${firstName}` : ""}
      </h1>
      <p className="text-sm text-muted-foreground">
        {format(now, "d MMMM yyyy, EEEE", { locale: tr })}
      </p>
    </header>
  );
}
