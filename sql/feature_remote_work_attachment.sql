-- =====================================================================
-- Uzaktan Çalışma Formu — talep edenin ek yükleme alanı (2026-11-20)
-- =====================================================================
-- Şirket talebi: "Uzaktan çalışma formuna ek yükleme alanı". Ek altyapısı
-- adım bazlıdır (workflow_step_attachments); diğer bireysel formlardaki (Görev
-- Formu, Talep Formu, Olur Yazısı) gibi 1. adıma (Talep Eden) opsiyonel slot.
-- Onay ekranı, talep detayı, indirme ve nihai PDF'e ekleme jeneriktir; form
-- tarafı: app/remote-work/new/page.tsx (PendingAttachmentsField / RequestEditAttachments).
-- Not: nihai PDF'e yalnız PDF ekler birleşir; JPEG/PNG detaydan indirilir (genel kısıt).
-- Idempotent; yalnız ekleme.
-- =====================================================================

INSERT INTO public.workflow_step_attachments
  (workflow_step_id, label, is_required, allowed_mime_types, max_file_size_bytes, max_files)
SELECT ws.id, 'Ek Dosya', false,
       ARRAY['application/pdf', 'image/jpeg', 'image/png'], 20971520, 20
FROM public.workflow_steps ws
JOIN public.workflow_definitions wd ON wd.id = ws.workflow_definition_id
WHERE wd.code = 'REMOTE_WORK'
  AND ws.step_order = 1
  AND ws.approver_type = 'REQUESTER'
  AND NOT EXISTS (
    SELECT 1 FROM public.workflow_step_attachments x WHERE x.workflow_step_id = ws.id
  );

DO $$
BEGIN
  IF (SELECT count(*)
      FROM public.workflow_step_attachments wsa
      JOIN public.workflow_steps ws ON ws.id = wsa.workflow_step_id
      JOIN public.workflow_definitions wd ON wd.id = ws.workflow_definition_id
      WHERE wd.code = 'REMOTE_WORK' AND ws.step_order = 1) <> 1 THEN
    RAISE EXCEPTION 'REMOTE_WORK 1. adımda tam bir ek slotu olmalı';
  END IF;
END $$;

-- =====================================================================
-- DEV  (ghrfpfapklbswydmyutb): 2026-11-20 uygulandı; e2e 11/11 (oluştur + PDF ek yükle,
--   talep eden ve onaycı görür/indirir, detay ve form açılır).
-- PROD (iiagqsbiexyukupkffwb): 2026-11-20 uygulandı; slot doğrulandı ("Ek Dosya", opsiyonel,
--   PDF/JPEG/PNG, 20 MB, 20 dosya, adım "Talep Eden").
-- =====================================================================
