-- RT Enerji Organizasyon Sistemi - MVP
-- Row Level Security (RLS) politikaları
-- Not: Bu dosya, auth.users -> app_users trigger'ının zaten kurulu olduğunu varsayar.
-- Temel prensipler:
-- - ORG_ADMIN  : Tüm tablolarda tam CRUD.
-- - ORG_VIEWER : Tüm tablolarda sadece SELECT.
-- - Diğer roller / kayıtsız kullanıcılar: erişim yok.


-- 0. app_users - her kullanıcı sadece kendi kaydını görebilir
alter table public.app_users enable row level security;
create policy app_users_select_self
  on public.app_users
  for select
  using (id = auth.uid());


-- 1. unit_types
alter table public.unit_types enable row level security;
create policy unit_types_select_auth
  on public.unit_types
  for select
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role in ('ORG_ADMIN', 'ORG_VIEWER')
    )
  );
create policy unit_types_insert_admin
  on public.unit_types
  for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );
create policy unit_types_update_admin
  on public.unit_types
  for update
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  )
  with check (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );
create policy unit_types_delete_admin
  on public.unit_types
  for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );


-- 2. position_types
alter table public.position_types enable row level security;
create policy position_types_select_auth
  on public.position_types
  for select
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role in ('ORG_ADMIN', 'ORG_VIEWER')
    )
  );
create policy position_types_insert_admin
  on public.position_types
  for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );
create policy position_types_update_admin
  on public.position_types
  for update
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  )
  with check (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );
create policy position_types_delete_admin
  on public.position_types
  for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );


-- 3. grade_levels
alter table public.grade_levels enable row level security;
create policy grade_levels_select_auth
  on public.grade_levels
  for select
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role in ('ORG_ADMIN', 'ORG_VIEWER')
    )
  );
create policy grade_levels_insert_admin
  on public.grade_levels
  for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );
create policy grade_levels_update_admin
  on public.grade_levels
  for update
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  )
  with check (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );
create policy grade_levels_delete_admin
  on public.grade_levels
  for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );


-- 4. organizational_units
alter table public.organizational_units enable row level security;
create policy organizational_units_select_auth
  on public.organizational_units
  for select
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role in ('ORG_ADMIN', 'ORG_VIEWER')
    )
  );
create policy organizational_units_insert_admin
  on public.organizational_units
  for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );
create policy organizational_units_update_admin
  on public.organizational_units
  for update
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  )
  with check (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );
create policy organizational_units_delete_admin
  on public.organizational_units
  for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );


-- 5. positions
alter table public.positions enable row level security;
create policy positions_select_auth
  on public.positions
  for select
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role in ('ORG_ADMIN', 'ORG_VIEWER')
    )
  );
create policy positions_insert_admin
  on public.positions
  for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );
create policy positions_update_admin
  on public.positions
  for update
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  )
  with check (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );
create policy positions_delete_admin
  on public.positions
  for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );


-- 6. employees
alter table public.employees enable row level security;
create policy employees_select_auth
  on public.employees
  for select
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role in ('ORG_ADMIN', 'ORG_VIEWER')
    )
  );
create policy employees_insert_admin
  on public.employees
  for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );
create policy employees_update_admin
  on public.employees
  for update
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  )
  with check (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );
create policy employees_delete_admin
  on public.employees
  for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );


-- 7. employee_positions
alter table public.employee_positions enable row level security;
create policy employee_positions_select_auth
  on public.employee_positions
  for select
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role in ('ORG_ADMIN', 'ORG_VIEWER')
    )
  );
create policy employee_positions_insert_admin
  on public.employee_positions
  for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );
create policy employee_positions_update_admin
  on public.employee_positions
  for update
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  )
  with check (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );
create policy employee_positions_delete_admin
  on public.employee_positions
  for delete
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );

