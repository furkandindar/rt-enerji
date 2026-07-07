-- ============================================================================
-- Harcama Alanı: YEKA → YEKA 1 / YEKA 2 ayrımı (finance_expense_area enum)
-- ============================================================================
-- Bağlam:
--   Onay Kapağı Finans formundaki "Harcama Alanı" seçeneği YEKA, iş kararıyla
--   YEKA 1 ve YEKA 2 olarak ikiye ayrıldı.
--
-- Veri durumu (2026-07-08 itibarıyla):
--   - prod: expense_area='YEKA' olan 0 kayıt (rename veri etkilemez)
--   - dev : expense_area='YEKA' olan 3 test kaydı (rename ile YEKA_1 olurlar)
--   - 'YEKA' literal'ine bağımlı view/fonksiyon yok (prod'da doğrulandı)
--
-- Sıralama önemli:
--   Bu SQL, YEKA_1/YEKA_2 gönderen yeni kod deploy edilmeden ÖNCE çalıştırılmalı
--   (yoksa yeni form insert'leri enum hatası alır). SQL çalıştıktan sonra eski
--   kod "YEKA" gönderemez hale gelir; bu yüzden SQL + deploy arasını kısa tut.
--
-- Not: ALTER TYPE ... ADD VALUE aynı transaction içinde kullanılamayacağı
-- durumlar olabildiğinden statement'lar transaction dışında bırakıldı;
-- her biri kendi başına atomiktir.

-- 1) Mevcut YEKA değerini YEKA_1'e çevir (varsa eski satırlar da otomatik döner)
ALTER TYPE public.finance_expense_area RENAME VALUE 'YEKA' TO 'YEKA_1';

-- 2) YEKA_2'yi YEKA_1'in hemen arkasına ekle
ALTER TYPE public.finance_expense_area ADD VALUE 'YEKA_2' AFTER 'YEKA_1';

-- Doğrulama:
-- SELECT enumlabel, enumsortorder FROM pg_enum e
-- JOIN pg_type t ON t.oid = e.enumtypid
-- WHERE t.typname = 'finance_expense_area' ORDER BY enumsortorder;
-- Beklenen: ANA_SAHA, ELEKTRIKSEL_KAPASITE_ARTISI, YEKA_1, YEKA_2
