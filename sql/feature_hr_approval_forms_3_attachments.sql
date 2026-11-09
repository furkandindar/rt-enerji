-- ============================================================================
-- İK Onay Formları — 3/3: ek dosya alanı (1. adım, İK)
-- ============================================================================
--
-- İK cevabı (2026-11-07): "Evet eklenebilir" → isteğe bağlı ek alanı; zorunlu belge yok.
-- Sınırlar finans kapağıyla aynı: PDF/JPG/PNG, dosya başı 20 MB, en fazla 20 dosya.
-- YKB'nin ıslak imzalı taraması bu alan DEĞİL: 4. adımın form_section_key'i
-- (ykb_signed_pdf) ile ayrı yüklenir.
--
-- Önkoşul: 2b (adımlar) uygulanmış olmalı (1. adım = step_order 1).
-- Adım yoksa hiçbir şey eklemez; DO bloğu bunu hata olarak bildirir.
-- DEV: 2026-11-07 uygulandı (agent, MCP).
-- ============================================================================

BEGIN;

INSERT INTO public.workflow_step_attachments
  (workflow_step_id, label, is_required, allowed_mime_types, max_file_size_bytes, max_files)
SELECT
  ws.id,
  CASE wd.code
    WHEN 'EMPLOYEE_ONBOARDING_APPROVAL' THEN 'Ek Dosyalar (CV, ücret skalası vb.)'
    ELSE 'Ek Dosyalar (istifa dilekçesi, hesap tablosu vb.)'
  END,
  false,
  ARRAY['application/pdf', 'image/jpeg', 'image/png'],
  20971520,  -- 20 MB
  20
FROM public.workflow_steps ws
JOIN public.workflow_definitions wd ON wd.id = ws.workflow_definition_id
WHERE wd.code IN ('EMPLOYEE_ONBOARDING_APPROVAL', 'EMPLOYEE_SEPARATION_APPROVAL')
  AND ws.step_order = 1
  AND NOT EXISTS (
    SELECT 1 FROM public.workflow_step_attachments x WHERE x.workflow_step_id = ws.id
  );

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.workflow_step_attachments wsa
  JOIN public.workflow_steps ws ON ws.id = wsa.workflow_step_id
  JOIN public.workflow_definitions wd ON wd.id = ws.workflow_definition_id
  WHERE wd.code IN ('EMPLOYEE_ONBOARDING_APPROVAL', 'EMPLOYEE_SEPARATION_APPROVAL');

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Beklenen 2 ek alanı, bulunan %. Adımlar Table Editor''dan girildi mi?', v_count;
  END IF;
END $$;

COMMIT;
