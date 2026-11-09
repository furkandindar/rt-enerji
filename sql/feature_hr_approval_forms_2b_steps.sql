-- ============================================================================
-- İK Onay Formları — 2b: onay adımları (workflow_steps)
-- ============================================================================
--
-- Sıra: 2_schema'dan sonra, 3_attachments'tan önce. Kağıttaki sıra korunur (İK cevabı, 2026-11-07).
--
--   EMPLOYEE_ONBOARDING_APPROVAL
--     1 İnsan Kaynakları        REQUESTER        FILL_AND_SIGN  request_info    APPROVAL
--     2 Genel Müdür             Genel Müdür      SIGN_ONLY      –               APPROVAL
--     3 Asistan                 Yön. Asist. Antalya SIGN_ONLY   –               APPROVAL
--     4 Yönetim Kurulu Başkanı  REQUESTER        FILL_AND_SIGN  ykb_signed_pdf  COMPLETION
--   EMPLOYEE_SEPARATION_APPROVAL
--     1 İnsan Kaynakları        REQUESTER        FILL_AND_SIGN  request_info    APPROVAL
--     2 Hukuk Müşaviri          Hukuk Müşaviri   SIGN_ONLY      –               APPROVAL
--     3 Genel Müdür             Genel Müdür      SIGN_ONLY      –               APPROVAL
--     4 Yönetim Kurulu Başkanı  REQUESTER        FILL_AND_SIGN  ykb_signed_pdf  COMPLETION
--
-- PROD pozisyonları (2026-11-07 sahipleri): Genel Müdür = Bekir Korkmaz,
-- Yönetici Asistanı Antalya = Burcu Akdoğan, Hukuk Müşaviri = Av. Güliz Kaya.
-- Pozisyon unvanla bulunur ve tek aktif sahibi olması şart koşulur (çift atama
-- → motor onaycıyı çözemez, form açılamaz).
--
-- DEV'de farklı uygulandı (2026-11-07): dev'de asistan/hukuk pozisyonu yok ve
-- tek ORG_ADMIN (deneme.admin) Genel Müdür. Zincir tamamen test kullanıcılarıyla
-- kuruldu (admin zincir dışında kalsın diye):
--   Genel Müdür → Genel Müdür Yardımcısı (deneme3), Asistan → Finans Uzmanı
--   (deneme4), Hukuk Müşaviri → Muhasebe Müdürü (deneme.yonetici).
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_gm     uuid;
  v_asist  uuid;
  v_hukuk  uuid;
  v_title  text;
BEGIN
  -- Unvan → pozisyon; tam olarak bir pozisyon ve tek aktif sahip şartı
  FOREACH v_title IN ARRAY ARRAY['Genel Müdür', 'Yönetici Asistanı Antalya', 'Hukuk Müşaviri'] LOOP
    IF (SELECT count(*) FROM public.positions WHERE title = v_title) <> 1 THEN
      RAISE EXCEPTION 'Pozisyon tekil değil: %', v_title;
    END IF;
    IF (SELECT count(*) FROM public.employee_positions ep
        JOIN public.positions p ON p.id = ep.position_id
        WHERE p.title = v_title AND ep.end_date IS NULL) <> 1 THEN
      RAISE EXCEPTION 'Pozisyonun tek aktif sahibi yok: %', v_title;
    END IF;
  END LOOP;

  SELECT id INTO v_gm    FROM public.positions WHERE title = 'Genel Müdür';
  SELECT id INTO v_asist FROM public.positions WHERE title = 'Yönetici Asistanı Antalya';
  SELECT id INTO v_hukuk FROM public.positions WHERE title = 'Hukuk Müşaviri';

  WITH wd AS (
    SELECT id, code FROM public.workflow_definitions
    WHERE code IN ('EMPLOYEE_ONBOARDING_APPROVAL', 'EMPLOYEE_SEPARATION_APPROVAL')
  ), steps(code, step_order, name, approver_type, static_position_id, action_type, form_section_key, phase) AS (
    VALUES
    ('EMPLOYEE_ONBOARDING_APPROVAL', 1, 'İnsan Kaynakları',       'REQUESTER',       NULL::uuid, 'FILL_AND_SIGN', 'request_info',   'APPROVAL'),
    ('EMPLOYEE_ONBOARDING_APPROVAL', 2, 'Genel Müdür',            'STATIC_POSITION', v_gm,       'SIGN_ONLY',     NULL,             'APPROVAL'),
    ('EMPLOYEE_ONBOARDING_APPROVAL', 3, 'Asistan',                'STATIC_POSITION', v_asist,    'SIGN_ONLY',     NULL,             'APPROVAL'),
    ('EMPLOYEE_ONBOARDING_APPROVAL', 4, 'Yönetim Kurulu Başkanı', 'REQUESTER',       NULL,       'FILL_AND_SIGN', 'ykb_signed_pdf', 'COMPLETION'),
    ('EMPLOYEE_SEPARATION_APPROVAL', 1, 'İnsan Kaynakları',       'REQUESTER',       NULL,       'FILL_AND_SIGN', 'request_info',   'APPROVAL'),
    ('EMPLOYEE_SEPARATION_APPROVAL', 2, 'Hukuk Müşaviri',         'STATIC_POSITION', v_hukuk,    'SIGN_ONLY',     NULL,             'APPROVAL'),
    ('EMPLOYEE_SEPARATION_APPROVAL', 3, 'Genel Müdür',            'STATIC_POSITION', v_gm,       'SIGN_ONLY',     NULL,             'APPROVAL'),
    ('EMPLOYEE_SEPARATION_APPROVAL', 4, 'Yönetim Kurulu Başkanı', 'REQUESTER',       NULL,       'FILL_AND_SIGN', 'ykb_signed_pdf', 'COMPLETION')
  )
  INSERT INTO public.workflow_steps
    (workflow_definition_id, step_order, name, approver_type, static_position_id,
     is_required, action_type, form_section_key, condition, phase, can_add_extra_approvers)
  SELECT wd.id, s.step_order, s.name, s.approver_type::public.approver_type, s.static_position_id,
         true, s.action_type, s.form_section_key, NULL, s.phase, false
  FROM steps s JOIN wd ON wd.code = s.code
  WHERE NOT EXISTS (SELECT 1 FROM public.workflow_steps x WHERE x.workflow_definition_id = wd.id);
END $$;

COMMIT;

-- Doğrulama:
-- SELECT wd.code, ws.step_order, ws.name, ws.approver_type, p.title, ws.action_type, ws.form_section_key, ws.phase
-- FROM public.workflow_steps ws
-- JOIN public.workflow_definitions wd ON wd.id = ws.workflow_definition_id
-- LEFT JOIN public.positions p ON p.id = ws.static_position_id
-- WHERE wd.code LIKE 'EMPLOYEE_%_APPROVAL' ORDER BY 1, 2;                    -- 8 satır
