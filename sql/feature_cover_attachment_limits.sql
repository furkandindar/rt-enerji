-- Ek dosya limitleri — 20 dosya / 20 MB + izin verilen türlerin bucket'a hizalanması
-- ============================================================================
-- BÖLÜM A — UYGULANDI: 2026-09-19, dev + prod (kullanıcı tarafından, elle)
--   workflow_step_attachments tablosundaki TÜM satırlar (14 satır):
--     max_files = 20, max_file_size_bytes = 20971520 (20 MB)
--   Talep yalnız Finans Onay Kapağı içindi; kullanıcı tüm süreçlere uyguladı.
--   Eski değerler (geri alma gerekirse): finans/muhasebe kapağı 10, EXPENSE 20,
--   COMPARISON 10, REQUEST_FORM 10, APPROVAL_LETTER 5, OVERTIME 5, TRAVEL 3,
--   ONBOARDING (Zimmet, CV) / SEPARATION / muvafakatname slotları 1; hepsi 10 MB.
--
-- BÖLÜM B — BEKLİYOR: izin verilen tür yalnız PDF (aşağıdaki UPDATE)
--   6 config JPEG/PNG'ye izin veriyor ama `workflow-attachments` bucket'ı yalnız
--   application/pdf kabul ediyor → görseller validasyondan geçip Storage'da
--   reddediliyor (prod'da bugüne dek 0 adet PDF-dışı ek var). Config gerçeğe
--   hizalanır; kullanıcı dosyayı seçtiği anda "desteklenmeyen tür" uyarısı görür.
--   Deploy'dan bağımsızdır, istenen an uygulanabilir.
--
-- BOYUT HAKKINDA — ÖNEMLİ:
--   20 MB yalnız dosyayı doğrudan Storage'a yükleyen akışta gerçektir
--   (app/api/attachments/upload-url + confirm; lib/attachments/upload-attachment.ts).
--   Eski multipart rotasında (/api/attachments/upload) dosya Next rotasının
--   gövdesinden geçer ve Vercel istek sınırına (~4.5 MB) takılır; bu rotayı
--   kullanan formlarda ekranda "20 MB" yazsa da ~4.5 MB üstü dosya yüklenemez.
--   Bucket limiti 25 MB — 20 MB için yeterli.
-- ============================================================================

BEGIN;

UPDATE workflow_step_attachments
SET allowed_mime_types = '{application/pdf}'
WHERE allowed_mime_types <> '{application/pdf}';
-- Beklenen (prod): 6 satır — ACCOUNTING_APPROVAL_COVER, APPROVAL_LETTER,
-- COMPARISON_FORM, EXPENSE_FORM, FINANCE_APPROVAL_COVER, TRAVEL_ASSIGNMENT

COMMIT;

-- ============================================================================
-- Doğrulama
-- ============================================================================
-- SELECT wd.code, ws.step_order, wsa.label, wsa.max_files, wsa.max_file_size_bytes, wsa.allowed_mime_types
-- FROM workflow_step_attachments wsa
-- JOIN workflow_steps ws ON ws.id = wsa.workflow_step_id
-- JOIN workflow_definitions wd ON wd.id = ws.workflow_definition_id
-- ORDER BY wd.code, ws.step_order;
-- Beklenen: tüm satırlar 20 / 20971520 / {application/pdf}

-- ============================================================================
-- (Opsiyonel) Tek belgelik slotları tekrar 1 dosyaya çekmek istenirse
-- ============================================================================
-- UPDATE workflow_step_attachments
-- SET max_files = 1
-- WHERE label IN ('Zimmet Tutanağı', 'CV', 'Borçlanma Muvafakatnamesi', 'Maaş Kesintisi Muvafakatı');
-- Beklenen: 6 satır
