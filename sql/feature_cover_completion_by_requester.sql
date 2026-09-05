-- Onay Kapağı Finans + Muhasebe — COMPLETION (YKB imzalı tarama) adımı talep edene
-- ============================================================================
-- Uygulandı: 2026-09-05, dev + prod (kullanıcı tarafından, Supabase SQL Editor)
-- Plan/karar: docs/onay-havuzu-ve-vekalet-plan.md (Faz A)
--
-- Amaç:
--   YKB'nin ıslak imzaladığı taranmış PDF'i yükleme adımı (phase = COMPLETION,
--   form_section_key = ykb_signed_pdf) yalnız müdüre (F100 / M100) bağlıydı;
--   müdür izindeyken 30 talep AWAITING_COMPLETION'da kaldı. Kapağı açan kişi
--   (talep eden) zaten süreci takip eden kişi olduğundan adım REQUESTER'a
--   çevrildi — sql/feature_travel_completion_by_traveler.sql ile aynı desen.
--
-- Kod değişikliği YOK: PDF şablonu ykb satırını imza kolonlarından zaten hariç
-- tutuyor; ileriye dönük otomatik onay yalnız SIGN_ONLY adımlarda (bu adım
-- FILL_AND_SIGN); upload route approver = current user ile çalışıyor.
--
-- NOT: Sadece YENİ açılan ve YENİDEN GÖNDERİLEN (yeni revision_cycle) talepleri
--      etkiler. Mevcut request_approvals satırları eski haliyle müdürde kalır —
--      bilinçli tercih (2026-09-05 kararı).
-- NOT: 3. adım (Finans/Muhasebe Müdürü onayı, phase = APPROVAL) da aynı
--      pozisyona bağlıdır ve STATIC_POSITION KALMALIDIR — bu yüzden filtre
--      pozisyon id'si değil, phase + form_section_key üzerindendir.
-- ============================================================================

BEGIN;

UPDATE workflow_steps
SET approver_type      = 'REQUESTER',
    static_position_id = NULL
WHERE workflow_definition_id IN (
        SELECT id FROM workflow_definitions
        WHERE code IN ('FINANCE_APPROVAL_COVER', 'ACCOUNTING_APPROVAL_COVER')
      )
  AND phase            = 'COMPLETION'
  AND form_section_key = 'ykb_signed_pdf';
-- Beklenen: 2 satır

COMMIT;

-- ============================================================================
-- Doğrulama:
--
-- SELECT wd.code, ws.step_order, ws.approver_type, ws.static_position_id, ws.phase
-- FROM workflow_steps ws
-- JOIN workflow_definitions wd ON wd.id = ws.workflow_definition_id
-- WHERE wd.code IN ('FINANCE_APPROVAL_COVER', 'ACCOUNTING_APPROVAL_COVER')
-- ORDER BY wd.code, ws.step_order;
--
-- 3. satırlar: STATIC_POSITION + F100 / M100 (değişmemeli)
-- 5. satırlar: REQUESTER + NULL
-- ============================================================================
