-- Şehir İçi/Dışı Görev Formu (TRAVEL_ASSIGNMENT) — COMPLETION fazı değişikliği
-- ============================================================================
-- Amaç:
--   1) Görev tamamlamayı (gerçekleşen tarih/saat) Ankara Yönetici Asistanı yerine
--      GÖREVE GİDEN KİŞİ (= talep eden) yapsın.
--   2) Tamamlama adımına bir "görev özeti / bilgilendirme" alanı eklensin (zorunlu).
--
-- NOT: READ-only kuralı gereği bu script kullanıcı tarafından çalıştırılır.
-- NOT: Sadece YENİ açılan talepleri etkiler. Şu an onay fazında bekleyen mevcut
--      talepler (request_approvals satırları zaten oluşturulmuş) eski haliyle
--      Ankara asistanına düşmeye devam eder — bilinçli tercih.
-- ============================================================================

BEGIN;

-- 1) Görev özeti kolonu
ALTER TABLE travel_assignment_requests
  ADD COLUMN IF NOT EXISTS assignment_summary text;

-- 2) COMPLETION adımının onaycısını talep edene (göreve giden kişiye) çevir
UPDATE workflow_steps
SET approver_type     = 'REQUESTER',
    static_position_id = NULL,
    name               = 'Göreve Giden (Tamamlama)'
WHERE workflow_definition_id = (
        SELECT id FROM workflow_definitions WHERE code = 'TRAVEL_ASSIGNMENT'
      )
  AND phase            = 'COMPLETION'
  AND form_section_key = 'actual_dates';

COMMIT;

-- ============================================================================
-- Doğrulama (opsiyonel — çalıştırıp sonucu kontrol edebilirsin):
--
-- SELECT step_order, name, approver_type, action_type, phase, form_section_key,
--        static_position_id
-- FROM workflow_steps
-- WHERE workflow_definition_id =
--       (SELECT id FROM workflow_definitions WHERE code = 'TRAVEL_ASSIGNMENT')
-- ORDER BY step_order;
--
-- 6. satır: approver_type = REQUESTER, static_position_id = NULL olmalı.
-- ============================================================================
