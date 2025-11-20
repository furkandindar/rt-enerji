"use client";

import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

interface LoadingProps {
  fullscreen?: boolean;
  text?: string;
}

export function Loading({ fullscreen = false, text = "Loading..." }: LoadingProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 text-sm text-muted-foreground",
        fullscreen && "min-h-svh",
      )}
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{text}</span>
    </div>
  );
}

