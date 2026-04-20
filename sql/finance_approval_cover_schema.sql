-- ============================================================================
-- ONAY KAPAĞI FİNANS (Finance Approval Cover) - Veritabanı Şeması
-- ============================================================================
--
-- Workflow Code   : FINANCE_APPROVAL_COVER
-- Kısıtlı mı?     : EVET (sadece Finans Departmanı başlatabilir)
-- Adım Özeti      :
--   1) REQUESTER          (FILL_AND_SIGN)   - Talep Eden (Finans)
--   2) DYNAMIC_USER_LIST  (FILL_AND_SIGN)   - İlgili Kişiler (opsiyonel)
--   3) STATIC_POSITION    (SIGN_ONLY)       - Finans Müdürü
--   4) STATIC_POSITION    (SIGN_ONLY)       - Genel Müdür
--
-- NOT: workflow_steps ve workflow_initiators INSERT'leri kullanıcı tarafından
-- elle yazılacak (static_position_id, unit_id seçimi gerektiriyor).
-- Aşağıda şablon olarak verilmiştir (bkz. bölüm 5 ve 6).


-- ============================================================================
-- 1. ENUM TİPLERİ
-- ============================================================================

-- Binary alanlar (hesap müsaitliği, nakit kaydı, proforma) BOOLEAN olarak tutulur.
-- Çoklu-değerli alanlar için enum kullanılır.

CREATE TYPE public.finance_expense_area AS ENUM (
  'ANA_SAHA',
  'ELEKTRIKSEL_KAPASITE_ARTISI',
  'YEKA'
);

CREATE TYPE public.finance_funding_source AS ENUM (
  'KREDI',
  'OZ_KAYNAK',
  'NAKIT_FAZLASI',
  'DIGER'
);


-- ============================================================================
-- 2. ANA TABLO - finance_approval_cover_requests
-- ============================================================================

CREATE TABLE public.finance_approval_cover_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES public.requests(id) ON DELETE CASCADE,

  -- Başlık alanları
  subject                 TEXT NOT NULL,                                  -- Konu
  request_date            DATE NOT NULL DEFAULT CURRENT_DATE,             -- Tarih
  document_no             TEXT NOT NULL,                                  -- Sayı (örn: FNS/ŞUBAT-01)

  -- Değerlendirme alanları
  account_available        BOOLEAN                     NOT NULL,   -- Hesap müsait mi? (true=evet)
  cash_flow_recorded       BOOLEAN                     NOT NULL,   -- Nakit giriş/çıkış kaydı yapıldı mı? (true=yapıldı)
  expense_area             public.finance_expense_area NOT NULL,   -- Harcama alanı
  funding_source           public.finance_funding_source NOT NULL, -- Niteliği
  has_rt_enerji_proforma   BOOLEAN                     NOT NULL,   -- RT Enerji proforma var mı? (true=var)

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_finance_approval_cover_requests_request_id
  ON public.finance_approval_cover_requests(request_id);

COMMENT ON TABLE public.finance_approval_cover_requests IS
  'Onay Kapağı Finans talebinin başlık ve değerlendirme alanları';


-- ============================================================================
-- 3. ALT TABLO - finance_approval_cover_items (dinamik ödeme tablosu)
-- ============================================================================

CREATE TABLE public.finance_approval_cover_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  finance_request_id UUID NOT NULL REFERENCES public.finance_approval_cover_requests(id) ON DELETE CASCADE,
  row_order        SMALLINT      NOT NULL,                -- Satır sırası (1, 2, 3...)

  item_date        DATE          NOT NULL,                -- Tarih
  company_name     TEXT          NOT NULL,                -- Firma adı
  payee_name       TEXT          NOT NULL,                -- Ödeme yapılacak firma/kurum
  item_subject     TEXT          NOT NULL,                -- Konu (satıra ait)
  invoice_amount   NUMERIC(14,2) NOT NULL,                -- Fatura tutarı (TL)
  payable_amount   NUMERIC(14,2) NOT NULL,                -- Ödenecek tutar (TL)

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (finance_request_id, row_order),
  CHECK (invoice_amount >= 0),
  CHECK (payable_amount >= 0)
);

CREATE INDEX idx_finance_approval_cover_items_parent
  ON public.finance_approval_cover_items(finance_request_id);

COMMENT ON TABLE public.finance_approval_cover_items IS
  'Onay Kapağı Finans - ödeme tablosu satırları (min 1 satır uygulama katmanında doğrulanır)';


-- ============================================================================
-- 4. RLS POLİTİKALARI
-- ============================================================================

-- 4.1 finance_approval_cover_requests
ALTER TABLE public.finance_approval_cover_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_approval_cover_requests_select"
  ON public.finance_approval_cover_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = finance_approval_cover_requests.request_id
        AND (
          r.requester_employee_id IN (SELECT employee_id FROM public.app_users WHERE id = auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.request_approvals ra
            WHERE ra.request_id = r.id
              AND ra.approver_employee_id IN (SELECT employee_id FROM public.app_users WHERE id = auth.uid())
          )
          OR EXISTS (
            SELECT 1 FROM public.app_users au
            WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
          )
        )
    )
  );

CREATE POLICY "finance_approval_cover_requests_insert"
  ON public.finance_approval_cover_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.requests r
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE r.id = request_id AND au.id = auth.uid()
    )
  );

CREATE POLICY "finance_approval_cover_requests_update"
  ON public.finance_approval_cover_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE r.id = request_id AND au.id = auth.uid()
        AND r.status = 'DRAFT'
    )
  );


