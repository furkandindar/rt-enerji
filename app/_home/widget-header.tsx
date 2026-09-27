import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface WidgetHeaderProps {
  icon: LucideIcon;
  title: string;
  /** Başlığın yanına düşen küçük rozet (örn. sayaç) */
  badge?: ReactNode;
  /** Sağ taraf aksiyonu (Tümü linki vb.) */
  action?: ReactNode;
  className?: string;
}

// Ana sayfa kartlarının ortak, tek satırlık başlığı.
export function WidgetHeader({ icon: Icon, title, badge, action, className }: WidgetHeaderProps) {
  return (
    <div className={cn("flex min-h-11 items-center gap-2 border-b px-4 py-2", className)}>
      <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <h2 className="min-w-0 truncate text-sm font-semibold">{title}</h2>
      {badge}
      {action && <div className="-mr-2 ml-auto flex shrink-0 items-center">{action}</div>}
    </div>
  );
}

export function CountBadge({ value }: { value: number }) {
  return (
    <span className="shrink-0 rounded-full bg-primary px-1.5 py-px text-[11px] font-semibold tabular-nums text-primary-foreground">
      {value}
    </span>
  );
}
