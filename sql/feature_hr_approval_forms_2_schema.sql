-- ============================================================================
-- İK Onay Formları — 1/3: süreç tanımları + başlatma yetkisi + detay tabloları
-- ============================================================================
--
-- Kağıt formlar: MİY-EK-03_11 İşe Giriş Onay Formu, MİY-EK-03_10 İşten Çıkış Onay Formu.
-- Takip formlarıyla (EMPLOYEE_ONBOARDING / EMPLOYEE_SEPARATION) BAĞI YOK: ayrı
-- oluşturulur, maaş bilgisi Takip formlarında görünmez.
--
-- İK cevapları (2026-11-07):
--   - Başlatan: İK departmanındaki herkes (workflow_initiators: birim).
--   - Gören: İK departmanı + ORG_ADMIN + talep sahibi + onay zinciri (diğer kısıtlı İK
--     süreçleriyle aynı kural; 2026-11-09 kullanıcı kararı: admin de görür).
--   - Formun TAMAMINI İK doldurur; onaycılar yalnız paraflar (SIGN_ONLY).
--   - Talep nedeni, GÜN/AY/YIL (süre) serbest metin; "UGBT" etiketi kalır.
--   - Hak tablosunda TOPLAM otomatik hesaplanır ama elle değiştirilebilir.
--   - YKB (Ramazan Taş) ıslak imzalar; taranmış formu İK yükler (finans kapağı deseni).
--
-- Adımlar ayrı dosyada: feature_hr_approval_forms_2b_steps.sql
--   EMPLOYEE_ONBOARDING_APPROVAL : 1 İK (REQUESTER) → 2 Genel Müdür → 3 Asistan → 4 YKB tarama (REQUESTER, COMPLETION)
--   EMPLOYEE_SEPARATION_APPROVAL : 1 İK (REQUESTER) → 2 Hukuk Müşaviri → 3 Genel Müdür → 4 YKB tarama (REQUESTER, COMPLETION)
--
-- Süreçler is_active = false eklenir: kod deploy'una kadar menüde/listelerde görünmez.
-- Açma komutu dosyanın sonunda (dev: Faz 2/3 testinde; prod: deploy'dan sonra).
--
-- Sıra: bu dosya → 2b (adımlar) → 3/3 (ekler). Önce DEV, sonra PROD.
-- DEV: 2026-11-07 uygulandı (agent, MCP); gizli süreç kolonu 2026-11-09'da dev'den
-- geri alındı (dev_revert_hr_approval_forms_confidential.sql), bu dosya güncel hali.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Süreç tanımları (kısıtlı, kapalı başlar)
-- ----------------------------------------------------------------------------
INSERT INTO public.workflow_definitions (code, name, description, is_active, is_restricted)
VALUES
  ('EMPLOYEE_ONBOARDING_APPROVAL', 'İşe Giriş Onay Formu',
   'MİY-EK-03_11 — işe başlatılacak adayın ücret onayı.',
   false, true),
  ('EMPLOYEE_SEPARATION_APPROVAL', 'İşten Çıkış Onay Formu',
   'MİY-EK-03_10 — işten çıkışta hak ediş ve tazminat onayı.',
   false, true)
ON CONFLICT (code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2) Başlatma yetkisi: İnsan Kaynakları Departmanı (birim kodu dev/prod farklı → ada göre)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_unit_id uuid;
BEGIN
  -- STRICT: 0 ya da 1'den fazla kayıt varsa hata verir, işlem geri alınır.
  SELECT id INTO STRICT v_unit_id
  FROM public.organizational_units
  WHERE name = 'İnsan Kaynakları Departmanı';

  INSERT INTO public.workflow_initiators (workflow_definition_id, unit_id)
  SELECT wd.id, v_unit_id
  FROM public.workflow_definitions wd
  WHERE wd.code IN ('EMPLOYEE_ONBOARDING_APPROVAL', 'EMPLOYEE_SEPARATION_APPROVAL')
    AND NOT EXISTS (
      SELECT 1 FROM public.workflow_initiators wi
      WHERE wi.workflow_definition_id = wd.id AND wi.unit_id = v_unit_id
    );
END $$;

-- ----------------------------------------------------------------------------
-- 3) İşe Giriş Onay Formu — onboarding_approval_requests
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.onboarding_approval_requests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.requests(id) ON DELETE CASCADE,

  company_name                   text NOT NULL,    -- Şirket Unvanı (SGK kaydı olan şirket)
  project_name                   text NOT NULL,    -- Proje Adı (fiilen çalıştığı proje ve/veya ofis)

  -- Göreve başlatılması istenen aday
  candidate_name                 text NOT NULL,    -- Adı Soyadı
  candidate_title                text NOT NULL,    -- Görev Unvanı
  start_date                     date NOT NULL,    -- İşe Başlama Tarihi

  request_reason                 text NOT NULL,    -- Personel Talep Nedeni (serbest metin)
  replaced_employee_name         text,             -- Ayrılan Personelin Adı Soyadı
  replaced_employee_last_salary  numeric(14,2),    -- Son Aldığı Ücret (ayrılan personelin)
  candidate_last_salary          numeric(14,2),    -- Son Aldığı Ücret (işe girecek personelin önceki işi)
  info_note                      text,             -- Bilgi Notu

  -- Ücret bilgisi
  salary_scale_range             text,             -- Mevcut Ücret Skala Aralığı (serbest metin)
  proposed_net_salary            numeric(14,2),    -- Önerilen Ücret (Net)
  approved_salary                numeric(14,2),    -- Uygun Görülen Ücret

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT onboarding_approval_salaries_non_negative CHECK (
    coalesce(replaced_employee_last_salary, 0) >= 0
    AND coalesce(candidate_last_salary, 0) >= 0
    AND coalesce(proposed_net_salary, 0) >= 0
    AND coalesce(approved_salary, 0) >= 0
  )
);

