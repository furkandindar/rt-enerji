-- =====================================================================
-- Feature: Request Lifecycle (Update / Withdraw / Cancel / Revision)
-- Migration 1/3 — Enum genişletmeleri
-- =====================================================================
-- ÖNEMLİ: ALTER TYPE ... ADD VALUE PostgreSQL'de aynı transaction içinde
-- başka SQL ile birlikte ÇALIŞTIRILAMAZ. Her ADD VALUE auto-commit modunda
-- ayrı bir statement olarak çalıştırılmalıdır.
-- Supabase SQL Editor zaten her statement'ı ayrı çalıştırır; bu dosyayı
-- olduğu gibi yapıştırıp Run demek yeterli olur.
-- =====================================================================

-- request_status enum'una REVISION_REQUESTED ekle
ALTER TYPE public.request_status ADD VALUE IF NOT EXISTS 'REVISION_REQUESTED';

-- approval_status enum'una REVISION_REQUESTED ekle (onaycının kendi
-- onay kaydını revize talebine çekebilmesi için)
ALTER TYPE public.approval_status ADD VALUE IF NOT EXISTS 'REVISION_REQUESTED';

-- notification_type enum'una iki yeni değer ekle
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'REQUEST_UPDATED';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'REVISION_REQUESTED';
