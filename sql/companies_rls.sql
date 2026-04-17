-- RT Enerji - companies tablosu RLS politikaları
-- Not: companies tablosu Supabase Studio üzerinden manuel oluşturuldu.
-- Şema unit_types ile birebir benzer (id, code, name, is_active, display_order, created_at).
-- Konvansiyon: sql/organizasyon_mvp_rls.sql pattern'ine birebir uyumlu.
-- Silme stratejisi: soft delete (is_active = false). DELETE policy eklenmez.


alter table public.companies enable row level security;

-- Eski gevşek SELECT policy'sini (using true) konvansiyona uyumlu olanla değiştir
drop policy if exists companies_select on public.companies;
drop policy if exists companies_select_auth on public.companies;
drop policy if exists companies_insert_admin on public.companies;
drop policy if exists companies_update_admin on public.companies;

create policy companies_select_auth
  on public.companies
  for select
  using (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role in ('ORG_ADMIN', 'ORG_VIEWER')
    )
  );

create policy companies_insert_admin
  on public.companies
  for insert
  with check (
    exists (
      select 1 from public.app_users au
      where au.id = auth.uid()
        and au.role = 'ORG_ADMIN'
    )
  );

create policy companies_update_admin
  on public.companies
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
