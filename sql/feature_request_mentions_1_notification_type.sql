-- ============================================================================
-- @mention bildirimi — 1/2: bildirim tipi
-- ============================================================================
--
-- create_notification() p_type'ı notification_type enum'una cast ettiği için
-- yeni 'MENTIONED' değeri kod deploy'undan ÖNCE eklenmeli.
--
-- NOT: ALTER TYPE ... ADD VALUE transaction bloğu İÇİNDE çalışmaz — bu dosyayı
-- tek başına (BEGIN/COMMIT olmadan) çalıştırın. Sonra 2/2'ye geçin.
-- Sıra: DEV (1/2 → 2/2) → PROD (1/2 → 2/2) → kod deploy.
-- ============================================================================

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'MENTIONED';

-- Doğrulama:
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'public.notification_type'::regtype ORDER BY enumsortorder;
