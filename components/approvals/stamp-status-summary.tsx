import { CheckCircle2, Circle, Clock, RotateCcw, XCircle } from "lucide-react";
import { formatTrDateTime } from "@/lib/timezone";

// Kaşeli belgenin "Durum" alanı: eskiden yalnız "Kaşelenmiş/Kaşelenmedi" yazıyordu ve
// ara onaylar (Bölüm Müdürü) hiç görünmüyordu. Aktif cycle'ın onay zincirini + kaşe
// sonucunu özetler. Talep Eden'in oto-onay adımı bilgi taşımadığı için gösterilmez.
interface StampStatusApproval {
  id: string;
  status: string;
  decided_at: string | null;
  sequence_order: number;
  workflow_step: { name: string; approver_type?: string };
  approver: { first_name: string; last_name: string };
}

interface StampStatusSummaryProps {
  approvals?: StampStatusApproval[];
  requestStatus: string;
  stampedPdfPath: string | null | undefined;
}

export function StampStatusSummary({ approvals, requestStatus, stampedPdfPath }: StampStatusSummaryProps) {
  const chain = [...(approvals ?? [])]
    .filter((a) => a.workflow_step?.approver_type !== "REQUESTER")
    .sort((a, b) => a.sequence_order - b.sequence_order);
  const lastId = chain[chain.length - 1]?.id;

  return (
    <ul className="space-y-1 text-sm font-semibold">
      {chain.map((a) => {
        // Kaşe üstü imzayı yalnız son adım atar; ara adımlar onay verir.
        const isSigner = a.id === lastId;
        const who = `${a.workflow_step.name} — ${a.approver.first_name} ${a.approver.last_name}`;
        const when = a.decided_at ? ` (${formatTrDateTime(a.decided_at)})` : "";

        if (a.status === "APPROVED") {
          return (
            <li key={a.id} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <span>{who} {isSigner ? "imzaladı" : "onayladı"}{when}</span>
            </li>
          );
        }
        if (a.status === "REJECTED") {
          return (
            <li key={a.id} className="flex items-start gap-2">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <span>{who} reddetti{when}</span>
            </li>
          );
        }
        if (a.status === "REVISION_REQUESTED") {
          return (
            <li key={a.id} className="flex items-start gap-2">
              <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>{who} revize istedi{when}</span>
            </li>
          );
        }
        // PENDING satır, talep sonuçlandıysa (red/iptal/geri çekme) beklemiyordur.
        const waiting = requestStatus === "PENDING";
        return (
          <li key={a.id} className="flex items-start gap-2 text-muted-foreground">
            {waiting ? (
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{who} {waiting ? `${isSigner ? "imzası" : "onayı"} bekleniyor` : "işlem yapmadı"}</span>
          </li>
        );
      })}
      <li className={`flex items-start gap-2 ${stampedPdfPath ? "" : "text-muted-foreground"}`}>
        {stampedPdfPath ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
        ) : (
          <Circle className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <span>{stampedPdfPath ? "Kaşelenmiş" : "Kaşelenmedi"}</span>
      </li>
    </ul>
  );
}
