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
  workflow_step?: { approver_type?: string } | null;
}

/** Satır, bir turun talep sahibi revize açıklamasını taşıyor mu? */
export function isRevisionResponseRow(a: RevisionResponseApprovalLike): boolean {
  return (
    (a.revision_cycle ?? 0) > 0 &&
    a.sequence_order === 1 &&
    a.workflow_step?.approver_type === "REQUESTER" &&
    !!a.comment
  );
}

/**
 * Verilen turun revize yazışmasını bulur: önceki turdaki en son revize kararı
 * (onaycının notu) + bu turun ilk satırındaki talep sahibi açıklaması.
 * allApprovals tüm cycle'ları içermelidir (detay uçlarındaki all_approvals).
 */
export function findRevisionExchange<T extends RevisionResponseApprovalLike & { decided_at?: string | null }>(
  allApprovals: T[],
  cycle: number
): { revision: T | null; response: T | null } {
  if (cycle <= 0) return { revision: null, response: null };
  const response =
    allApprovals.find((a) => (a.revision_cycle ?? 0) === cycle && isRevisionResponseRow(a)) ?? null;
  const revisions = allApprovals.filter(
    (a) => (a.revision_cycle ?? 0) === cycle - 1 && a.status === "REVISION_REQUESTED"
  );
  const revision =
    revisions.length === 0
      ? null
      : revisions.reduce((latest, a) =>
          (a.decided_at ?? "") > (latest.decided_at ?? "") ? a : latest
        );
  return { revision, response };
}
