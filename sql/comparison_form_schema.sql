-- ============================================================================
-- MUKAYESE FORMU (Comparison Form) - Veritabanı Şeması
-- ============================================================================
--
-- Workflow Code   : COMPARISON_FORM
-- Kısıtlı mı?     : HAYIR (herkes başlatabilir)
-- Adım Özeti      :
--   1) REQUESTER        (FILL_AND_SIGN, APPROVAL)   - Talep Eden
--   2) UNIT_HEAD        (SIGN_ONLY,     APPROVAL)   - Birim Müdürü
--   3) STATIC_POSITION  (SIGN_ONLY,     APPROVAL)   - Genel Koordinatör
--   4) STATIC_POSITION  (FILL_AND_SIGN, COMPLETION) - YKB Asistanı (imzalı PDF yükler)
--
-- NOT 1: workflow_steps INSERT'leri kullanıcı tarafından elle yazılacak
--        (static_position_id seçimi gerektiriyor). Şablon için bkz. bölüm 6.
-- NOT 2: 4. adım COMPLETION fazındadır. APPROVAL fazı tamamlandığında talep
--        AWAITING_COMPLETION durumuna geçer. YKB Asistanı, formun çıktısını
--        alıp YKB'ye fiziksel olarak imzalattıktan sonra taranmış PDF'i
--        sisteme yükler ve form_section_key = 'ykb_signed_pdf' adımını
--        onaylar; bu işlem requests.pdf_path'i imzalı dosya ile değiştirir.


-- ============================================================================
-- 1. ENUM TİPLERİ
-- ============================================================================

CREATE TYPE public.mukayese_currency AS ENUM (
  'TRY',
  'USD',
  'EUR'
);

CREATE TYPE public.mukayese_unit AS ENUM (
  'ADET',
  'SET',
  'GUN'
);

CREATE TYPE public.mukayese_row_type AS ENUM (
  'ITEM',
  'SUBTOTAL'
);


-- ============================================================================
-- 2. ANA TABLO - mukayese_requests (başlık + footer metin alanları)
-- ============================================================================

CREATE TABLE public.mukayese_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES public.requests(id) ON DELETE CASCADE,

  -- Başlık (sol üst)
  project_title    TEXT                    NOT NULL,         -- Proje / Başlık
  form_currency    public.mukayese_currency NOT NULL,         -- Form para birimi (TRY/USD/EUR)

  -- FX snapshot (talep oluşturulurken TCMB'den çekilir, /api/fx-rates)
  fx_eur_try       NUMERIC(12,4),                            -- 1 EUR = ? TRY
  fx_usd_try       NUMERIC(12,4),                            -- 1 USD = ? TRY
  fx_eur_usd       NUMERIC(12,6),                            -- 1 EUR = ? USD
  fx_snapshot_at   TIMESTAMPTZ,                              -- TCMB rate çekim anı

  -- Başlık (sağ üst)
  form_date        DATE                    NOT NULL DEFAULT CURRENT_DATE,
  notes            TEXT,                                     -- Açıklama / Notlar

  -- Tablo özet
  kdv_rate         NUMERIC(5,2)            NOT NULL DEFAULT 20.00,  -- % cinsinden

  -- Footer (formu hazırlayan blok)
  preparer_full_name  TEXT                 NOT NULL,         -- Adı Soyadı
  company             TEXT                 NOT NULL,         -- Şirket
  subject             TEXT                 NOT NULL,         -- Konu
  request_content     TEXT                 NOT NULL,         -- Talep İçerik
  request_amount_text TEXT                 NOT NULL,         -- Talep Miktarı / Tutarı (text)
  request_reason      TEXT                 NOT NULL,         -- Talep Nedeni

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (kdv_rate >= 0 AND kdv_rate <= 100)
);

CREATE INDEX idx_mukayese_requests_request_id
  ON public.mukayese_requests(request_id);

COMMENT ON TABLE public.mukayese_requests IS
  'Mukayese Formu başlık, FX snapshot ve footer metin alanları';
COMMENT ON COLUMN public.mukayese_requests.form_currency IS
  'Mukayese tablosunda kullanılacak para birimi (form genelinde tek seçim)';
