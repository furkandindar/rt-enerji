-- RT Enerji Organizasyon Sistemi - MVP
-- Organizasyon veri modeli ve uygulama kullanıcıları için temel tablo şemaları
-- Bu dosya yalnızca CREATE TABLE / INDEX komutlarını içerir (trigger ve RLS ayrı gelecektir).

-- Not: Supabase/Postgres ortamında gen_random_uuid() fonksiyonu için pgcrypto eklentisi gerekir.
-- Supabase projelerinde varsayılan olarak yüklüdür; gerekirse aşağıdaki satır açılabilir:
-- create extension if not exists pgcrypto;


-- 1. Sözlük tablolar

-- 1.1 unit_types - organizasyon birimi tipleri
create table if not exists public.unit_types (
  id            uuid        primary key default gen_random_uuid(),
  code          text        not null unique,
  name          text        not null,
  description   text,
  is_active     boolean     not null default true,
  display_order integer     not null default 0,
  created_at    timestamptz not null default now()
);


-- 1.2 position_types - pozisyon tipleri
create table if not exists public.position_types (
  id            uuid        primary key default gen_random_uuid(),
  code          text        not null unique,
  name          text        not null,
  color         text,
  description   text,
  is_active     boolean     not null default true,
  display_order integer     not null default 0,
  created_at    timestamptz not null default now()
);


-- 1.3 grade_levels - seviye bantları
create table if not exists public.grade_levels (
  band         smallint    primary key,  -- 100, 200, 300, 400, 500
  name         text        not null,
  description  text,
  is_active    boolean     not null default true,
  display_order integer    not null default 0,
  created_at   timestamptz not null default now()
);


-- 2. Ana organizasyon tabloları

-- 2.1 organizational_units - organizasyon birimleri
create table if not exists public.organizational_units (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  code         text        unique,
  unit_type_id uuid        not null references public.unit_types(id),
  parent_id    uuid        references public.organizational_units(id) on delete set null,
  description  text,
  is_active    boolean     not null default true,
  order_index  integer     not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);


-- 2.2 positions - pozisyonlar / görevler
create table if not exists public.positions (
  id                    uuid        primary key default gen_random_uuid(),
  title                 text        not null,
  job_code              text        not null unique,
  level_band            smallint    not null references public.grade_levels(band),
  unit_id               uuid        not null references public.organizational_units(id),
  position_type_id      uuid        references public.position_types(id),
  reports_to_position_id uuid       references public.positions(id) on delete set null,
  location              text,
  is_unit_head          boolean     not null default false,
  is_active             boolean     not null default true,
  order_index           integer     not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz
);


-- 2.3 employees - çalışanlar
create table if not exists public.employees (
  id               uuid        primary key default gen_random_uuid(),
  first_name       text        not null,
  last_name        text        not null,
  employee_no      text        unique,
  email            text        unique,
  phone            text,
  status           text        not null default 'ACTIVE',
  hire_date        date,
  termination_date date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz
);


-- 2.4 employee_positions - çalışan–pozisyon atamaları
create table if not exists public.employee_positions (
  id          uuid     primary key default gen_random_uuid(),
  employee_id uuid     not null references public.employees(id),
  position_id uuid     not null references public.positions(id),
  start_date  date     not null,
  end_date    date,
  is_primary  boolean  not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_employee_positions_employee
  on public.employee_positions (employee_id);

create index if not exists idx_employee_positions_position
  on public.employee_positions (position_id);


-- 3. Uygulama kullanıcıları tablosu (auth/users ile ilişkili)

-- Not: Bu tablo, Supabase auth.users tablosu ile bire bir ilişkili olacak şekilde tasarlanmıştır.
-- id alanı için default verilmez; kayıtlar bir trigger / edge function ile oluşturulur.

create table if not exists public.app_users (
  id          uuid        primary key references auth.users(id) on delete cascade,
  email       text        not null unique,
  employee_id uuid        references public.employees(id),
  role        text        not null default 'ORG_VIEWER',
  created_at  timestamptz not null default now()
);

