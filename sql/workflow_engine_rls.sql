-- RT Enerji Workflow Engine - V2
-- Row Level Security (RLS) Politikaları
--
-- Prensipler:
-- - app_users: Tüm authenticated kullanıcılar okuyabilir (bildirim sistemi için gerekli)
-- - workflow_definitions, workflow_steps: Herkes okuyabilir (public config)
-- - requests: Talep eden + onaycılar görebilir
-- - request_approvals: İlgili talep erişilebilirse görülebilir
-- - leave_requests: İlgili talep erişilebilirse görülebilir
-- - notifications: Sadece kendi bildirimleri


-- ============================================================================
-- 0. APP_USERS - Tüm authenticated kullanıcılar okuyabilir
-- ============================================================================
-- NOT: Bildirim sistemi bir employee_id'den user_id'yi bulmak zorunda.
-- Bu nedenle tüm authenticated kullanıcılar app_users tablosunu okuyabilmeli.

alter table public.app_users enable row level security;

-- SELECT: Tüm authenticated kullanıcılar okuyabilir
create policy app_users_select_all
  on public.app_users
  for select
  to authenticated
  using (true);

-- INSERT: Sadece admin
create policy app_users_insert_admin
  on public.app_users
  for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid() and au.role = 'ORG_ADMIN'
    )
  );

-- UPDATE: Kendisi veya admin
create policy app_users_update
  on public.app_users
  for update
  using (
    id = auth.uid()
    OR exists (
      select 1 from public.app_users au
      where au.id = auth.uid() and au.role = 'ORG_ADMIN'
    )
  );


-- ============================================================================
-- 1. WORKFLOW_DEFINITIONS - Herkes okuyabilir, sadece admin yazabilir
-- ============================================================================

alter table public.workflow_definitions enable row level security;

-- SELECT: Tüm authenticated kullanıcılar okuyabilir
create policy workflow_definitions_select
  on public.workflow_definitions
  for select
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
    )
  );

-- INSERT/UPDATE: Sadece ORG_ADMIN
create policy workflow_definitions_insert_admin
  on public.workflow_definitions
  for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid() and au.role = 'ORG_ADMIN'
    )
  );

create policy workflow_definitions_update_admin
  on public.workflow_definitions
  for update
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid() and au.role = 'ORG_ADMIN'
    )
  );


-- ============================================================================
-- 2. WORKFLOW_STEPS - Herkes okuyabilir, sadece admin yazabilir
-- ============================================================================

alter table public.workflow_steps enable row level security;

create policy workflow_steps_select
  on public.workflow_steps
  for select
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
    )
  );

create policy workflow_steps_insert_admin
  on public.workflow_steps
  for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid() and au.role = 'ORG_ADMIN'
    )
  );

create policy workflow_steps_update_admin
  on public.workflow_steps
  for update
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid() and au.role = 'ORG_ADMIN'
    )
  );


-- ============================================================================
-- 3. REQUESTS - Talep eden + Onaycılar görebilir
-- ============================================================================

alter table public.requests enable row level security;

-- Helper function: Kullanıcının employee_id'sini al
create or replace function public.get_current_employee_id()
returns uuid
language sql
stable
security definer
as $$
  select au.employee_id
  from public.app_users au
  where au.id = auth.uid()
$$;

-- Helper function: Kullanıcının bir talep için onaycı olup olmadığını kontrol et
-- SECURITY DEFINER ile RLS'i bypass eder (döngüsel referansı önler)
create or replace function public.is_approver_for_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.request_approvals ra
    where ra.request_id = p_request_id
      and ra.approver_employee_id = public.get_current_employee_id()
  )
$$;

-- SELECT: Talep eden VEYA onay zincirindeki kişi
-- NOT: request_approvals tablosuna doğrudan bakmak yerine SECURITY DEFINER
-- fonksiyonu kullanılır (döngüsel RLS referansını önlemek için)
create policy requests_select
  on public.requests
  for select
  using (
    -- Talep eden kişi
    requester_employee_id = public.get_current_employee_id()
    OR
    -- Onaycı olarak atanmış (SECURITY DEFINER function ile)
    public.is_approver_for_request(requests.id)
    OR
    -- ORG_ADMIN tüm talepleri görebilir
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid() and au.role = 'ORG_ADMIN'
    )
  );

-- INSERT: Herkes kendi adına talep oluşturabilir
create policy requests_insert
  on public.requests
  for insert
  with check (
    requester_employee_id = public.get_current_employee_id()
  );

-- UPDATE: Talep eden, onaycılar (current_step güncellemesi için), veya admin
create policy requests_update
  on public.requests
  for update
  using (
    -- Talep eden kişi
    requester_employee_id = public.get_current_employee_id()
    OR
    -- Onaycı (current_step güncellemesi için)
    public.is_approver_for_request(requests.id)
    OR
    -- ORG_ADMIN
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid() and au.role = 'ORG_ADMIN'
    )
  );


