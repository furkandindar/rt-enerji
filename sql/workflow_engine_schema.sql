-- RT Enerji Workflow Engine - V2
-- Genel amaçlı onay süreçleri altyapısı
--
-- Bu dosya aşağıdaki tabloları içerir:
-- 1. workflow_definitions - Süreç şablonları
-- 2. workflow_steps - Onay adımları
-- 3. requests - Talepler
-- 4. request_approvals - Onay kayıtları
-- 5. leave_requests - İzin talep detayları (form-specific)
-- 6. notifications - Bildirimler
--
-- Bağımlılık: organizasyon_mvp_schema.sql önce çalıştırılmış olmalı


-- ============================================================================
-- 1. WORKFLOW_DEFINITIONS - Süreç Şablonları
-- ============================================================================
-- Her onay süreci için bir şablon (ANNUAL_LEAVE, SHORT_LEAVE, ADVANCE_REQUEST vb.)

create table if not exists public.workflow_definitions (
  id            uuid        primary key default gen_random_uuid(),
  code          text        not null unique,          -- 'ANNUAL_LEAVE', 'SHORT_LEAVE'
  name          text        not null,                 -- 'Yıllık İzin Talebi'
  description   text,
  is_active     boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);

comment on table public.workflow_definitions is 'Süreç şablonları - her onay türü için bir tanım';
comment on column public.workflow_definitions.code is 'Benzersiz süreç kodu: ANNUAL_LEAVE, SHORT_LEAVE, ADVANCE_REQUEST vb.';


-- ============================================================================
-- 2. WORKFLOW_STEPS - Onay Adımları
-- ============================================================================
-- Her sürecin sıralı onay adımları

create type public.approver_type as enum ('REQUESTER', 'UNIT_HEAD', 'STATIC_POSITION');

create table if not exists public.workflow_steps (
  id                      uuid        primary key default gen_random_uuid(),
  workflow_definition_id  uuid        not null references public.workflow_definitions(id) on delete cascade,
  step_order              smallint    not null,       -- 1, 2, 3, 4, 5...
  name                    text        not null,       -- 'Talep Eden', 'Bölüm Müdürü'
  approver_type           public.approver_type not null,
  static_position_id      uuid        references public.positions(id), -- STATIC_POSITION için
  is_required             boolean     not null default true,
  created_at              timestamptz not null default now(),

  -- Her workflow için step_order benzersiz olmalı
  unique (workflow_definition_id, step_order)
);

create index if not exists idx_workflow_steps_definition
  on public.workflow_steps (workflow_definition_id);

comment on table public.workflow_steps is 'Her sürecin sıralı onay adımları';
comment on column public.workflow_steps.approver_type is 'REQUESTER: Talep eden, UNIT_HEAD: Birim müdürü, STATIC_POSITION: Sabit pozisyon';
comment on column public.workflow_steps.static_position_id is 'Sadece STATIC_POSITION tipi için gerekli';


-- ============================================================================
-- 3. REQUESTS - Talepler
-- ============================================================================
-- Oluşturulan tüm talepler (izin, avans, seyahat vb.)

create type public.request_status as enum ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

create table if not exists public.requests (
  id                      uuid        primary key default gen_random_uuid(),
  workflow_definition_id  uuid        not null references public.workflow_definitions(id),
  requester_employee_id   uuid        not null references public.employees(id),
  status                  public.request_status not null default 'DRAFT',
  current_step            smallint    not null default 1,   -- Şu an hangi adımda
  submitted_at            timestamptz,                      -- PENDING'e geçiş zamanı
  completed_at            timestamptz,                      -- APPROVED/REJECTED zamanı
  created_at              timestamptz not null default now(),
  updated_at              timestamptz
);

create index if not exists idx_requests_requester
  on public.requests (requester_employee_id);

create index if not exists idx_requests_status
  on public.requests (status);

create index if not exists idx_requests_workflow
  on public.requests (workflow_definition_id);

comment on table public.requests is 'Tüm talepler - workflow_definition_id ile süreç tipine bağlanır';
comment on column public.requests.current_step is 'Şu an bekleyen adım numarası (workflow_steps.step_order)';