COMMENT ON TABLE public.onboarding_approval_requests IS
  'İşe Giriş Onay Formu (EMPLOYEE_ONBOARDING_APPROVAL) — maaş içerir. '
  'Görünürlük requests RLS''inden miras (talep sahibi / onaycı / İK departmanı / ORG_ADMIN).';

-- ----------------------------------------------------------------------------
-- 4) İşten Çıkış Onay Formu — separation_approval_requests
-- ----------------------------------------------------------------------------
-- Hak tablosu satırları sabit (kağıttaki 8 satır) → kolon çifti:
--   *_period : GÜN/AY/YIL sütunu, serbest metin süre ("5 Gün", "1 Yıl")
--   *_amount : TL karşılığı. Eksi = şirket alacaklı (formda/PDF'te kırmızı).
-- deductions_amount pozitif girilir ve toplamdan DÜŞÜLÜR.
-- total_amount uygulamada otomatik hesaplanır; İK elle değiştirirse total_is_manual = true.
CREATE TABLE IF NOT EXISTS public.separation_approval_requests (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.requests(id) ON DELETE CASCADE,

  company_name        text NOT NULL,    -- Şirket Unvanı
  project_name        text NOT NULL,    -- Proje Adı

  -- İşten çıkışı istenen çalışan
  employee_name       text NOT NULL,    -- Adı Soyadı
  employee_title      text NOT NULL,    -- Görev Unvanı
  hire_date           date NOT NULL,    -- İşe Giriş Tarihi
  separation_date     date NOT NULL,    -- İşten Çıkış Tarihi
  separation_reason   text NOT NULL,    -- İşten Çıkış Sebebi
  last_salary         numeric(14,2),    -- Son Maaşı

  -- Hak tablosu
  final_salary_period   text,  final_salary_amount   numeric(14,2),  -- Hakedilen Son Maaş
  severance_period      text,  severance_amount      numeric(14,2),  -- Kıdem Tazminat Hakkı
  notice_period         text,  notice_amount         numeric(14,2),  -- İhbar Süresi/İhbar Tazminatı Hakkı
  ugbt_period           text,  ugbt_amount           numeric(14,2),  -- UGBT Çalışmalarına Ait Hak
  overtime_period       text,  overtime_amount       numeric(14,2),  -- Fazla Mesailerine Ait Hak
  weekend_work_period   text,  weekend_work_amount   numeric(14,2),  -- Hafta Sonu Çalışmalarına Ait Hak
  annual_leave_period   text,  annual_leave_amount   numeric(14,2),  -- Yıllık İzin Bakiyesi
  deductions_period     text,  deductions_amount     numeric(14,2),  -- Yapılacak Kesintiler

  total_amount          numeric(14,2),                  -- TOPLAM
  total_is_manual       boolean NOT NULL DEFAULT false, -- true: TOPLAM elle düzeltildi

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT separation_approval_dates_order CHECK (separation_date >= hire_date),
  CONSTRAINT separation_approval_last_salary_non_negative CHECK (coalesce(last_salary, 0) >= 0),
  CONSTRAINT separation_approval_deductions_non_negative CHECK (coalesce(deductions_amount, 0) >= 0)
);

COMMENT ON TABLE public.separation_approval_requests IS
  'İşten Çıkış Onay Formu (EMPLOYEE_SEPARATION_APPROVAL) — maaş/tazminat içerir. '
  'Görünürlük requests RLS''inden miras (talep sahibi / onaycı / İK departmanı / ORG_ADMIN).';
COMMENT ON COLUMN public.separation_approval_requests.total_is_manual IS
  'false: TOPLAM = hak satırları − kesintiler (uygulama hesaplar). true: İK elle düzeltti.';

-- ----------------------------------------------------------------------------
-- 5) RLS — iki tablo aynı kalıp
-- ----------------------------------------------------------------------------
-- Okuma: talebi görebilen (requests_select alt sorguda uygulanır). Kural tek yerde:
--        requests RLS + can_view_workflow_requests.
-- Ekleme: yalnız talep sahibi. Güncelleme: yalnız talep sahibi, Taslak/Revize'de.
--        Onaycılar SIGN_ONLY → detaya yazmaz. Silme: requests CASCADE ile.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['onboarding_approval_requests', 'separation_approval_requests'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.requests r WHERE r.id = %I.request_id))
    $p$, t || '_select', t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.requests r
        WHERE r.id = %I.request_id
          AND r.requester_employee_id = public.get_current_employee_id()
      ))
    $p$, t || '_insert', t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format($p$
      CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.requests r
        WHERE r.id = %I.request_id
          AND r.requester_employee_id = public.get_current_employee_id()
          AND r.status IN ('DRAFT', 'REVISION_REQUESTED')
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.requests r
        WHERE r.id = %I.request_id
          AND r.requester_employee_id = public.get_current_employee_id()
          AND r.status IN ('DRAFT', 'REVISION_REQUESTED')
      ))
    $p$, t || '_update', t, t, t);

    -- Yetkiler: anon hiçbir şey; istemci okur/ekler/günceller (RLS), silmez.
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