COMMENT ON COLUMN public.mukayese_requests.fx_snapshot_at IS
  'FX kurlarının TCMB''den çekildiği zaman (geçmiş PDF üretiminde tutarlılık için)';


-- ============================================================================
-- 3. ALT TABLO - mukayese_items (matris satırları: mal/hizmet veya ara toplam)
-- ============================================================================

CREATE TABLE public.mukayese_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mukayese_request_id UUID NOT NULL REFERENCES public.mukayese_requests(id) ON DELETE CASCADE,
  row_order   SMALLINT                 NOT NULL,           -- 1, 2, 3...
  row_type    public.mukayese_row_type NOT NULL DEFAULT 'ITEM',

  -- ITEM satırları için zorunlu, SUBTOTAL satırları için null bırakılır
  description TEXT,                                        -- Mal / Hizmet
  quantity    NUMERIC(14,4),                               -- Miktar
  unit        public.mukayese_unit,                        -- Birim (ADET/SET/GUN)

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (mukayese_request_id, row_order),
  CHECK (
    (row_type = 'ITEM'     AND description IS NOT NULL AND quantity IS NOT NULL AND unit IS NOT NULL AND quantity > 0)
    OR
    (row_type = 'SUBTOTAL' AND quantity IS NULL AND unit IS NULL)
  )
);

CREATE INDEX idx_mukayese_items_parent
  ON public.mukayese_items(mukayese_request_id);

COMMENT ON TABLE public.mukayese_items IS
  'Mukayese matrisi satırları. row_type=SUBTOTAL satırları runtime''da hesaplanır.';


-- ============================================================================
-- 4. ALT TABLO - mukayese_suppliers (matris sütunları: firma + footer alanları)
-- ============================================================================

CREATE TABLE public.mukayese_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mukayese_request_id UUID NOT NULL REFERENCES public.mukayese_requests(id) ON DELETE CASCADE,
  column_order  SMALLINT NOT NULL,                         -- 1, 2, 3...
  company_name  TEXT     NOT NULL,                         -- Firma adı

  -- Footer (firma başına metin alanları)
  payment_terms          TEXT,                             -- Ödeme Şekli
  technical_description  TEXT,                             -- Teknik Açıklama
  delivery_time          TEXT,                             -- Teslim Süresi
  contact_name           TEXT,                             -- Firma Yetkilisi (ad)
  contact_phone          TEXT,                             -- Firma Yetkilisi (tel)

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (mukayese_request_id, column_order)
);

CREATE INDEX idx_mukayese_suppliers_parent
  ON public.mukayese_suppliers(mukayese_request_id);

COMMENT ON TABLE public.mukayese_suppliers IS
  'Mukayese matrisi sütunları (teklif alınan firmalar) ve footer firma alanları';



-- ============================================================================
-- 5. ALT TABLO - mukayese_prices (matris hücreleri: birim fiyat)
-- ============================================================================
-- Toplam fiyat = quantity * unit_price (runtime'da hesaplanır, kolon olarak tutulmaz)
-- Yalnızca ITEM satırları için kayıt oluşturulur (uygulama katmanında doğrulanır)

CREATE TABLE public.mukayese_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mukayese_item_id     UUID NOT NULL REFERENCES public.mukayese_items(id)     ON DELETE CASCADE,
  mukayese_supplier_id UUID NOT NULL REFERENCES public.mukayese_suppliers(id) ON DELETE CASCADE,
  unit_price NUMERIC(14,4) NOT NULL DEFAULT 0,             -- Form para birimi cinsinden

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (mukayese_item_id, mukayese_supplier_id),
  CHECK (unit_price >= 0)
);

CREATE INDEX idx_mukayese_prices_item     ON public.mukayese_prices(mukayese_item_id);
CREATE INDEX idx_mukayese_prices_supplier ON public.mukayese_prices(mukayese_supplier_id);

COMMENT ON TABLE public.mukayese_prices IS
  'Mukayese matrisi hücreleri. Yalnızca ITEM satırları için kayıt oluşturulur.';


-- ============================================================================
-- 6. RLS POLİTİKALARI
-- ============================================================================

