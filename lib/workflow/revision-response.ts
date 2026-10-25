// Talep sahibinin "Revize Açıklaması": revize istenen talebi yeniden gönderirken
// yaptığı düzenlemeyi açıkladığı not. Client + server ortak (sunucu bağımlılığı yok).
//
// Kayıt yeri: yeni turun oto-onaylanan ilk REQUESTER satırının comment'i
// (request_approvals, revision_cycle = yeni tur, sequence_order = 1). Onaycının
// revize notu bir önceki turun kendi REVISION_REQUESTED satırında kalır; böylece
// her tur için revize notu ve cevabı ayrı kayıtlardır, eski turlar silinmez.
// Yalnız talep sahibi yazar (resubmit route'u başkasından gelen notu yok sayar),
// bu yüzden satırın onaycısı = notun yazarı.
// Süreç iletişimidir, belge içeriği değil — PDF'e yazılmaz (generate-request-pdf
// tek merkezden düşer); arayüzde Süreç Logu + RevisionResponseNotice, e-postada
// onaycıya giden bildirimlerde gösterilir.
//
// Revize sorumlusu ara adımsa (lib/workflow/revision-target.ts) talep sahibi
// yeniden göndermez; yazışmanın cevabı sorumlunun yeni turdaki onay notudur
// (findRevisionExchange → responseKind 'ASSIGNEE').

export const REVISION_RESPONSE_MAX_LENGTH = 2000;

/** Body'den gelen değeri kırpar; boş/geçersizse null. */
export function normalizeRevisionResponse(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

interface RevisionResponseApprovalLike {
  status: string;
  comment?: string | null;
  sequence_order?: number;
  revision_cycle?: number | null;
  carried_over_from_id?: string | null;
  workflow_step?: { approver_type?: string } | null;
}

/** Satır, bir turun talep sahibi revize açıklamasını taşıyor mu? */
export function isRevisionResponseRow(a: RevisionResponseApprovalLike): boolean {
  return (
    (a.revision_cycle ?? 0) > 0 &&
    a.sequence_order === 1 &&
    a.workflow_step?.approver_type === "REQUESTER" &&
    !a.carried_over_from_id && // önceki turdan taşınan gönderim satırı yeni bir cevap değildir
    !!a.comment
  );
}

/**
 * Tur, ara adıma verilen revizeyle mi açıldı (revize sorumlusu talep sahibi
 * değil)? O turda talep sahibinin gönderim satırı yeniden oluşmaz, önceki turdan
 * taşınır. approvals tüm cycle'ları ya da yalnız o turu içerebilir.
 */
export function isAssigneeRevisionCycle(
  approvals: RevisionResponseApprovalLike[],
  cycle: number
): boolean {
  if (cycle <= 0) return false;
  const first = approvals.find((a) => (a.revision_cycle ?? 0) === cycle && a.sequence_order === 1);
  return !!first?.carried_over_from_id;
}

/** Turun taşınmamış ilk satırı — ara adım revizesinde sorumlunun bu turdaki satırı. */
export function findCycleOwnFirstRow<T extends RevisionResponseApprovalLike>(
  approvals: T[],
  cycle: number
): T | null {
  return (
    approvals
      .filter((a) => (a.revision_cycle ?? 0) === cycle && !a.carried_over_from_id)
      .sort((a, b) => (a.sequence_order ?? 0) - (b.sequence_order ?? 0))[0] ?? null
  );
}

/**
 * Verilen turun revize yazışmasını bulur: önceki turdaki en son revize kararı
 * (onaycının notu) + bu turdaki cevap:
 *   - REQUESTER: talep sahibinin ilk satırdaki Revize Açıklaması;
 *   - ASSIGNEE: ara adıma verilmiş revizede sorumlunun düzeltme sonrası onay
 *     notu (turun taşınmamış ilk satırı, onaylandıysa).
 * allApprovals tüm cycle'ları içermelidir (detay uçlarındaki all_approvals).
 */
export function findRevisionExchange<T extends RevisionResponseApprovalLike & { decided_at?: string | null }>(
  allApprovals: T[],
  cycle: number
): { revision: T | null; response: T | null; responseKind: "REQUESTER" | "ASSIGNEE" } {
  if (cycle <= 0) return { revision: null, response: null, responseKind: "REQUESTER" };
  const revisions = allApprovals.filter(
    (a) => (a.revision_cycle ?? 0) === cycle - 1 && a.status === "REVISION_REQUESTED"
  );
  const revision =
    revisions.length === 0
      ? null
      : revisions.reduce((latest, a) =>
          (a.decided_at ?? "") > (latest.decided_at ?? "") ? a : latest
        );

  if (isAssigneeRevisionCycle(allApprovals, cycle)) {
    const own = findCycleOwnFirstRow(allApprovals, cycle);
    const response = own && own.status === "APPROVED" && own.comment ? own : null;
    return { revision, response, responseKind: "ASSIGNEE" };
  }

  const response =
    allApprovals.find((a) => (a.revision_cycle ?? 0) === cycle && isRevisionResponseRow(a)) ?? null;
  return { revision, response, responseKind: "REQUESTER" };
}
