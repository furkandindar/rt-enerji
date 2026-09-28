// Ek onaycı (yöneticinin onay zincirine kişi eklemesi) — saf, client-safe yardımcılar.
//
// Model (bkz. sql/feature_olur_extra_approvers.sql):
//  - workflow_steps.can_add_extra_approvers = true olan APPROVAL adımının onaycısı
//    (Olur'da Genel Koordinatör / Genel Müdür adımı) sırası geldiğinde zincire kişi
//    ekleyebilir. Yetki adım/pozisyon bazlıdır, isim bazlı değil.
//  - Eklenen kişiler o adımdan ÖNCEKİ en yakın DYNAMIC_USER_LIST adımına yazılır
//    ("Ek Onaycılar"). Kimse seçilmezse adım hiç oluşmaz.
//
// Sunucu tarafı (service role gerektiren) kısım: ./extra-approvers.ts

/** Tek seferde (ve talep başına toplamda) seçilebilecek en fazla ek onaycı. */
export const MAX_EXTRA_APPROVERS = 10;

/** Ek onaycı çözümlemesi için gereken workflow_steps alanları. */
export interface ExtraApproverStepLike {
  id: string;
  step_order: number;
  approver_type: string;
  phase?: string | null;
  name?: string | null;
  // SQL uygulanmadan önce kolon yoktur → undefined (özellik kapalı sayılır)
  can_add_extra_approvers?: boolean | null;
}

export interface ExtraApproverTarget {
  /** Kişi ekleyebilen (bayraklı) adım */
  managerStepId: string;
  managerStepOrder: number;
  /** Eklenenlerin yazıldığı DYNAMIC_USER_LIST adımı */
  dynamicStepId: string;
  dynamicStepName: string | null;
}

function isApprovalPhase(step: ExtraApproverStepLike): boolean {
  return (step.phase ?? 'APPROVAL') === 'APPROVAL';
}

/**
 * Bayraklı bir adım için hedef DYNAMIC_USER_LIST adımını çözer.
 * Adım bayraklı/APPROVAL değilse veya öncesinde dinamik adım yoksa null
 * (yapılandırma eksik → özellik o adımda kapalı).
 */
export function resolveExtraApproverTarget(
  steps: ExtraApproverStepLike[],
  managerStepId: string
): ExtraApproverTarget | null {
  const manager = steps.find((s) => s.id === managerStepId);
  if (!manager || manager.can_add_extra_approvers !== true || !isApprovalPhase(manager)) {
    return null;
  }

  const dynamic = steps
    .filter(
      (s) =>
        s.step_order < manager.step_order &&
        s.approver_type === 'DYNAMIC_USER_LIST' &&
        isApprovalPhase(s)
    )
    .sort((a, b) => b.step_order - a.step_order)[0];

  if (!dynamic) return null;

  return {
    managerStepId: manager.id,
    managerStepOrder: manager.step_order,
    dynamicStepId: dynamic.id,
    dynamicStepName: dynamic.name ?? null,
  };
}

/** Süreçte ek onaycı ekleyebilen, yapılandırması tam en az bir adım var mı? */
export function hasExtraApproverSupport(steps: ExtraApproverStepLike[]): boolean {
  return steps.some(
    (s) => s.can_add_extra_approvers === true && resolveExtraApproverTarget(steps, s.id) !== null
  );
}

/**
 * Talep sahibinin (veya önceki turun) listesi ile yöneticinin eklediği kilitli
 * kişileri birleştirir: önce talep sahibinin seçtikleri (kilitliler hariç,
 * sırası korunarak), sonra kilitliler ekleme sırasıyla — böylece yöneticinin
 * eklediği kişiler her turda yöneticinin hemen önünde kalır. Tekrarlar tekilleşir.
 */
export function mergeWithLockedApprovers(base: string[], locked: string[]): string[] {
  const lockedSet = new Set(locked);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const id of [...base.filter((id) => !lockedSet.has(id)), ...locked]) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}