-- 6.1 mukayese_requests
ALTER TABLE public.mukayese_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mukayese_requests_select"
  ON public.mukayese_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = mukayese_requests.request_id
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

CREATE POLICY "mukayese_requests_insert"
  ON public.mukayese_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.requests r
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE r.id = request_id AND au.id = auth.uid()
    )
  );

CREATE POLICY "mukayese_requests_update"
  ON public.mukayese_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE r.id = request_id AND au.id = auth.uid()
        AND r.status = 'DRAFT'
    )
  );


-- 6.2 mukayese_items
ALTER TABLE public.mukayese_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mukayese_items_select"
  ON public.mukayese_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.mukayese_requests mr
      JOIN public.requests r ON r.id = mr.request_id
      WHERE mr.id = mukayese_items.mukayese_request_id
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

CREATE POLICY "mukayese_items_insert"
  ON public.mukayese_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.mukayese_requests mr
      JOIN public.requests r ON r.id = mr.request_id
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE mr.id = mukayese_request_id AND au.id = auth.uid()
    )
  );

CREATE POLICY "mukayese_items_update"
  ON public.mukayese_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.mukayese_requests mr
      JOIN public.requests r ON r.id = mr.request_id
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE mr.id = mukayese_request_id AND au.id = auth.uid()
        AND r.status = 'DRAFT'
    )
  );

CREATE POLICY "mukayese_items_delete"
  ON public.mukayese_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.mukayese_requests mr
      JOIN public.requests r ON r.id = mr.request_id
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE mr.id = mukayese_request_id AND au.id = auth.uid()
        AND r.status = 'DRAFT'
    )
  );



-- 6.3 mukayese_suppliers
ALTER TABLE public.mukayese_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mukayese_suppliers_select"
  ON public.mukayese_suppliers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.mukayese_requests mr
      JOIN public.requests r ON r.id = mr.request_id
      WHERE mr.id = mukayese_suppliers.mukayese_request_id
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

CREATE POLICY "mukayese_suppliers_insert"
  ON public.mukayese_suppliers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.mukayese_requests mr
      JOIN public.requests r ON r.id = mr.request_id
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE mr.id = mukayese_request_id AND au.id = auth.uid()
    )
  );

CREATE POLICY "mukayese_suppliers_update"
  ON public.mukayese_suppliers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.mukayese_requests mr
      JOIN public.requests r ON r.id = mr.request_id
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE mr.id = mukayese_request_id AND au.id = auth.uid()
        AND r.status = 'DRAFT'
    )
  );

CREATE POLICY "mukayese_suppliers_delete"
  ON public.mukayese_suppliers
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.mukayese_requests mr
      JOIN public.requests r ON r.id = mr.request_id
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE mr.id = mukayese_request_id AND au.id = auth.uid()
        AND r.status = 'DRAFT'
    )
  );


-- 6.4 mukayese_prices
ALTER TABLE public.mukayese_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mukayese_prices_select"
  ON public.mukayese_prices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.mukayese_items mi
      JOIN public.mukayese_requests mr ON mr.id = mi.mukayese_request_id
      JOIN public.requests r ON r.id = mr.request_id
      WHERE mi.id = mukayese_prices.mukayese_item_id
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

CREATE POLICY "mukayese_prices_insert"
  ON public.mukayese_prices
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.mukayese_items mi
      JOIN public.mukayese_requests mr ON mr.id = mi.mukayese_request_id
      JOIN public.requests r ON r.id = mr.request_id
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE mi.id = mukayese_item_id AND au.id = auth.uid()
    )
  );

CREATE POLICY "mukayese_prices_update"
  ON public.mukayese_prices
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.mukayese_items mi
      JOIN public.mukayese_requests mr ON mr.id = mi.mukayese_request_id
      JOIN public.requests r ON r.id = mr.request_id
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE mi.id = mukayese_item_id AND au.id = auth.uid()
        AND r.status = 'DRAFT'
    )
  );

