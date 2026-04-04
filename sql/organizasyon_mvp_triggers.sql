-- RT Enerji Organizasyon Sistemi - MVP
-- auth.users -> public.app_users otomatik eşitleme fonksiyonu ve trigger
-- Not: Bu dosya sadece trigger/fonksiyon içerir; tablo şemaları için
-- `sql/organizasyon_mvp_schema.sql` dosyasına bakınız.


-- 1. Yeni auth kullanıcısından app_users kaydı oluşturan fonksiyon
--    Eğer aynı employee_id ile eski bir app_users/auth.users kaydı varsa,
--    eski kayıtları temizler ve yeni kullanıcıya aktarır (email değişikliği senaryosu).
create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_employee_id uuid;
  v_old_user_id uuid;
  v_old_role    text;
begin
  -- Email varsa, employees tablosunda eşleşen çalışanı bulmaya çalış
  if new.email is not null then
    select e.id
      into v_employee_id
      from public.employees e
     where lower(e.email) = lower(new.email)
     limit 1;
  end if;

  -- Eğer eşleşen bir çalışan varsa, aynı employee_id ile eski app_users kaydı var mı kontrol et
  if v_employee_id is not null then
    select au.id, au.role
      into v_old_user_id, v_old_role
      from public.app_users au
     where au.employee_id = v_employee_id
       and au.id <> new.id  -- Yeni kullanıcıdan farklı olan eski kayıt
     limit 1;

    if v_old_user_id is not null then
      -- Eski kullanıcıya ait bildirimleri yeni kullanıcıya taşı
      update public.notifications
         set user_id = new.id
       where user_id = v_old_user_id;

      -- Eski app_users kaydını sil (auth.users cascade ile silinecek)
      delete from public.app_users where id = v_old_user_id;

      -- Eski auth.users kaydını sil
      delete from auth.users where id = v_old_user_id;

      -- Yeni app_users kaydını eski rolü koruyarak oluştur
      insert into public.app_users (id, email, employee_id, role)
      values (new.id, new.email, v_employee_id, v_old_role)
      on conflict do nothing;

      return new;
    end if;
  end if;

  -- Normal akış: yeni app_users kaydı oluştur (varsayılan rol: ORG_VIEWER)
  insert into public.app_users (id, email, employee_id, role)
  values (new.id, new.email, v_employee_id, 'ORG_VIEWER')
  on conflict do nothing;

  return new;
end;
$$;


-- 2. auth.users tablosu için trigger
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_auth_user_created();

