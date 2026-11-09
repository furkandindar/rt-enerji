-- ============================================================================
-- Uzaktan Çalışma Formu (REMOTE_WORK) — bireysel süreç
-- ============================================================================
--
-- Kağıt form izin formunun kopyası; izin altyapısı (leave_requests, izin API'si,
-- izin PDF şablonu) yeniden kullanılır, süreç ayrıdır (kod, menü, PDF başlığı,
-- arşiv klasörü). İzin bakiyesine dokunmaz.
--
-- Zincir (kağıttaki ONAY satırı = Kısa Süreli İzin zinciri, aynı pozisyonlar):
--   1 Talep Eden (REQUESTER) → 2 İlgili Bölüm Müdürü (UNIT_HEAD) →
--   3 İnsan Kaynakları (İK Şefi) → 4 Genel Koordinatör (Genel Müdür); 2-4 SIGN_ONLY.
-- Adımlar SHORT_LEAVE'den kopyalanır → dev ve prod kendi pozisyonlarını kullanır.
-- SHORT_LEAVE 3. adımındaki ek alanı (borçlanma muvafakatnamesi) KOPYALANMAZ.
--
-- Varsayımlar (İK cevabı beklenmeden, kullanıcı kararı 2026-11-10):
--   - "ASİSTAN – Bildirim" izin formundaki gibi yalnız formda/PDF'te yazı.
--   - "Hafta sonu ve resmi tatillerle birleştirilemez" kural olarak yazılır;
--     sistem engellemez (tatil takvimi yok).
--
-- Süreç kapalı başlar (is_active=false); açma deploy'dan sonra (dosya sonunda).
-- Önce DEV, sonra PROD.
-- ============================================================================

-- Yeni enum değeri bu script içinde kullanılmıyor (aynı transaction'da kullanılamaz).
ALTER TYPE public.leave_type ADD VALUE IF NOT EXISTS 'REMOTE_WORK';

INSERT INTO public.workflow_definitions (code, name, description, is_active, is_restricted)
VALUES (
  'REMOTE_WORK',
  'Uzaktan Çalışma Formu',
  'Uzaktan çalışma talebi — Talep Eden → İlgili Bölüm Müdürü → İnsan Kaynakları → Genel Koordinatör.',
  false,
  false
)
ON CONFLICT (code) DO NOTHING;

DO $$
DECLARE
  v_shape text;
  v_count int;
BEGIN
  -- Kopyalanacak zincir beklenen şekilde mi? (değiştiyse durup insana sor)
  SELECT string_agg(ws.step_order || ':' || ws.approver_type || ':' || ws.action_type, ',' ORDER BY ws.step_order)
    INTO v_shape
  FROM public.workflow_steps ws
  JOIN public.workflow_definitions wd ON wd.id = ws.workflow_definition_id
  WHERE wd.code = 'SHORT_LEAVE';

  IF v_shape IS DISTINCT FROM
     '1:REQUESTER:FILL_AND_SIGN,2:UNIT_HEAD:SIGN_ONLY,3:STATIC_POSITION:SIGN_ONLY,4:STATIC_POSITION:SIGN_ONLY' THEN
    RAISE EXCEPTION 'SHORT_LEAVE zinciri beklenenden farklı: %', v_shape;
  END IF;

  INSERT INTO public.workflow_steps
    (workflow_definition_id, step_order, name, approver_type, static_position_id,
     is_required, action_type, form_section_key, condition, phase, can_add_extra_approvers)
  SELECT rw.id,
         s.step_order,
         CASE s.step_order
           WHEN 1 THEN 'Talep Eden'
           WHEN 2 THEN 'İlgili Bölüm Müdürü'
           WHEN 3 THEN 'İnsan Kaynakları'
           WHEN 4 THEN 'Genel Koordinatör'
         END,
         s.approver_type, s.static_position_id, s.is_required, s.action_type,
         s.form_section_key, s.condition, s.phase, s.can_add_extra_approvers
  FROM public.workflow_steps s
  JOIN public.workflow_definitions sl ON sl.id = s.workflow_definition_id AND sl.code = 'SHORT_LEAVE'
  CROSS JOIN (SELECT id FROM public.workflow_definitions WHERE code = 'REMOTE_WORK') rw
  WHERE NOT EXISTS (SELECT 1 FROM public.workflow_steps x WHERE x.workflow_definition_id = rw.id);

  SELECT count(*) INTO v_count
  FROM public.workflow_steps ws
  JOIN public.workflow_definitions wd ON wd.id = ws.workflow_definition_id
  WHERE wd.code = 'REMOTE_WORK';

  IF v_count <> 4 THEN
    RAISE EXCEPTION 'REMOTE_WORK için 4 adım bekleniyordu, bulunan %', v_count;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Doğrulama (salt okuma)
-- ----------------------------------------------------------------------------
-- SELECT ws.step_order, ws.name, ws.approver_type, ws.action_type, p.title
-- FROM workflow_steps ws JOIN workflow_definitions wd ON wd.id = ws.workflow_definition_id
-- LEFT JOIN positions p ON p.id = ws.static_position_id
-- WHERE wd.code = 'REMOTE_WORK' ORDER BY ws.step_order;
--
-- Açma (deploy'dan SONRA):
-- UPDATE workflow_definitions SET is_active = true WHERE code = 'REMOTE_WORK';
