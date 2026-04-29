-- ============================================================================
-- HARCAMA FORMU (Expense Form) - Veritabanı Şeması
-- ============================================================================
--
-- Workflow Code   : EXPENSE_FORM
-- Kısıtlı mı?     : HAYIR (herkes başlatabilir)
-- Adım Özeti      :
--   1) REQUESTER          (FILL_AND_SIGN)  - Talep Eden
--   2) UNIT_HEAD          (SIGN_ONLY)      - Birim Amiri
--   3) STATIC_POSITION    (SIGN_ONLY)      - Muhasebe
--   4) STATIC_POSITION    (SIGN_ONLY)      - Genel Müdür
--
-- NOT: workflow_steps INSERT'leri kullanıcı tarafından elle yazılacak
-- (static_position_id seçimi gerektiriyor). Şablon için bkz. bölüm 5.


-- ============================================================================
-- 1. ANA TABLO - expense_requests
-- ============================================================================

CREATE TABLE public.expense_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES public.requests(id) ON DELETE CASCADE,

  -- Başlık alanları
  request_date              DATE NOT NULL DEFAULT CURRENT_DATE,
  project_name              TEXT NOT NULL,
  project_code              TEXT NOT NULL,

  -- "İşin Adı" (is_travel = false) veya "Seyahat Yapılan Yer" (is_travel = true)
  is_travel                 BOOLEAN NOT NULL DEFAULT false,
  work_or_destination       TEXT NOT NULL,

  -- Seyahat alanları (yalnızca is_travel = true iken doldurulması beklenir)
  travel_person_count       SMALLINT,
  travel_date               DATE,
  travel_duration           TEXT,

  -- Avans tutarı (a). Harcamalar toplamı (b) ve bakiye (a-b) kalemlerden hesaplanır.
  advance_amount            NUMERIC(14,2),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (advance_amount IS NULL OR advance_amount >= 0),
  CHECK (travel_person_count IS NULL OR travel_person_count > 0)
);

CREATE INDEX idx_expense_requests_request_id
  ON public.expense_requests(request_id);

COMMENT ON TABLE public.expense_requests IS
  'Harcama Formu talebinin başlık ve proje bilgileri';


-- ============================================================================
-- 2. ALT TABLO - expense_items (dinamik harcama tablosu)
-- ============================================================================

CREATE TABLE public.expense_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_request_id UUID NOT NULL REFERENCES public.expense_requests(id) ON DELETE CASCADE,
  row_order        SMALLINT      NOT NULL,

  item_date        DATE          NOT NULL,
  document_no      TEXT,                                   -- Evrak No (opsiyonel)
  description      TEXT          NOT NULL,
  amount           NUMERIC(14,2) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (expense_request_id, row_order),
  CHECK (amount >= 0)
);

CREATE INDEX idx_expense_items_parent
  ON public.expense_items(expense_request_id);

COMMENT ON TABLE public.expense_items IS
  'Harcama Formu - harcama satırları (min 1 satır uygulama katmanında doğrulanır)';


-- ============================================================================
-- 3. RLS POLİTİKALARI - expense_requests
-- ============================================================================

ALTER TABLE public.expense_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_requests_select"
  ON public.expense_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = expense_requests.request_id
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

CREATE POLICY "expense_requests_insert"
  ON public.expense_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.requests r
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE r.id = request_id AND au.id = auth.uid()
    )
  );

CREATE POLICY "expense_requests_update"
  ON public.expense_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE r.id = request_id AND au.id = auth.uid()
        AND r.status = 'DRAFT'
    )
  );



-- ============================================================================
-- 3.1 RLS POLİTİKALARI - expense_items
-- ============================================================================

ALTER TABLE public.expense_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_items_select"
  ON public.expense_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.expense_requests er
      JOIN public.requests r ON r.id = er.request_id
      WHERE er.id = expense_items.expense_request_id
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

CREATE POLICY "expense_items_insert"
  ON public.expense_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.expense_requests er
      JOIN public.requests r ON r.id = er.request_id
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE er.id = expense_request_id AND au.id = auth.uid()
    )
  );

CREATE POLICY "expense_items_update"
  ON public.expense_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.expense_requests er
      JOIN public.requests r ON r.id = er.request_id
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE er.id = expense_request_id AND au.id = auth.uid()
        AND r.status = 'DRAFT'
    )
  );

CREATE POLICY "expense_items_delete"
  ON public.expense_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.expense_requests er
      JOIN public.requests r ON r.id = er.request_id
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE er.id = expense_request_id AND au.id = auth.uid()
        AND r.status = 'DRAFT'
    )
  );


-- ============================================================================
-- 4. WORKFLOW DEFINITION
-- ============================================================================

INSERT INTO public.workflow_definitions (code, name, description, is_active, is_restricted)
VALUES (
  'EXPENSE_FORM',
  'Harcama Formu',
  'Personel harcamalarının kalem kalem bildirildiği harcama formu süreci',
  true,
  false
);


-- ============================================================================
-- 5. WORKFLOW STEPS (ŞABLON - elle doldurulacak)
-- ============================================================================
-- README kuralı: AI workflow_steps INSERT'lerini üretmez çünkü static_position_id
-- seçimi kullanıcıya aittir. Aşağıdaki şablon kullanılabilir.
--
-- Gerekli position_id'leri aşağıdaki sorguyla bulabilirsiniz:
--   SELECT id, code, name FROM public.positions
--    WHERE name ILIKE '%muhasebe%' OR name ILIKE '%genel%müdür%';
--
-- DO $$
-- DECLARE
--   v_workflow_id        UUID;
--   v_muhasebe_pos       UUID := '<MUHASEBE_POSITION_UUID>';
--   v_genel_mudur_pos    UUID := '<GENEL_MUDUR_POSITION_UUID>';
-- BEGIN
--   SELECT id INTO v_workflow_id
--     FROM public.workflow_definitions
--    WHERE code = 'EXPENSE_FORM';
--
--   INSERT INTO public.workflow_steps
--     (workflow_definition_id, step_order, name, approver_type, static_position_id, action_type, form_section_key, is_required)
--   VALUES
--     (v_workflow_id, 1, 'Talep Eden',   'REQUESTER',       NULL,              'FILL_AND_SIGN', 'request_info', true),
--     (v_workflow_id, 2, 'Birim Amiri',  'UNIT_HEAD',       NULL,              'SIGN_ONLY',     NULL,           true),
--     (v_workflow_id, 3, 'Muhasebe',     'STATIC_POSITION', v_muhasebe_pos,    'SIGN_ONLY',     NULL,           true),
--     (v_workflow_id, 4, 'Genel Müdür',  'STATIC_POSITION', v_genel_mudur_pos, 'SIGN_ONLY',     NULL,           true);
-- END $$;


-- ============================================================================
-- 6. EK DOSYA KONFİGÜRASYONU (workflow_steps oluşturulduktan SONRA çalıştırın)
-- ============================================================================
-- Talep Eden adımına (step_order=1) opsiyonel dosya yükleme alanı ekler.

INSERT INTO public.workflow_step_attachments
  (workflow_step_id, label, is_required, allowed_mime_types, max_file_size_bytes, max_files)
SELECT
  ws.id,
  'Ek Belgeler (Fatura, Fiş, Makbuz vb.)',
  false,
  '{application/pdf,image/jpeg,image/png}',
  10485760,
  20
FROM public.workflow_steps ws
JOIN public.workflow_definitions wd ON wd.id = ws.workflow_definition_id
WHERE wd.code = 'EXPENSE_FORM' AND ws.step_order = 1;
