"use client";

// Vekalet listesi (Faz B / B3). Profil (kişinin kendi vekaletleri) ve admin
// sayfasında (tüm vekaletler) ortak kullanılır.

import { useState } from "react";
import { toast } from "sonner";
import { Ban, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTrDateTime } from "@/lib/timezone";
import {
  DELEGATION_PHASE_LABELS,
  getDelegationPhase,
  personName,
  type DelegationPhase,
  type DelegationRow,
} from "./delegation-types";

interface DelegationsTableProps {
  items: DelegationRow[];
  viewerEmployeeId: string | null;
  isAdmin: boolean;
  onChanged?: () => void;
  emptyText?: string;
}

const PHASE_BADGE_VARIANT: Record<DelegationPhase, "default" | "secondary" | "outline" | "destructive"> = {
  current: "default",
  scheduled: "outline",
  expired: "secondary",
  cancelled: "secondary",
};

export function DelegationsTable({
  items,
  viewerEmployeeId,
  isAdmin,
  onChanged,
  emptyText = "Tanımlı vekalet yok",
}: DelegationsTableProps) {
  const [pendingCancel, setPendingCancel] = useState<DelegationRow | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const canCancel = (row: DelegationRow) => {
    const phase = getDelegationPhase(row);
    if (phase === "cancelled" || phase === "expired") return false;
    return isAdmin || row.delegator_employee_id === viewerEmployeeId;
  };

  const handleCancel = async () => {
    if (!pendingCancel) return;
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/delegations/${pendingCancel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Vekalet iptal edilemedi");
      toast.success("Vekalet iptal edildi");
      setPendingCancel(null);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Vekalet iptal edilemedi");
    } finally {
      setIsCancelling(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border">
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Adına</TableHead>
              <TableHead>Vekil</TableHead>
              <TableHead>Süreç</TableHead>
              <TableHead>Başlangıç</TableHead>
              <TableHead>Bitiş</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="w-[90px]">İşlem</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row) => {
              const phase = getDelegationPhase(row);
              const isMeDelegator = row.delegator_employee_id === viewerEmployeeId;
              const isMeDelegate = row.delegate_employee_id === viewerEmployeeId;
              return (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    {personName(row.delegator)}
                    {isMeDelegator && <span className="ml-1 text-xs text-muted-foreground">(siz)</span>}
                  </TableCell>
                  <TableCell>
                    {personName(row.delegate)}
                    {isMeDelegate && <span className="ml-1 text-xs text-muted-foreground">(siz)</span>}
                  </TableCell>
                  <TableCell>{row.workflow_definition?.name ?? "-"}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatTrDateTime(row.starts_at)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatTrDateTime(row.ends_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge variant={PHASE_BADGE_VARIANT[phase]}>{DELEGATION_PHASE_LABELS[phase]}</Badge>
                      {row.reason && (
                        <span className="max-w-[220px] truncate text-xs text-muted-foreground" title={row.reason}>
                          {row.reason}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {canCancel(row) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingCancel(row)}
                        title="Vekaleti iptal et"
                      >
                        <Ban className="mr-1 h-4 w-4" />
                        İptal
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!pendingCancel} onOpenChange={(o) => !o && !isCancelling && setPendingCancel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vekaleti iptal et</DialogTitle>
            <DialogDescription>
              {pendingCancel
                ? `${personName(pendingCancel.delegate)} için tanımlı vekalet iptal edilecek. Vekil, bu andan itibaren ${personName(pendingCancel.delegator)} adına işlem yapamaz.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingCancel(null)} disabled={isCancelling}>
              Vazgeç
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={isCancelling}>
              {isCancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              İptal Et
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