-- ============================================================================
-- 4. REQUEST_APPROVALS - Talep görülebiliyorsa onaylar da görülebilir
-- ============================================================================

alter table public.request_approvals enable row level security;

-- SELECT: Onaycı kendisi, talebin sahibi, veya admin
-- NOT: Döngüsel referansı önlemek için basitleştirildi
create policy request_approvals_select
  on public.request_approvals
  for select
  using (
    -- Onaycı kendisi
    approver_employee_id = public.get_current_employee_id()
    OR
    -- Talebin sahibi (direkt join ile)
    exists (
      select 1 from public.requests r
      where r.id = request_approvals.request_id
        and r.requester_employee_id = public.get_current_employee_id()
    )
    OR
    -- ORG_ADMIN
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid() and au.role = 'ORG_ADMIN'
    )
  );

-- INSERT: Talep sahibi kendi talebi için onay kayıtları oluşturabilir
-- (workflow engine talep oluşturulurken approval chain'i oluşturur)
create policy request_approvals_insert
  on public.request_approvals
  for insert
  with check (
    -- ORG_ADMIN her şeyi yapabilir
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid() and au.role = 'ORG_ADMIN'
    )
    OR
    -- Talep sahibi kendi talebi için onay kaydı oluşturabilir
    exists (
      select 1 from public.requests r
      where r.id = request_approvals.request_id
        and r.requester_employee_id = public.get_current_employee_id()
    )
  );

-- UPDATE: Sadece atanmış onaycı kendi PENDING kaydını güncelleyebilir
-- WITH CHECK: Güncelleme sonrası status APPROVED veya REJECTED olabilir
create policy request_approvals_update
  on public.request_approvals
  for update
  using (
    approver_employee_id = public.get_current_employee_id()
    and status = 'PENDING'  -- Sadece bekleyen onaylar güncellenebilir
  )
  with check (
    approver_employee_id = public.get_current_employee_id()
    and status in ('APPROVED', 'REJECTED')  -- Güncelleme sonrası geçerli değerler
  );


-- ============================================================================
-- 5. LEAVE_REQUESTS - Talep görülebiliyorsa izin detayları da görülebilir
-- ============================================================================

alter table public.leave_requests enable row level security;

-- SELECT: İlgili talebi görebilen herkes
create policy leave_requests_select
  on public.leave_requests
  for select
  using (
    exists (
      select 1 from public.requests r
      where r.id = leave_requests.request_id
        and (
          r.requester_employee_id = public.get_current_employee_id()
          OR exists (
            select 1 from public.request_approvals ra
            where ra.request_id = r.id
              and ra.approver_employee_id = public.get_current_employee_id()
          )
          OR exists (
            select 1 from public.app_users au
            where au.id = auth.uid() and au.role = 'ORG_ADMIN'
          )
        )
    )
  );

-- INSERT: Talep sahibi
create policy leave_requests_insert
  on public.leave_requests
  for insert
  with check (
    exists (
      select 1 from public.requests r
      where r.id = leave_requests.request_id
        and r.requester_employee_id = public.get_current_employee_id()
    )
  );

-- UPDATE: Talep sahibi (draft durumunda) veya admin
create policy leave_requests_update
  on public.leave_requests
  for update
  using (
    exists (
      select 1 from public.requests r
      where r.id = leave_requests.request_id
        and (
          (r.requester_employee_id = public.get_current_employee_id() and r.status = 'DRAFT')
          OR exists (
            select 1 from public.app_users au
            where au.id = auth.uid() and au.role = 'ORG_ADMIN'
          )
        )
    )
  );


-- ============================================================================
-- 6. NOTIFICATIONS - Sadece kendi bildirimleri
-- ============================================================================
-- NOT: Bildirim sistemi başka kullanıcılara bildirim gönderebilmeli.
-- SELECT/UPDATE sadece kendi bildirimleri, INSERT herhangi bir kullanıcıya.

alter table public.notifications enable row level security;

-- SELECT: Sadece kendi bildirimleri
create policy notifications_select
  on public.notifications
  for select
  using (user_id = auth.uid());

-- INSERT: Authenticated kullanıcılar HERHANGİ bir kullanıcıya bildirim gönderebilir
-- (Workflow engine onay bekleyen kişilere bildirim gönderir)
create policy notifications_insert_any
  on public.notifications
  for insert
  to authenticated
  with check (true);

-- UPDATE: Sadece kendi bildirimlerini okundu işaretleyebilir
create policy notifications_update
  on public.notifications
  for update
  using (user_id = auth.uid());
