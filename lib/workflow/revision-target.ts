// Revize sorumlusu: onaycı revize isterken talebi kime göndereceğini seçer.
// Client + server ortak (sunucu bağımlılığı yok) — pencere aday listesini, route
// aynı listeyle doğrulamayı buradan alır.
//
// - Talep sahibi (varsayılan, bugünkü akış): talep REVISION_REQUESTED'a düşer,
//   talep sahibi formu düzenleyip yeniden gönderir.
// - Ara adım: talep hemen yeni tura geçer; sorumludan önceki onaylar taşınır
//   (request_approvals.carried_over_from_id), sorumlunun satırı PENDING olur.
//
// Düzeltme sonrası mod (revizeyi isteyen seçer — adımların birbirine bağlı olup
// olmadığını o bilir):
//   RESTART_FROM_TARGET — sorumludan sonraki adımlar yeniden onaylar (varsayılan;
//                         talep sahibi için bugünkü "zincir baştan" davranışı).
//   RETURN_TO_REVIEWER  — aradaki onaylar da taşınır; düzeltme sonrası talep
//                         doğrudan revizeyi isteyene döner.

export const REVISION_RETURN_MODES = ['RESTART_FROM_TARGET', 'RETURN_TO_REVIEWER'] as const;
export type RevisionReturnMode = (typeof REVISION_RETURN_MODES)[number];
export const DEFAULT_REVISION_RETURN_MODE: RevisionReturnMode = 'RESTART_FROM_TARGET';

/** Body'den gelen modu doğrular; verilmemişse varsayılan, geçersizse null. */
export function parseRevisionReturnMode(raw: unknown): RevisionReturnMode | null {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_REVISION_RETURN_MODE;
  return (REVISION_RETURN_MODES as readonly unknown[]).includes(raw) ? (raw as RevisionReturnMode) : null;
}

/** DB'deki değer (NULL = eski kayıt) → mod. */
export function revisionReturnModeOf(value: string | null | undefined): RevisionReturnMode {
  return value === 'RETURN_TO_REVIEWER' ? 'RETURN_TO_REVIEWER' : DEFAULT_REVISION_RETURN_MODE;
}

interface ChainRowLike {
  id: string;
  status: string;
  sequence_order: number;
  approver_employee_id?: string | null;
  approver?: { id?: string | null; first_name?: string | null; last_name?: string | null } | null;
  workflow_step?: { approver_type?: string | null; phase?: string | null } | null;
}

function approverIdOf(row: ChainRowLike): string | null {
  return row.approver_employee_id ?? row.approver?.id ?? null;
}

/** Talep sahibinin gönderim satırı (1. adım REQUESTER) — "Talep sahibi" seçeneğini temsil eder. */
export function isRequesterSubmissionRow(row: Pick<ChainRowLike, 'sequence_order' | 'workflow_step'>): boolean {
  return row.sequence_order === 1 && row.workflow_step?.approver_type === 'REQUESTER';
}

/**
 * Revize sorumlusu olarak seçilebilecek ARA adımlar (talep sahibi seçeneği hariç).
 * activeCycleRows: aktif turun TÜM satırları (sunucuda service role; onay ekranında
 * request.approvals zaten aktif tura filtreli gelir).
 *
 * Kurallar: revizeyi isteyenden önce gelen, onaylanmış, onay fazındaki satırlar;
 * revizeyi isteyenin (satır sahibinin) kendi satırları hariç — kendine revize
 * göndermek anlamsız. Aynı kişinin farklı adımları ayrı seçenektir (ör. İşe
 * Giriş'te İK hem 1. hem 3. adımda: 3. adım = yalnız kendi bölümünü düzeltir).
 */
export function getRevisionTargetCandidates<T extends ChainRowLike>(
  activeCycleRows: T[],
  reviewer: { sequence_order: number; approver_employee_id: string }
): T[] {
  return activeCycleRows
    .filter(
      (row) =>
        row.sequence_order < reviewer.sequence_order &&
        row.status === 'APPROVED' &&
        (row.workflow_step?.phase ?? 'APPROVAL') === 'APPROVAL' &&
        !isRequesterSubmissionRow(row) &&
        approverIdOf(row) !== reviewer.approver_employee_id
    )
    .sort((a, b) => a.sequence_order - b.sequence_order);
}

/**
 * "Düzeltme sonrası" seçimi anlamlı mı: sorumlu ile revizeyi isteyen arasında
 * en az bir adım varsa iki mod farklı sonuç verir. Talep sahibi için sorumlunun
 * sırası 1'dir.
 */
export function isReturnModeRelevant(targetSequence: number, reviewerSequence: number): boolean {
  return reviewerSequence - targetSequence > 1;
}
