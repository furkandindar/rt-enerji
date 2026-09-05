// Vekalet (Faz B / B3) — client tarafı tipler. API: /api/delegations
export interface DelegationPerson {
  id: string;
  first_name: string;
  last_name: string;
}

export interface DelegationRow {
  id: string;
  status: "ACTIVE" | "CANCELLED";
  source: string;
  reason: string | null;
  starts_at: string;
  ends_at: string;
  created_at: string;
  cancelled_at: string | null;
  delegator_employee_id: string;
  delegate_employee_id: string;
  workflow_definition_id: string;
  created_by_user_id: string;
  delegator: DelegationPerson | null;
  delegate: DelegationPerson | null;
  workflow_definition: { id: string; code: string; name: string } | null;
  is_current: boolean;
}

export type DelegationPhase = "current" | "scheduled" | "expired" | "cancelled";

/** Görsel durum: aktif / planlı / sona erdi / iptal */
export function getDelegationPhase(row: DelegationRow, now: Date = new Date()): DelegationPhase {
  if (row.status === "CANCELLED") return "cancelled";
  const t = now.getTime();
  if (t < new Date(row.starts_at).getTime()) return "scheduled";
  if (t >= new Date(row.ends_at).getTime()) return "expired";
  return "current";
}

export const DELEGATION_PHASE_LABELS: Record<DelegationPhase, string> = {
  current: "Aktif",
  scheduled: "Planlı",
  expired: "Sona erdi",
  cancelled: "İptal edildi",
};

export function personName(p: DelegationPerson | null | undefined): string {
  if (!p) return "-";
  return `${p.first_name} ${p.last_name}`.trim() || "-";
}
