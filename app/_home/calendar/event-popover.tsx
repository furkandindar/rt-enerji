"use client";

import type { ReactElement } from "react";
import { Clock, ExternalLink, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { type CalendarEvent, formatEventWhen, showAsStyle } from "./calendar-utils";

// Etkinliğe tıklanınca açılan detay kartı (Google/Outlook'taki gibi).
export function EventPopover({
  event,
  children,
}: {
  event: CalendarEvent;
  children: ReactElement;
}) {
  const style = showAsStyle(event.showAs);

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start" collisionPadding={12}>
        <div className="flex gap-3 p-4 pb-3">
          <span aria-hidden className={cn("mt-1.5 size-3 shrink-0 rounded-sm", style.dot)} />
          <p className="min-w-0 break-words font-semibold leading-snug">{event.subject}</p>
        </div>
        <dl className="flex flex-col gap-2 px-4 pb-4 text-sm">
          <div className="flex items-start gap-3">
            <dt className="sr-only">Zaman</dt>
            <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <dd>{formatEventWhen(event)}</dd>
          </div>
          {event.location && (
            <div className="flex items-start gap-3">
              <dt className="sr-only">Konum</dt>
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <dd className="min-w-0 break-words">{event.location}</dd>
            </div>
          )}
          <div className="flex items-center gap-3 text-muted-foreground">
            <dt className="sr-only">Durum</dt>
            <span aria-hidden className={cn("mx-[5px] size-1.5 shrink-0 rounded-full", style.dot)} />
            <dd>{style.label}</dd>
          </div>
        </dl>
        {event.webLink && (
          <div className="border-t p-1.5">
            <Button variant="ghost" size="sm" asChild className="w-full justify-start">
              <a href={event.webLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                Outlook&apos;ta aç
              </a>
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
