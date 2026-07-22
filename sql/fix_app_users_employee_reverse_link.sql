-- ============================================================================
-- FIX: app_users ↔ employees bağının ters yönden de kurulması
-- ============================================================================
--
-- SORUN:
--   handle_auth_user_created() trigger'ı YALNIZ auth.users INSERT anında (ilk
--   giriş) employees.email eşleşmesiyle app_users.employee_id'yi doldurur.
--   Kullanıcı, çalışan kaydı henüz eklenmeden giriş yaparsa employee_id NULL
--   kalır ve hiçbir ters yol onu geri doldurmaz — çalışan sonradan eklense
--   bile bağ kurulmaz. Neredeyse tüm API'ler "User not linked to employee"
--   (400) guard'ı taşıdığı için kullanıcı uygulamadan tamamen kilitlenir.
--   (Prod incident 2026-06-10: elvan.unal + gizem.furtin; tekrar eden şikayet.)
--
-- ÇÖZÜM:
--   employees INSERT / UPDATE OF email üzerinde simetrik ters trigger:
--   e-postası eşleşen ve employee_id'si NULL olan app_users satırını doldurur.
--   Böylece sıralama önemsizleşir — önce giriş, sonra çalışan kaydı gelse de
--   bağ, çalışan eklendiği an otomatik kurulur (kullanıcının sayfayı
--   yenilemesi yeterli, yeniden kayıt gerekmez).
--
-- GÜVENCELER:
--   * Yalnız employee_id IS NULL satırlara dokunur (mevcut bağları çalmaz).
--   * Çalışan zaten başka bir app_user'a bağlıysa atlar (çift bağ olmaz).
--   * SECURITY DEFINER + sabit search_path — handle_auth_user_created() ile
--     aynı desen; kolon-lockdown grant'larından etkilenmez.
--
-- UYGULAMA: önce dev, sonra prod. Kod değişikliği gerekmez.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_employee_link_app_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  if new.email is null then
    return new;
  end if;

  -- Bu çalışan zaten bir app_user'a bağlıysa dokunma (çift bağ engeli)
  if exists (select 1 from public.app_users au where au.employee_id = new.id) then
    return new;
  end if;

  -- E-postası eşleşen ve henüz bağsız (employee_id NULL) app_user'ı bağla
  update public.app_users au
     set employee_id = new.id
   where lower(au.email) = lower(new.email)
     and au.employee_id is null;

  return new;
end;
$$;

ALTER FUNCTION public.handle_employee_link_app_user() OWNER TO postgres;

DROP TRIGGER IF EXISTS trg_employees_link_app_user ON public.employees;

CREATE TRIGGER trg_employees_link_app_user
  AFTER INSERT OR UPDATE OF email ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_employee_link_app_user();

-- ----------------------------------------------------------------------------
-- Tek seferlik backfill: halihazırda bağsız kalmış app_users'ı onar.
-- (İdempotent; eşleşen çalışanı olmayan satırlara dokunmaz. 2026-07-20 itibarıyla
--  prod'da eşleşen çalışanı olan bağsız kullanıcı yok — ileride trigger'dan
--  önce oluşmuş bir vaka kalırsa diye güvenlik ağı olarak duruyor.)
-- ----------------------------------------------------------------------------

UPDATE public.app_users au
   SET employee_id = e.id
  FROM public.employees e
 WHERE au.employee_id IS NULL
   AND lower(e.email) = lower(au.email)
   AND NOT EXISTS (
         SELECT 1 FROM public.app_users au2 WHERE au2.employee_id = e.id
       );

COMMIT;

-- DOĞRULAMA (uygulamadan sonra çalıştır):
--   select au.email, au.employee_id is not null as linked
--     from app_users au
--     left join employees e on lower(e.email) = lower(au.email)
--    where e.id is not null
--    order by linked, au.email;