COMMIT;

-- ----------------------------------------------------------------------------
-- Doğrulama (salt okuma)
-- ----------------------------------------------------------------------------
-- SELECT code, name, is_active, is_restricted
-- FROM public.workflow_definitions WHERE code LIKE 'EMPLOYEE_%_APPROVAL';      -- 2 satır, false/true
--
-- SELECT wd.code, ou.name FROM public.workflow_initiators wi
-- JOIN public.workflow_definitions wd ON wd.id = wi.workflow_definition_id
-- JOIN public.organizational_units ou ON ou.id = wi.unit_id
-- WHERE wd.code LIKE 'EMPLOYEE_%_APPROVAL';                                   -- 2 satır, İK Departmanı
--
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE tablename IN ('onboarding_approval_requests', 'separation_approval_requests')
-- ORDER BY 1, 3;                                                               -- 6 satır
--
-- SELECT has_table_privilege('anon', 'public.separation_approval_requests', 'SELECT');          -- false
-- SELECT has_table_privilege('authenticated', 'public.separation_approval_requests', 'DELETE'); -- false

-- ----------------------------------------------------------------------------
-- Açma (ŞİMDİ ÇALIŞTIRMA)
--   DEV : adımlar Table Editor'dan girildikten ve 3/3 çalıştırıldıktan sonra.
--   PROD: kod deploy edildikten sonra.
-- ----------------------------------------------------------------------------
-- UPDATE public.workflow_definitions SET is_active = true, updated_at = now()
-- WHERE code IN ('EMPLOYEE_ONBOARDING_APPROVAL', 'EMPLOYEE_SEPARATION_APPROVAL');
