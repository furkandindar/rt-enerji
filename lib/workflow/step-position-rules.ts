// Sabit pozisyonlu adıma (STATIC_POSITION) atanabilecek pozisyon kuralı.
//
// Onay motoruyla aynı: getEmployeeByPosition (workflow-service.ts) pozisyondaki
// açık atamayı (end_date IS NULL) .single() ile alır — sıfır ya da birden fazla
// atamada onaycı çözülemez ve o süreçte talep oluşturulamaz. Pasif çalışana düşen
// onaylar da takılı kalır. Süreç Tanımları ekranı (seçim listesi) ve
// PATCH /api/workflow-steps/[id] aynı fonksiyonu kullanır; panelden bu durumlara
// yol açan bir pozisyon seçilemez.
//
// Saf modül (istemci + sunucu).

export interface AssignablePositionLike {
  is_active: boolean;
  /** Açık atamalar (employee_positions.end_date IS NULL) ve çalışan durumu */
  holders: { status: string }[];
}

/** Pozisyon adıma atanamıyorsa Türkçe nedeni, atanabiliyorsa null döner. */
export function positionAssignmentBlocker(position: AssignablePositionLike): string | null {
  if (!position.is_active) return "Pozisyon pasif.";
  if (position.holders.length === 0) return "Pozisyonda aktif atama yok.";
  if (position.holders.length > 1) return "Pozisyonda birden fazla aktif atama var.";
  if (position.holders[0].status !== "ACTIVE") return "Pozisyondaki çalışan pasif.";
  return null;
}

/** Adım adı sınırı (UI + API). */
export const STEP_NAME_MAX_LENGTH = 100;
