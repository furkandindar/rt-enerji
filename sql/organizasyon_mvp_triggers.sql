-- RT Enerji Organizasyon Sistemi - MVP
-- auth.users -> public.app_users otomatik eşitleme fonksiyonu ve trigger
-- Not: Bu dosya sadece trigger/fonksiyon içerir; tablo şemaları için
-- `sql/organizasyon_mvp_schema.sql` dosyasına bakınız.


-- 1. Yeni auth kullanıcısından app_users kaydı oluşturan fonksiyon
create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_employee_id uuid;
begin
  -- Email varsa, employees tablosunda eşleşen çalışanı bulmaya çalış
  if new.email is not null then
    select e.id
      into v_employee_id
      from public.employees e
     where lower(e.email) = lower(new.email)
     limit 1;
  end if;

  -- app_users kaydını aç (varsayılan rol: ORG_VIEWER)
  insert into public.app_users (id, email, employee_id, role)
  values (new.id, new.email, v_employee_id, 'ORG_VIEWER')
  on conflict do nothing;  -- Herhangi bir çatışma durumunda sessizce geç

  return new;
end;
$$;


-- 2. auth.users tablosu için trigger
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_auth_user_created();

