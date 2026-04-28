-- ============================================================================
-- MUKAYESE FORMU - Atomik Talep Oluşturma RPC Fonksiyonu
-- ============================================================================
--
-- Bağımlılık: comparison_form_schema.sql önce çalıştırılmış olmalı.
--
-- Bu fonksiyon, mukayese formu talebi için 4 tabloya yazılan toplam
-- (1 + N items + M suppliers + N*M prices) INSERT işlemlerini TEK transaction
-- içinde atomik olarak yürütür. Herhangi bir hatada Postgres tüm değişiklikleri
-- otomatik rollback eder; backend tarafında manuel temizlik gerekmez.
--
-- Onay zinciri (request_approvals satırları) bu fonksiyonun KAPSAMI DIŞINDADIR.
-- Backend, dönen request_id ile lib/workflow/workflow-service.ts içindeki
-- createApprovalChain(...) fonksiyonunu çağırarak onay zincirini kurar.
-- createApprovalChain başarısız olursa backend tarafı `DELETE FROM requests
-- WHERE id = <returned_id>` ile temizlik yapar; ON DELETE CASCADE sayesinde
-- mukayese_* alt tabloları da otomatik silinir.
--
-- SECURITY INVOKER: Fonksiyon, çağıran kullanıcının yetkileriyle çalışır;
-- mevcut RLS politikaları geçerliliğini korur.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_mukayese_request(
  p_workflow_definition_id UUID,
  p_requester_employee_id  UUID,
  p_header                 JSONB,
  p_items                  JSONB,
  p_suppliers              JSONB,
  p_prices                 JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_request_id          UUID;
  v_mukayese_request_id UUID;
BEGIN
  -- ----------------------------------------------------------------
  -- 1. Ana request kaydı (status = 'PENDING' → tek seferde submit)
  -- ----------------------------------------------------------------
  INSERT INTO public.requests (
    workflow_definition_id,
    requester_employee_id,
    status,
    current_step,
    submitted_at
  ) VALUES (
    p_workflow_definition_id,
    p_requester_employee_id,
    'PENDING',
    1,
    now()
  )
  RETURNING id INTO v_request_id;

  -- ----------------------------------------------------------------
  -- 2. mukayese_requests (header + footer + FX snapshot)
  -- ----------------------------------------------------------------
  INSERT INTO public.mukayese_requests (
    request_id,
    project_title,
    form_currency,
    fx_eur_try,
    fx_usd_try,
    fx_eur_usd,
    fx_snapshot_at,
    form_date,
    notes,
    kdv_rate,
    preparer_full_name,
    company,
    subject,
    request_content,
    request_amount_text,
    request_reason
  ) VALUES (
    v_request_id,
    p_header->>'project_title',
    (p_header->>'form_currency')::public.mukayese_currency,
    NULLIF(p_header->>'fx_eur_try','')::numeric,
    NULLIF(p_header->>'fx_usd_try','')::numeric,
    NULLIF(p_header->>'fx_eur_usd','')::numeric,
    NULLIF(p_header->>'fx_snapshot_at','')::timestamptz,
    (p_header->>'form_date')::date,
    NULLIF(p_header->>'notes',''),
    (p_header->>'kdv_rate')::numeric,
    p_header->>'preparer_full_name',
    p_header->>'company',
    p_header->>'subject',
    p_header->>'request_content',
    p_header->>'request_amount_text',
    p_header->>'request_reason'
  )
  RETURNING id INTO v_mukayese_request_id;

  -- ----------------------------------------------------------------
  -- 3. mukayese_items (matris satırları)
  -- ----------------------------------------------------------------
  INSERT INTO public.mukayese_items (
    mukayese_request_id, row_order, row_type, description, quantity, unit
  )
  SELECT
    v_mukayese_request_id,
    (item->>'row_order')::smallint,
    (item->>'row_type')::public.mukayese_row_type,
    NULLIF(item->>'description',''),
    NULLIF(item->>'quantity','')::numeric,
    NULLIF(item->>'unit','')::public.mukayese_unit
  FROM jsonb_array_elements(p_items) AS item;

  -- ----------------------------------------------------------------
  -- 4. mukayese_suppliers (matris sütunları + footer firma alanları)
  -- ----------------------------------------------------------------
  INSERT INTO public.mukayese_suppliers (
    mukayese_request_id, column_order, company_name,
    payment_terms, technical_description, delivery_time, contact_name, contact_phone
  )
  SELECT
    v_mukayese_request_id,
    (s->>'column_order')::smallint,
    s->>'company_name',
    NULLIF(s->>'payment_terms',''),
    NULLIF(s->>'technical_description',''),
    NULLIF(s->>'delivery_time',''),
    NULLIF(s->>'contact_name',''),
    NULLIF(s->>'contact_phone','')
  FROM jsonb_array_elements(p_suppliers) AS s;

  -- ----------------------------------------------------------------
  -- 5. mukayese_prices (hücreler) - row_order/column_order ile eşle
  -- ----------------------------------------------------------------
  INSERT INTO public.mukayese_prices (
    mukayese_item_id, mukayese_supplier_id, unit_price
  )
  SELECT
    mi.id,
    ms.id,
    (price->>'unit_price')::numeric
  FROM jsonb_array_elements(p_prices) AS price
  JOIN public.mukayese_items mi
    ON mi.mukayese_request_id = v_mukayese_request_id
   AND mi.row_order = (price->>'row_order')::smallint
  JOIN public.mukayese_suppliers ms
    ON ms.mukayese_request_id = v_mukayese_request_id
   AND ms.column_order = (price->>'column_order')::smallint;

  RETURN v_request_id;
END;
$$;

COMMENT ON FUNCTION public.create_mukayese_request(UUID, UUID, JSONB, JSONB, JSONB, JSONB) IS
  'Mukayese Formu için atomik talep oluşturma. requests + mukayese_requests + mukayese_items + mukayese_suppliers + mukayese_prices tek transaction''da yazılır. Onay zinciri ayrıca backend tarafından createApprovalChain ile kurulur.';
