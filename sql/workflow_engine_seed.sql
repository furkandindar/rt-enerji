-- RT Enerji Workflow Engine - V2
-- Seed Data: Workflow Definitions & Steps
--
-- Bu dosya izin süreçleri için workflow tanımlarını içerir.
-- Not: static_position_id değerleri, gerçek position kayıtlarına göre güncellenmelidir.


-- ============================================================================
-- 1. WORKFLOW DEFINITIONS - Süreç Tanımları
-- ============================================================================

-- Yıllık İzin Süreci
insert into public.workflow_definitions (id, code, name, description)
values (
  '11111111-1111-1111-1111-111111111111',
  'ANNUAL_LEAVE',
  'Yıllık İzin Talebi',
  'Yıllık izin talep ve onay süreci - 5 adımlı onay zinciri'
) on conflict (code) do nothing;

-- Kısa Süreli İzin Süreci
insert into public.workflow_definitions (id, code, name, description)
values (
  '22222222-2222-2222-2222-222222222222',
  'SHORT_LEAVE',
  'Kısa Süreli İzin Talebi',
  'Kısa süreli izin talep ve onay süreci - 4 adımlı onay zinciri (Muhasebe yok)'
) on conflict (code) do nothing;


-- ============================================================================
-- 2. WORKFLOW STEPS - Yıllık İzin Adımları (5 Adım)
-- ============================================================================
-- Adım 1: Talep Eden
-- Adım 2: Bölüm Müdürü (UNIT_HEAD)
-- Adım 3: Personel Müdürlüğü (STATIC_POSITION - İK)
-- Adım 4: Muhasebe Müdürlüğü (STATIC_POSITION)
-- Adım 5: Genel Koordinatör (STATIC_POSITION)

-- Not: static_position_id değerleri placeholder'dır.
-- Gerçek değerler positions tablosundan alınmalıdır.

-- YILLIK İZİN ADIMLARI
insert into public.workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id)
values
  -- Adım 1: Talep Eden
  ('11111111-1111-1111-1111-111111111111', 1, 'Talep Eden', 'REQUESTER', null),
  
  -- Adım 2: Bölüm Müdürü (dinamik - talep edenin biriminin is_unit_head=true olan pozisyonu)
  ('11111111-1111-1111-1111-111111111111', 2, 'Bölüm Müdürü', 'UNIT_HEAD', null),
  
  -- Adım 3: Personel Müdürlüğü (İK)
  -- TODO: Gerçek İK Müdürü position_id ile değiştirilecek
  ('11111111-1111-1111-1111-111111111111', 3, 'Personel Müdürlüğü', 'STATIC_POSITION', null),
  
  -- Adım 4: Muhasebe Müdürlüğü
  -- TODO: Gerçek Muhasebe Müdürü position_id ile değiştirilecek
  ('11111111-1111-1111-1111-111111111111', 4, 'Muhasebe Müdürlüğü', 'STATIC_POSITION', null),
  
  -- Adım 5: Genel Koordinatör
  -- TODO: Gerçek Genel Koordinatör position_id ile değiştirilecek
  ('11111111-1111-1111-1111-111111111111', 5, 'Genel Koordinatör', 'STATIC_POSITION', null)

on conflict (workflow_definition_id, step_order) do nothing;


-- ============================================================================
-- 3. WORKFLOW STEPS - Kısa Süreli İzin Adımları (4 Adım)
-- ============================================================================
-- Adım 1: Talep Eden
-- Adım 2: Bölüm Müdürü (UNIT_HEAD)
-- Adım 3: Personel Müdürlüğü (STATIC_POSITION - İK)
-- Adım 4: Genel Koordinatör (STATIC_POSITION)
-- Not: Muhasebe adımı YOK

-- KISA SÜRELİ İZİN ADIMLARI
insert into public.workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id)
values
  -- Adım 1: Talep Eden
  ('22222222-2222-2222-2222-222222222222', 1, 'Talep Eden', 'REQUESTER', null),
  
  -- Adım 2: Bölüm Müdürü (dinamik)
  ('22222222-2222-2222-2222-222222222222', 2, 'Bölüm Müdürü', 'UNIT_HEAD', null),
  
  -- Adım 3: Personel Müdürlüğü (İK)
  -- TODO: Gerçek İK Müdürü position_id ile değiştirilecek
  ('22222222-2222-2222-2222-222222222222', 3, 'Personel Müdürlüğü', 'STATIC_POSITION', null),
  
  -- Adım 4: Genel Koordinatör
  -- TODO: Gerçek Genel Koordinatör position_id ile değiştirilecek
  ('22222222-2222-2222-2222-222222222222', 4, 'Genel Koordinatör', 'STATIC_POSITION', null)

on conflict (workflow_definition_id, step_order) do nothing;


-- ============================================================================
-- NOTLAR
-- ============================================================================
-- 
-- 1. static_position_id Değerleri:
--    Yukarıdaki STATIC_POSITION adımlarında static_position_id null bırakıldı.
--    Gerçek ortamda bu değerler positions tablosundan alınmalı:
--    
--    Örnek sorgu:
--    SELECT id, title FROM positions WHERE title ILIKE '%personel%' OR title ILIKE '%insan kaynakları%';
--    SELECT id, title FROM positions WHERE title ILIKE '%muhasebe%';
--    SELECT id, title FROM positions WHERE title ILIKE '%koordinatör%';
--
-- 2. Position ID'leri Güncelleme:
--    UPDATE workflow_steps 
--    SET static_position_id = '<GERCEK_POSITION_ID>'
--    WHERE name = 'Personel Müdürlüğü';
--
-- 3. Workflow Engine Mantığı:
--    - REQUESTER: Talebi oluşturan kişi otomatik atanır
--    - UNIT_HEAD: Talep edenin biriminde is_unit_head=true olan pozisyonun sahibi
--    - STATIC_POSITION: Belirtilen position_id'deki kişi

