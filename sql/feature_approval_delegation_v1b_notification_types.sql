-- Vekalet (Faz B / B2) — bildirim tipi enum'una iki değer
-- ============================================================================
-- create_notification() p_type'ı notification_type enum'una cast ettiği için
-- vekalet bildirimleri (vekil atandı / vekalet sona erdi) yeni değer ister.
--
-- NOT: ALTER TYPE ... ADD VALUE transaction bloğu İÇİNDE çalışmaz — bu dosyayı
--      BEGIN/COMMIT olmadan, olduğu gibi çalıştır. Sıra: önce DEV, sonra PROD
--      (feature_approval_delegation_v1.sql ile birlikte, deploy öncesi).
-- ============================================================================

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'DELEGATION_ASSIGNED';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'DELEGATION_CANCELLED';

-- Doğrulama:
-- SELECT enumlabel FROM pg_enum WHERE enumtypid = 'public.notification_type'::regtype ORDER BY enumsortorder;
-- → sonda DELEGATION_ASSIGNED, DELEGATION_CANCELLED görünmeli
