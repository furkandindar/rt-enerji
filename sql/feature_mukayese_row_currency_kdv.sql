-- ============================================================================
-- Mukayese Formu: para birimi ve KDV oranı satır (kalem) bazında
-- ============================================================================
--
-- Sorun (kullanıcı geri bildirimi, 2026-09-27):
--   Para birimi ve KDV oranı mukayese_requests başlığında TEK değerdi; seçim
--   tüm matrisi (her kalem, her toplam) değiştiriyordu. Farklı KDV'li kalemler
--   aynı formda doğru toplanamıyordu (prod örneği: "Personel Kıyafeti" —
--   kıyafet %10 + baskı/baret %20, kullanıcı tüm tabloya %10 seçmek zorunda
--   kaldı ve bunu nota yazdı).
--
-- Çözüm:
--   mukayese_items'a currency + kdv_rate (yalnız ITEM satırlarında dolu).
--   mukayese_requests.form_currency / kdv_rate KALIR: artık "yeni satır
--   varsayılanı" ve satırda değer yoksa fallback.
--   Toplamlar para birimine göre ayrı hesaplanır; karışık para biriminde TL
--   karşılığı mevcut FX snapshot'ı (fx_usd_try / fx_eur_try) ile gösterilir
--   (uygulama katmanı, SQL değişikliği gerektirmez).
--
-- Kolonlar nullable: eski kayıtlar ve deploy penceresinde eski kodun yazdığı
-- satırlar NULL kalabilir; okuyan kod NULL'da başlık değerine düşer. RPC de
-- satırda eksik alanı başlıktan doldurur.
--
-- Önce DEV, sonra PROD.
-- Sıra: ÖNCE SQL, SONRA deploy. Tersi olursa yeni kod PATCH'te olmayan kolona
-- yazmaya çalışır (Talebi Düzenle 500 verir) ve eski RPC satır seçimlerini
-- sessizce yok sayar.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Kolonlar + kısıtlar
-- ----------------------------------------------------------------------------
ALTER TABLE public.mukayese_items
  ADD COLUMN IF NOT EXISTS currency public.mukayese_currency,
  ADD COLUMN IF NOT EXISTS kdv_rate NUMERIC(5,2);

ALTER TABLE public.mukayese_items
  DROP CONSTRAINT IF EXISTS mukayese_items_kdv_rate_range,
  ADD CONSTRAINT mukayese_items_kdv_rate_range
    CHECK (kdv_rate IS NULL OR (kdv_rate >= 0 AND kdv_rate <= 100));

-- Ara toplam satırı fiyat taşımaz → para birimi / KDV de taşımaz
ALTER TABLE public.mukayese_items
  DROP CONSTRAINT IF EXISTS mukayese_items_subtotal_no_pricing,
  ADD CONSTRAINT mukayese_items_subtotal_no_pricing
    CHECK (row_type = 'ITEM' OR (currency IS NULL AND kdv_rate IS NULL));

COMMENT ON COLUMN public.mukayese_items.currency IS
  'Kalemin para birimi (satırdaki tüm firma fiyatları bu birimde). NULL → mukayese_requests.form_currency';
COMMENT ON COLUMN public.mukayese_items.kdv_rate IS
  'Kalemin KDV oranı (%). NULL → mukayese_requests.kdv_rate';
COMMENT ON COLUMN public.mukayese_requests.form_currency IS
  'Yeni kalem satırları için varsayılan para birimi; kalemde değer yoksa fallback';
COMMENT ON COLUMN public.mukayese_requests.kdv_rate IS
  'Yeni kalem satırları için varsayılan KDV oranı (%); kalemde değer yoksa fallback';

-- ----------------------------------------------------------------------------
-- 2. Backfill — mevcut ITEM satırları başlık değerini açıkça alır
--    (görünen hiçbir sonuç değişmez; veri kendi kendini tarif eder hale gelir)
-- ----------------------------------------------------------------------------
UPDATE public.mukayese_items mi
   SET currency = COALESCE(mi.currency, mr.form_currency),
       kdv_rate = COALESCE(mi.kdv_rate, mr.kdv_rate)
  FROM public.mukayese_requests mr
 WHERE mr.id = mi.mukayese_request_id
   AND mi.row_type = 'ITEM'
   AND (mi.currency IS NULL OR mi.kdv_rate IS NULL);

-- ----------------------------------------------------------------------------
-- 3. RPC — tanım sql/comparison_form_rpc.sql ile birebir aynı; tek fark
--    mukayese_items INSERT'ündeki currency + kdv_rate
-- ----------------------------------------------------------------------------
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
  --    ITEM: para birimi / KDV satırdan; eksikse başlık varsayılanı
  --    SUBTOTAL: ikisi de NULL
  -- ----------------------------------------------------------------
  INSERT INTO public.mukayese_items (
    mukayese_request_id, row_order, row_type, description, quantity, unit,
    currency, kdv_rate
  )
  SELECT
    v_mukayese_request_id,
    (item->>'row_order')::smallint,
    (item->>'row_type')::public.mukayese_row_type,
    NULLIF(item->>'description',''),
    NULLIF(item->>'quantity','')::numeric,
    NULLIF(item->>'unit','')::public.mukayese_unit,
    CASE WHEN item->>'row_type' = 'ITEM' THEN
      COALESCE(NULLIF(item->>'currency',''), p_header->>'form_currency')::public.mukayese_currency
    END,
    CASE WHEN item->>'row_type' = 'ITEM' THEN
      COALESCE(NULLIF(item->>'kdv_rate',''), p_header->>'kdv_rate')::numeric
    END
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

COMMIT;

-- ----------------------------------------------------------------------------
-- 4. Doğrulama (COMMIT sonrası ayrı çalıştırın)
-- ----------------------------------------------------------------------------
-- Beklenen: item_null_pricing = 0, subtotal_with_pricing = 0,
--           fn_has_currency = true
--
-- SELECT
--   (SELECT count(*) FROM public.mukayese_items
--     WHERE row_type = 'ITEM' AND (currency IS NULL OR kdv_rate IS NULL)) AS item_null_pricing,
--   (SELECT count(*) FROM public.mukayese_items
--     WHERE row_type = 'SUBTOTAL' AND (currency IS NOT NULL OR kdv_rate IS NOT NULL)) AS subtotal_with_pricing,
--   (SELECT pg_get_functiondef('public.create_mukayese_request(uuid,uuid,jsonb,jsonb,jsonb,jsonb)'::regprocedure)
--       LIKE '%item->>''currency''%') AS fn_has_currency;
