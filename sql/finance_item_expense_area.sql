-- ============================================================================
-- Finans Onay Kapağı: satır bazında Harcama Alanı (K / A / YEKA 1 / YEKA 2)
-- ============================================================================
-- Bağlam (feedback 2026-10):
--   "Muhasebe onay kapağındaki kapasite (K), Ana Saha (A), YEKA 1, YEKA 2
--   sütunu finans onay kapağına da eklenmeli."
--   Muhasebe kapağında bu seçim satır bazında (capacity_type) tutuluyor;
--   finans kapağında ise yalnız başlıkta tek bir "Harcama Alanı" vardı.
--   Başlık alanı yerinde kalıyor; her ödeme satırına ayrıca alan seçimi ekleniyor.
--
-- Tasarım:
--   - Mevcut public.finance_expense_area enum'u kullanılır
--     (ANA_SAHA, ELEKTRIKSEL_KAPASITE_ARTISI, YEKA_1, YEKA_2) — yeni enum yok.
--   - Kolon NULLABLE: eski satırlar (prod ~1137) boş kalır; PDF ve ekranlar boş
--     satırda başlıktaki expense_area'yı gösterir. Bu yüzden VERİ UPDATE'İ YOK.
--   - Yeni talepler için zorunluluk uygulama katmanında (form + API) uygulanır.
--   - Bu kolonu okuyan view/fonksiyon yok (prod pg_proc'ta doğrulandı);
--     item select'leri `items:finance_approval_cover_items(*)` olduğundan kolon
--     otomatik gelir.
--
-- Sıralama:
--   ÖNCE bu SQL (dev → prod), SONRA deploy.
--   Yeni kod insert'te expense_area gönderir; kolon yoksa insert hata alır.
--   Eski kod kolonu hiç göndermediği için SQL önden çalıştırmak güvenlidir.

ALTER TABLE public.finance_approval_cover_items
  ADD COLUMN IF NOT EXISTS expense_area public.finance_expense_area;

COMMENT ON COLUMN public.finance_approval_cover_items.expense_area IS
  'Satırın harcama alanı (K/A/YEKA 1/YEKA 2). NULL = eski kayıt; başlıktaki finance_approval_cover_requests.expense_area geçerlidir.';

-- Doğrulama:
-- SELECT column_name, udt_name, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'finance_approval_cover_items'
--   AND column_name = 'expense_area';
-- Beklenen: expense_area | finance_expense_area | YES