CREATE POLICY "mukayese_prices_delete"
  ON public.mukayese_prices
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.mukayese_items mi
      JOIN public.mukayese_requests mr ON mr.id = mi.mukayese_request_id
      JOIN public.requests r ON r.id = mr.request_id
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE mi.id = mukayese_item_id AND au.id = auth.uid()
        AND r.status = 'DRAFT'
    )
  );


-- ============================================================================
-- 7. WORKFLOW DEFINITION
-- ============================================================================

INSERT INTO public.workflow_definitions (code, name, description, is_active, is_restricted)
VALUES (
  'COMPARISON_FORM',
  'Mukayese Formu',
  'Birden fazla tedarikçiden alınan tekliflerin matris formatında karşılaştırıldığı süreç. Son adım olan YKB onayı fiziksel imza ile yapılır; YKB asistanı imzalı PDF''i yükleyerek süreci tamamlar.',
  true,
  false
);



-- ============================================================================
-- 8. WORKFLOW STEPS (ŞABLON - elle doldurulacak)
-- ============================================================================
-- README kuralı: AI workflow_steps INSERT'lerini üretmez çünkü static_position_id
-- seçimi kullanıcıya aittir. Aşağıdaki şablon kullanılabilir.
--
-- Gerekli position_id'leri aşağıdaki sorgu ile bulabilirsiniz:
--   SELECT id, code, name FROM public.positions
--    WHERE name ILIKE '%koordinat%' OR name ILIKE '%asistan%';
--
-- ÖNEMLİ:
--   - 4. adım phase = 'COMPLETION' olmalı; talep, 3. adım onaylandıktan sonra
--     AWAITING_COMPLETION durumuna geçer ve YKB Asistanı'nın yüklemesini bekler.
--   - 4. adımın action_type = 'FILL_AND_SIGN' ve form_section_key = 'ykb_signed_pdf'
--     olmalı; UI bu key'i görerek "İmzalı PDF Yükle" panelini render eder ve
--     yüklenen dosya requests.pdf_path'i overwrite eder.
--
-- DO $$
-- DECLARE
--   v_workflow_id          UUID;
--   v_genel_koordinator    UUID := '<GENEL_KOORDINATOR_POSITION_UUID>';
--   v_ykb_asistani         UUID := '<YKB_ASISTANI_POSITION_UUID>';
-- BEGIN
--   SELECT id INTO v_workflow_id
--     FROM public.workflow_definitions
--    WHERE code = 'COMPARISON_FORM';
--
--   INSERT INTO public.workflow_steps
--     (workflow_definition_id, step_order, name, approver_type, static_position_id, action_type, form_section_key, phase, is_required)
--   VALUES
--     (v_workflow_id, 1, 'Talep Eden',         'REQUESTER',       NULL,                 'FILL_AND_SIGN', 'comparison_matrix', 'APPROVAL',   true),
--     (v_workflow_id, 2, 'Birim Müdürü',       'UNIT_HEAD',       NULL,                 'SIGN_ONLY',     NULL,                'APPROVAL',   true),
--     (v_workflow_id, 3, 'Genel Koordinatör',  'STATIC_POSITION', v_genel_koordinator,  'SIGN_ONLY',     NULL,                'APPROVAL',   true),
--     (v_workflow_id, 4, 'YKB Asistanı',       'STATIC_POSITION', v_ykb_asistani,       'FILL_AND_SIGN', 'ykb_signed_pdf',    'COMPLETION', true);
-- END $$;


-- ============================================================================
-- 9. EK DOSYA KONFİGÜRASYONU (workflow_steps oluşturulduktan SONRA çalıştırın)
-- ============================================================================
-- Talep Eden adımına (step_order=1) opsiyonel ek dosya alanı ekler.

INSERT INTO public.workflow_step_attachments
  (workflow_step_id, label, is_required, allowed_mime_types, max_file_size_bytes, max_files)
SELECT
  ws.id,
  'Ek Dosyalar (Teklif Belgeleri, Proforma vb.)',
  false,
  '{application/pdf,image/jpeg,image/png}',
  10485760,
  10
FROM public.workflow_steps ws
JOIN public.workflow_definitions wd ON wd.id = ws.workflow_definition_id
WHERE wd.code = 'COMPARISON_FORM' AND ws.step_order = 1;
