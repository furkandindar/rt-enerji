-- ============================================================================
-- Opsiyonel Ödeme Tablosu — Onay Kapağı Finans
-- ============================================================================
-- Bağlam:
--   Olur yazısındaki (approval_letter_requests) opsiyonel "Ödeme Tablosu"
--   bloğunun aynısı Onay Kapağı Finans sürecine ekleniyor. Kolon adları ve
--   tipleri approval_letter_requests ile birebir aynı tutuldu.
--
-- Davranış:
--   - has_payment_table=false (default) → blok yok, mevcut davranış değişmez.
--   - Toggle açıksa API alanları doldurur; kapalıysa NULL/[] yazar.
--   - Tüm kolonlar nullable/default'lu → bu SQL deploy'dan önce güvenle
--     çalıştırılabilir, eski kod etkilenmez. Yeni kod deploy edilmeden önce
--     çalıştırılmış OLMALI. Sıra: dev → prod → deploy.

BEGIN;

ALTER TABLE public.finance_approval_cover_requests
  ADD COLUMN has_payment_table boolean DEFAULT false,
  ADD COLUMN comparison_approval_date date,
  ADD COLUMN agreement_amount text,
  ADD COLUMN has_contract boolean,
  ADD COLUMN paid_amounts jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN remaining_payment text,
  ADD COLUMN requested_payment_amount text,
  ADD COLUMN remaining_after_payment text;

COMMIT;

-- Doğrulama:
-- SELECT column_name, data_type, column_default
-- FROM information_schema.columns
-- WHERE table_name = 'finance_approval_cover_requests'
--   AND column_name IN ('has_payment_table','comparison_approval_date','agreement_amount',
--                       'has_contract','paid_amounts','remaining_payment',
--                       'requested_payment_amount','remaining_after_payment');
