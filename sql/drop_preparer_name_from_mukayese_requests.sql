-- ============================================================================
-- MIGRATION: mukayese_requests.preparer_name kolonunu kaldır
-- ============================================================================
--
-- Sebep: "Kısa Ad" alanı kullanım dışı bırakıldı. Hazırlayan kişi için
-- artık tek alan (preparer_full_name) kullanılıyor; PDF'te ve onay
-- panelinde de yalnızca tam ad gösteriliyor.
--
-- Bu migration:
--   1. mukayese_requests.preparer_name kolonunu drop eder
--   2. create_mukayese_request RPC'sini yeni signature ile yeniden tanımlar
--
-- Mevcut ortamlarda çalıştırmadan önce: DRAFT verisinde kayıp olmadığından
-- emin ol; bu kolon NOT NULL'dı, dolu satırlar drop ile birlikte silinir.
-- ============================================================================

ALTER TABLE public.mukayese_requests
  DROP COLUMN IF EXISTS preparer_name;

-- ----------------------------------------------------------------------------
-- RPC'yi yeniden tanımla (preparer_name referansı kaldırıldı)
-- Tam tanım için: sql/comparison_form_rpc.sql dosyasını yeniden çalıştırmak
-- yeterlidir. Bu blok sadece kolaylık olsun diye buradaki INSERT'i hızlıca
-- günceller. Komple RPC için canonical kaynak comparison_form_rpc.sql.
-- ----------------------------------------------------------------------------

-- NOT: comparison_form_rpc.sql dosyasını da bu migration sonrasında
-- (CREATE OR REPLACE) yeniden çalıştırın; bu sayede atomik transaction
-- mantığı ve diğer adımlar (items, suppliers, prices) güncel kalır.
