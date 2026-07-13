-- Yıllık İzin + Kısa Süreli İzin — Borçlanma Muvafakatnamesi ek dosya slotu
-- ============================================================================
-- Amaç:
--   İzin hakkı olmayan (borçlandırılan) personelden alınan muvafakatnamenin
--   sisteme ek olarak yüklenebilmesi. Slot, "Personel Müdürlüğü" onay adımına
--   tanımlanır: kalan izin gününü zaten bu adım girdiği için borçlanmayı ilk
--   tespit eden onaycı, muvafakatnameyi de aynı ekranda yükler.
--
-- Emsal: SALARY_ADVANCE → "Maaş Kesintisi Muvafakatı" (Personel Müdürlüğü
--        adımı, opsiyonel, yalnız PDF). Bu script aynı deseni izler.
--
-- NOT: READ-only kuralı gereği bu script kullanıcı tarafından çalıştırılır
--      (önce dev, sonra prod — iki ortamda da adım adları doğrulandı, aynı).
-- NOT: Kod değişikliği GEREKMEZ. Onaycı paneli (approval-actions.tsx) adımda
--      konfigürasyon görünce yükleme kutusunu otomatik gösterir; detay sayfası
--      ve nihai PDF birleştirme (merge-attachments.ts) zaten jeneriktir.
-- NOT: Yalnız PDF kabul edilir — merge-attachments.ts görüntü (JPEG/PNG)
--      birleştiremez; görüntü eki nihai PDF'e sessizce girmezdi.
-- NOT: Şu an Personel Müdürlüğü adımında bekleyen mevcut talepler de slotu
--      hemen görür (konfigürasyon render anında okunur) — istenen davranış.
-- NOT: is_required=false — çoğu talepte borçlanma yok; zorunluluk prosedürle
--      sağlanır. İleride "kalan gün < talep edilen gün ise zorunlu" koşulu
--      istenirse app/api/approvals/[id]/route.ts'e küçük bir kontrol eklenir.
-- ============================================================================

BEGIN;

INSERT INTO workflow_step_attachments
  (workflow_step_id, label, is_required, allowed_mime_types, max_file_size_bytes, max_files)
SELECT ws.id,
       'Borçlanma Muvafakatnamesi',
       false,
       ARRAY['application/pdf'],
       10485760,          -- 10 MB (sistem konvansiyonu)
       5                  -- avans emsaliyle aynı
FROM workflow_steps ws
JOIN workflow_definitions wd ON wd.id = ws.workflow_definition_id
WHERE wd.code IN ('ANNUAL_LEAVE', 'SHORT_LEAVE')
  AND ws.name = 'Personel Müdürlüğü'
  AND NOT EXISTS (
        SELECT 1
        FROM workflow_step_attachments wsa
        WHERE wsa.workflow_step_id = ws.id
          AND wsa.label = 'Borçlanma Muvafakatnamesi'
      );

COMMIT;

-- ============================================================================
-- Doğrulama (2 satır dönmeli — ANNUAL_LEAVE ve SHORT_LEAVE için birer tane):
--
-- SELECT wd.code, ws.step_order, ws.name AS step_name,
--        wsa.label, wsa.is_required, wsa.allowed_mime_types, wsa.max_files
-- FROM workflow_step_attachments wsa
-- JOIN workflow_steps ws        ON ws.id = wsa.workflow_step_id
-- JOIN workflow_definitions wd  ON wd.id = ws.workflow_definition_id
-- WHERE wd.code IN ('ANNUAL_LEAVE', 'SHORT_LEAVE');
--
-- Script idempotenttir: ikinci kez çalıştırılırsa NOT EXISTS sayesinde
-- mükerrer satır oluşmaz.
-- ============================================================================
