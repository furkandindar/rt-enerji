-- ============================================================================
-- Ödeme kalemlerine para birimi (TL/USD/EUR) — Onay Kapağı Finans (Faz 1)
-- ============================================================================
-- Bağlam:
--   finance_approval_cover_items tablosundaki fatura/ödenecek tutarlar bugüne
--   kadar örtük TL idi. Artık her kalem satırı kendi para birimini taşıyor
--   (satır bazında seçim; toplamlar uygulamada para birimi bazında gösterilir).
--
-- Tasarım:
--   - Yeni payment_currency enum'u ('TRY','USD','EUR') — Muhasebe Onay Kapağı
--     kalemleri de Faz 2'de aynı enum'u kullanacak (o fazın SQL'i ayrı gelecek).
--   - Kolon NOT NULL DEFAULT 'TRY': mevcut satırlar otomatik TL olur; eski
--     (deploy öncesi) kod currency göndermeden insert etse de default devreye
--     girer. Bu yüzden bu SQL deploy'dan ÖNCE güvenle çalıştırılabilir —
--     tersine, yeni kod deploy edilmeden önce çalıştırılmış OLMALI (yeni form
--     currency kolonu ister).
--
-- Sıra: önce dev, sonra prod; ardından deploy.

BEGIN;

CREATE TYPE public.payment_currency AS ENUM ('TRY', 'USD', 'EUR');

ALTER TABLE public.finance_approval_cover_items
  ADD COLUMN currency public.payment_currency NOT NULL DEFAULT 'TRY';

COMMIT;

-- Doğrulama:
-- SELECT currency, COUNT(*) FROM public.finance_approval_cover_items GROUP BY currency;
-- Beklenen: mevcut tüm satırlar TRY
