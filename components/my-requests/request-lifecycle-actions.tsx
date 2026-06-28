"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getEditUrl } from "@/lib/workflow/route-map";
import { useUser } from "@/lib/contexts/user-context";
import type { RequestStatus, ApprovalStatus } from "@/lib/workflow/types";

interface LifecycleRequestSummary {
  id: string;
  status: RequestStatus;
  workflow_definition?: { code?: string } | null;
  approvals?: Array<{
    status: ApprovalStatus;
    // REQUESTER tipindeki adımlar "gerçek onay" sayılmaz (talep gönderme imzası);
    // withdraw eligibility'sinde bu adımlar yok sayılır.
    approver_type?: 'REQUESTER' | 'UNIT_HEAD' | 'STATIC_POSITION' | 'DYNAMIC_USER_LIST';
  }>;
}

interface Props {
  request: LifecycleRequestSummary;
  onChange?: () => void; // refresh callback
}

export function RequestLifecycleActions({ request, onChange }: Props) {
  const router = useRouter();
  const { isAdmin } = useUser();
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  const status = request.status;
  const code = request.workflow_definition?.code ?? null;
  const editUrl = getEditUrl(code, request.id);

  // Eligibility:
  // Withdraw için: REQUESTER tipindeki adımlar (talep gönderme imzası) hariç,
  // gerçek onaycıların hiçbiri APPROVED/REJECTED/REVISION_REQUESTED vermemiş olmalı.
  const realApprovals = (request.approvals ?? []).filter(
    (a) => a.approver_type !== "REQUESTER"
  );
  const canWithdraw =
    status === "PENDING" && realApprovals.every((a) => a.status === "PENDING");
  const canEdit =
    (status === "DRAFT" || status === "REVISION_REQUESTED") && editUrl !== null;
  // Faz-bazlı iptal yetkisi (server'daki canCancelRequest ile aynı kural):
  //  - Talep eden: yalnızca imza öncesi (withdraw ile aynı eşik).
  //  - ORG_ADMIN: terminal olmayan her durumda (imza sonrası / completion fazı dahil).
  const isTerminalForCancel =
    status === "CANCELLED" || status === "COMPLETED" || status === "APPROVED";
  const canCancel = isAdmin ? !isTerminalForCancel : canWithdraw;

  // Hiçbir aksiyon yoksa render etme
  if (!canWithdraw && !canEdit && !canCancel) return null;

  async function doAction(
    path: string,
    successMsg: string,
    failMsg: string
  ): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(path, { method: "POST" });
      if (!res.ok) {
        let detail = failMsg;
        try {
          const data = await res.json();
          if (data?.error) detail = data.error;
        } catch {}
        toast.error(detail);
        return false;
      }
      toast.success(successMsg);
      onChange?.();
      return true;
    } catch (err) {
      console.error(err);
      toast.error(failMsg);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canWithdraw && (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            doAction(
              `/api/requests/${request.id}/withdraw`,
              "Talep geri çekildi",
              "Talep geri çekilemedi"
            )
          }
        >
          Geri Çek
        </Button>
      )}

      {canEdit && editUrl && (
        <Button
          size="sm"
          disabled={busy}
          onClick={() => router.push(editUrl)}
        >
          Düzenle
        </Button>
      )}

      {canCancel && (
        <>
          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => setCancelOpen(true)}
          >
            İptal Et
          </Button>

          <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Talebi iptal etmek istediğinden emin misin?</DialogTitle>
                <DialogDescription>
                  Bu işlem geri alınamaz. Talep iptal edilmiş olarak görünür ve onay akışı durdurulur.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={busy}>
                  Vazgeç
                </Button>
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={async () => {
                    const ok = await doAction(
                      `/api/requests/${request.id}/cancel`,
                      "Talep iptal edildi",
                      "Talep iptal edilemedi"
                    );
                    if (ok) setCancelOpen(false);
                  }}
                >
                  Evet, İptal Et
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
