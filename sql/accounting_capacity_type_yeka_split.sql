-- ============================================================================
-- Muhasebe Onay Kapağı: K/A/YEKA → finansla aynı 4 seçenek (YEKA → YEKA 1 / YEKA 2)
-- ============================================================================
-- Bağlam (feedback 2026-10):
--   Finans ve muhasebe kapaklarında satır bazındaki alan seçimi aynı olmalı:
--     Ana Saha (A) / Elektriksel Kapasite Artışı (K) / YEKA 1 / YEKA 2
--   Finans tarafı (finance_expense_area) Temmuz'da YEKA_1/YEKA_2 olarak bölündü
--   (bkz. finance_expense_area_yeka_split.sql); muhasebe enum'u hâlâ tek YEKA.
--
-- Tasarım:
--   KAPASITE ve ANASAHA kodları DB'de AYNEN KALIR — yalnız ekrandaki adları
--   finansla eşitlenir (kodda). Sadece YEKA bölünür; kolon tipi değişmez,
--   satırlara UPDATE yok.
--
-- Veri durumu (2026-10-18 itibarıyla):
--   - prod: capacity_type='YEKA' olan 0 satır (toplam 2 satır, ikisi ANASAHA)
--   - dev : capacity_type='YEKA' olan 1 test satırı (rename ile YEKA_1 olur)
--   - accounting_capacity_type'a bağlı view/fonksiyon yok (dev+prod doğrulandı);
--     tek kullanan kolon accounting_approval_cover_items.capacity_type
--
-- Sıralama:
--   ÖNCE bu SQL (dev → prod), SONRA deploy. Yeni kod YEKA_1/YEKA_2 gönderir.
--   SQL ile deploy arasında eski kodda yalnız "YEKA" seçimi hata verir
--   (Kapasite/Ana Saha çalışmaya devam eder) — arayı kısa tut.
--
-- Not: ALTER TYPE ... ADD VALUE ile eklenen değer aynı transaction içinde
-- kullanılamaz; bu script yeni değeri kullanmadığı için tek seferde çalışır.

-- 1) Mevcut YEKA değerini YEKA_1'e çevir (varsa eski satırlar da otomatik döner)
ALTER TYPE public.accounting_capacity_type RENAME VALUE 'YEKA' TO 'YEKA_1';

-- 2) YEKA_2'yi YEKA_1'in hemen arkasına ekle
ALTER TYPE public.accounting_capacity_type ADD VALUE 'YEKA_2' AFTER 'YEKA_1';

-- Doğrulama:
-- SELECT enumlabel, enumsortorder FROM pg_enum e
-- JOIN pg_type t ON t.oid = e.enumtypid
-- WHERE t.typname = 'accounting_capacity_type' ORDER BY enumsortorder;
-- Beklenen: KAPASITE, ANASAHA, YEKA_1, YEKA_2
