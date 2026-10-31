// Talep oluşturma uçlarının (POST /api/<süreç>) ortak hata/geri alma yardımcıları.
//
// Akış: onay zinciri talep kaydından ÖNCE çözülür (resolveApprovalChain) — onaycısı
// bulunamayan adım varsa hiç kayıt oluşmaz. Sonraki adımlarda (detay/kalem insert,
// zincir insert) hata olursa yarım talep rollbackCreatedRequest ile silinir.
//
// Sunucuya özel (service role + NextResponse) — lib/workflow/index'ten re-export EDİLMEZ.

import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ApprovalChainResolutionError } from "./workflow-service";

/**
 * Zincir çözme/yazma hatasını yanıta çevirir. ApprovalChainResolutionError
 * kullanıcıya gösterilecek Türkçe mesaj taşır (422); diğerleri beklenmeyen
 * hatadır (500, ayrıntı yalnız logda).
 */
export function approvalChainErrorResponse(error: unknown, context: string): NextResponse {
  if (error instanceof ApprovalChainResolutionError) {
    console.warn(`[${context}] approval chain unresolvable:`, error.message);
    return NextResponse.json({ error: error.message }, { status: 422 });
  }
  console.error(`[${context}] approval chain error:`, error);
  return NextResponse.json({ error: "Onay zinciri oluşturulamadı" }, { status: 500 });
}

/**
 * Aynı istekte az önce oluşturulan talebi geri alır.
 *
 * Service role gerekçesi: requests ve detay tablolarında DELETE policy yok; RLS'li
 * client ile silme hata vermeden 0 satır etkiler ve talep PENDING + onay satırsız
 * kalırdı (2026-001990 vakası). Silme yalnız bu istekte insert edilen id ile
 * sınırlıdır. Detay, kalem, onay ve ek tabloları requests'e ON DELETE CASCADE
 * bağlı; tek silme hepsini temizler. Storage dosyaları (ör. kaşe PDF'i) çağıranın
 * sorumluluğundadır.
 */
export async function rollbackCreatedRequest(requestId: string, context: string): Promise<void> {
  const admin = createServiceRoleClient();
  const { error, count } = await admin
    .from("requests")
    .delete({ count: "exact" })
    .eq("id", requestId);

  if (error || count !== 1) {
    console.error(
      `[${context}] rollback failed — request ${requestId} must be cleaned up manually:`,
      error ?? `${count} rows deleted`
    );
  }
}