-- ============================================================================
-- 4. REQUEST_APPROVALS - Onay Kayıtları
-- ============================================================================
-- Her adım için onay/red kaydı

create type public.approval_status as enum ('PENDING', 'APPROVED', 'REJECTED');

create table if not exists public.request_approvals (
  id                  uuid        primary key default gen_random_uuid(),
  request_id          uuid        not null references public.requests(id) on delete cascade,
  workflow_step_id    uuid        not null references public.workflow_steps(id),
  approver_employee_id uuid       not null references public.employees(id),
  status              public.approval_status not null default 'PENDING',
  comment             text,                             -- Onay/red yorumu
  decided_at          timestamptz,                      -- Karar zamanı
  created_at          timestamptz not null default now(),

  -- Her talep için her adım bir kez olmalı
  unique (request_id, workflow_step_id)
);

create index if not exists idx_request_approvals_request
  on public.request_approvals (request_id);

create index if not exists idx_request_approvals_approver
  on public.request_approvals (approver_employee_id);

create index if not exists idx_request_approvals_status
  on public.request_approvals (status);

comment on table public.request_approvals is 'Her onay adımının kaydı - kim, ne zaman, ne karar verdi';
comment on column public.request_approvals.comment is 'Özellikle red durumunda zorunlu olabilir';


-- ============================================================================
-- 5. LEAVE_REQUESTS - İzin Talep Detayları (Form-Specific)
-- ============================================================================
-- İzin talebine özel alanlar

create type public.leave_type as enum ('ANNUAL_LEAVE', 'SHORT_LEAVE');

create table if not exists public.leave_requests (
  id                    uuid        primary key default gen_random_uuid(),
  request_id            uuid        not null unique references public.requests(id) on delete cascade,
  leave_type            public.leave_type not null,
  start_datetime        timestamptz not null,
  end_datetime          timestamptz not null,
  total_days            numeric(4,1),                   -- 1, 1.5, 2, 2.5... (kısa süreli için null olabilir)
  remaining_days        numeric(4,1),                   -- Kalan izin günü (bilgi amaçlı)
  address_during_leave  text,                           -- İzinde bulunacağı adres
  reason                text,                           -- İzin talep nedeni
  overtime_amount       numeric(10,2),                  -- Fazla mesai tutarı (İK girer)
  created_at            timestamptz not null default now(),
  updated_at            timestamptz
);

create index if not exists idx_leave_requests_request
  on public.leave_requests (request_id);

create index if not exists idx_leave_requests_type
  on public.leave_requests (leave_type);

comment on table public.leave_requests is 'İzin talebine özel veriler - requests tablosuyla 1:1 ilişkili';
comment on column public.leave_requests.overtime_amount is 'Sadece yıllık izin için, İK tarafından girilir';


-- ============================================================================
-- 6. NOTIFICATIONS - Bildirimler
-- ============================================================================
-- In-app bildirimler

create type public.notification_type as enum ('APPROVAL_REQUIRED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_CANCELLED');

create table if not exists public.notifications (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  title         text        not null,
  message       text        not null,
  type          public.notification_type not null,
  reference_id  uuid,                                 -- İlgili request_id
  is_read       boolean     not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists idx_notifications_user
  on public.notifications (user_id);

create index if not exists idx_notifications_unread
  on public.notifications (user_id, is_read) where is_read = false;

comment on table public.notifications is 'In-app bildirimler';
comment on column public.notifications.reference_id is 'Genellikle ilgili request_id';
comment on column public.notifications.type is 'Bildirim tipi - UI''da farklı ikonlar için kullanılabilir';


-- ============================================================================
-- TRIGGERS - Otomatik updated_at güncellemesi
-- ============================================================================

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- workflow_definitions için updated_at trigger
create trigger set_updated_at_workflow_definitions
  before update on public.workflow_definitions
  for each row
  execute function public.update_updated_at_column();

-- requests için updated_at trigger
create trigger set_updated_at_requests
  before update on public.requests
  for each row
  execute function public.update_updated_at_column();

-- leave_requests için updated_at trigger
create trigger set_updated_at_leave_requests
  before update on public.leave_requests
  for each row
  execute function public.update_updated_at_column();