-- 4.2 finance_approval_cover_items
ALTER TABLE public.finance_approval_cover_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finance_approval_cover_items_select"
  ON public.finance_approval_cover_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.finance_approval_cover_requests fcr
      JOIN public.requests r ON r.id = fcr.request_id
      WHERE fcr.id = finance_approval_cover_items.finance_request_id
        AND (
          r.requester_employee_id IN (SELECT employee_id FROM public.app_users WHERE id = auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.request_approvals ra
            WHERE ra.request_id = r.id
              AND ra.approver_employee_id IN (SELECT employee_id FROM public.app_users WHERE id = auth.uid())
          )
          OR EXISTS (
            SELECT 1 FROM public.app_users au
            WHERE au.id = auth.uid() AND au.role = 'ORG_ADMIN'
          )
        )
    )
  );

CREATE POLICY "finance_approval_cover_items_insert"
  ON public.finance_approval_cover_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.finance_approval_cover_requests fcr
      JOIN public.requests r ON r.id = fcr.request_id
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE fcr.id = finance_request_id AND au.id = auth.uid()
    )
  );

CREATE POLICY "finance_approval_cover_items_update"
  ON public.finance_approval_cover_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.finance_approval_cover_requests fcr
      JOIN public.requests r ON r.id = fcr.request_id
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE fcr.id = finance_request_id AND au.id = auth.uid()
        AND r.status = 'DRAFT'
    )
  );

CREATE POLICY "finance_approval_cover_items_delete"
  ON public.finance_approval_cover_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.finance_approval_cover_requests fcr
      JOIN public.requests r ON r.id = fcr.request_id
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE fcr.id = finance_request_id AND au.id = auth.uid()
        AND r.status = 'DRAFT'
    )
  );


-- ============================================================================
-- 5. WORKFLOW DEFINITION
-- ============================================================================

INSERT INTO public.workflow_definitions (code, name, description, is_active, is_restricted)
VALUES (
  'FINANCE_APPROVAL_COVER',
  'Onay Kapağı Finans',
  'Finans departmanı tarafından başlatılan ödeme onay kapağı süreci',
  true,
  true
);


-- ============================================================================
-- 6. WORKFLOW STEPS (ŞABLON - elle doldurulacak)
-- ============================================================================
-- README kuralı: AI workflow_steps INSERT'lerini üretmez çünkü static_position_id
-- seçimi kullanıcıya aittir. Aşağıdaki şablon kullanılabilir.
--
-- Gerekli position_id'leri aşağıdaki sorguyla bulabilirsiniz:
--   SELECT id, code, name FROM public.positions
--    WHERE name ILIKE '%finans%müdür%' OR name ILIKE '%genel%müdür%';
--
-- DO $$
-- DECLARE
--   v_workflow_id         UUID;
--   v_finans_muduru_pos   UUID := '<FINANS_MUDURU_POSITION_UUID>';
--   v_genel_muduru_pos    UUID := '<GENEL_MUDUR_POSITION_UUID>';
-- BEGIN
--   SELECT id INTO v_workflow_id
--     FROM public.workflow_definitions
--    WHERE code = 'FINANCE_APPROVAL_COVER';
--
--   INSERT INTO public.workflow_steps
--     (workflow_definition_id, step_order, name, approver_type, static_position_id, action_type, form_section_key, is_required)
--   VALUES
--     (v_workflow_id, 1, 'Talep Eden',      'REQUESTER',         NULL,                 'FILL_AND_SIGN', 'request_info',    true),
--     (v_workflow_id, 2, 'İlgili Kişiler',  'DYNAMIC_USER_LIST', NULL,                 'FILL_AND_SIGN', 'related_persons', false),
--     (v_workflow_id, 3, 'Finans Müdürü',   'STATIC_POSITION',   v_finans_muduru_pos,  'SIGN_ONLY',     NULL,              true),
--     (v_workflow_id, 4, 'Genel Müdür',     'STATIC_POSITION',   v_genel_muduru_pos,   'SIGN_ONLY',     NULL,              true);
-- END $$;


-- ============================================================================
-- 7. WORKFLOW INITIATORS (ŞABLON - elle doldurulacak)
-- ============================================================================
-- Finans departmanının unit_id'sini veya ilgili pozisyonları ekleyin.
-- Her iki yöntem de (unit_id veya position_id) çalışır; birden fazla kayıt
-- "VEYA" mantığıyla birleşir.
--
-- Finans unit'ini bulmak için:
--   SELECT id, code, name FROM public.organizational_units
--    WHERE name ILIKE '%finans%';
--
-- DO $$
-- DECLARE
--   v_workflow_id UUID;
--   v_finans_unit_id UUID := '<FINANS_UNIT_UUID>';
-- BEGIN
--   SELECT id INTO v_workflow_id
--     FROM public.workflow_definitions
--    WHERE code = 'FINANCE_APPROVAL_COVER';
--
--   INSERT INTO public.workflow_initiators (workflow_definition_id, unit_id)
--   VALUES (v_workflow_id, v_finans_unit_id);
-- END $$;


-- ============================================================================
-- 8. EK DOSYA KONFİGÜRASYONU (workflow_steps oluşturulduktan SONRA çalıştırın)
-- ============================================================================
-- Talep Eden adımına (step_order=1) dosya yükleme alanı ekler.
-- is_required=false çünkü ek opsiyonel (ama %99 dolu olur).

INSERT INTO public.workflow_step_attachments
  (workflow_step_id, label, is_required, allowed_mime_types, max_file_size_bytes, max_files)
SELECT
  ws.id,
  'Ek Dosyalar (Muhasebe Onay Kapağı, Cari Döküm, Arvento Kaydı vb.)',
  false,
  '{application/pdf,image/jpeg,image/png}',
  10485760,
  10
FROM public.workflow_steps ws
JOIN public.workflow_definitions wd ON wd.id = ws.workflow_definition_id
WHERE wd.code = 'FINANCE_APPROVAL_COVER' AND ws.step_order = 1;
