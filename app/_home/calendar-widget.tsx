"use client";

import { useState } from "react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { CalendarDays } from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function CalendarWidget() {
  const [selected, setSelected] = useState<Date | undefined>(new Date());

  const headerDate = selected ?? new Date();

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
      <CardContent className="flex justify-center">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={setSelected}
          locale={tr}
          weekStartsOn={1}
          showOutsideDays
          className="w-full max-w-sm"
        />
      </CardContent>
    </Card>
  );
}
