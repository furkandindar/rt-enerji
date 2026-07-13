-- ============================================================================
-- Ödeme kalemlerine para birimi (TL/USD/EUR) — Onay Kapağı Muhasebe (Faz 2)
-- ============================================================================
-- ÖN KOŞUL: sql/finance_items_payment_currency.sql çalıştırılmış olmalı
-- (payment_currency enum'u orada oluşturuluyor).
--
-- Finans kapağıyla aynı desen: satır bazında para birimi, NOT NULL DEFAULT
-- 'TRY' sayesinde mevcut satırlar TL olur ve eski kod çalışmaya devam eder.
-- Bu SQL deploy'dan önce çalıştırılmalı. Sıra: dev → prod → deploy.

ALTER TABLE public.accounting_approval_cover_items
  ADD COLUMN currency public.payment_currency NOT NULL DEFAULT 'TRY';

-- Doğrulama:
-- SELECT currency, COUNT(*) FROM public.accounting_approval_cover_items GROUP BY currency;
-- Beklenen: mevcut tüm satırlar TRY
