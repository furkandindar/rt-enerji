-- ============================================================================
-- RLS performansı 1/2: küme tabanlı görünürlük yardımcıları (YALNIZ EKLEME)
-- ============================================================================
--
-- Sorun (2026-11-11, Finans Onay Kapağı listesi 8 sn statement timeout):
--   requests_select her satır için önce is_approver_for_request(id) çağırıyordu
--   (talebin tüm onay satırlarını tarar, her birinde vekalet kontrolü yapar);
--   can_view_workflow_requests(...) ve get_current_employee_id()/auth.uid() da satır
--   başına çalışıyordu. 8 detay tablosu aynı kontrolü kendi politikasında kopyaladığı
--   için satır başına 2–4 kez tekrarlanıyordu. Maliyet toplam kayıt sayısıyla büyüdü.
--
-- Çözüm: aynı soruları sorgu başına BİR KEZ küme olarak hesapla; politikada her satır
-- yalnız bir hash araması yapsın (`x IN (SELECT ...)` → hashed SubPlan,
-- `(SELECT f())` → InitPlan).
--
-- Bu dosya yalnız fonksiyon ekler; hiçbir politika/davranış değişmez. Politikalar
-- 2/2'de (perf_rls_2_policies.sql) bu fonksiyonlara geçer. Eşdeğerlik: her fonksiyon
-- mevcut satır-bazlı fonksiyonun birebir küme karşılığıdır (aşağıda tek tek).
-- Mevcut fonksiyonlar (is_approver_for_request, can_view_workflow_requests, ...)
-- korunur.
--
-- Önce DEV, sonra PROD.
-- DEV + PROD: 2026-11-11 uygulandı (yalnız ekleme; 2/2 uygulanana kadar kullanılmaz).
-- ARŞİV NOTU (2026-11-12): bu script'teki fonksiyonlar hardening_1 ile `private`
-- şemasına taşındı; yeniden ÇALIŞTIRMA (public'te kopya oluşturur). Güncel tanım: canlı DB.
-- ============================================================================

BEGIN;

-- Mevcut kullanıcı ORG_ADMIN mi?  (can_view_workflow_requests / requests_select'teki
-- `EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'ORG_ADMIN')`)
CREATE OR REPLACE FUNCTION public.rls_is_org_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE id = auth.uid() AND role = 'ORG_ADMIN'
  )
$function$;

-- can_view_workflow_requests(p) = true olan TÜM workflow id'leri.
--   admin → hepsi; kısıtsız süreç; başlatıcı pozisyon/birim eşleşmesi.
CREATE OR REPLACE FUNCTION public.rls_viewable_workflow_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT wd.id
  FROM public.workflow_definitions wd
  WHERE EXISTS (
          SELECT 1 FROM public.app_users
          WHERE id = auth.uid() AND role = 'ORG_ADMIN'
        )
     OR wd.is_restricted = false
     OR EXISTS (
          SELECT 1
          FROM public.workflow_initiators wi
          JOIN public.employee_positions ep
            ON ep.employee_id = public.get_current_employee_id()
           AND ep.end_date IS NULL
          JOIN public.positions p ON p.id = ep.position_id
          WHERE wi.workflow_definition_id = wd.id
            AND (
              (wi.position_id IS NOT NULL AND wi.position_id = ep.position_id)
              OR (wi.unit_id IS NOT NULL AND wi.unit_id = p.unit_id)
            )
        )
$function$;

-- is_approver_for_request(p) = true olan TÜM talep id'leri.
--   onaycı / fiilen işlem yapan / onaycının aktif vekili (aynı süreçte).
CREATE OR REPLACE FUNCTION public.rls_approver_request_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT ra.request_id
  FROM public.request_approvals ra
  WHERE ra.approver_employee_id = public.get_current_employee_id()
  UNION
  SELECT ra.request_id
  FROM public.request_approvals ra
  WHERE ra.acted_by_employee_id = public.get_current_employee_id()
  UNION
  SELECT ra.request_id
  FROM public.approval_delegations d
  JOIN public.request_approvals ra ON ra.approver_employee_id = d.delegator_employee_id
  JOIN public.requests r
    ON r.id = ra.request_id
   AND r.workflow_definition_id = d.workflow_definition_id
  WHERE d.status = 'ACTIVE'
    AND d.delegate_employee_id = public.get_current_employee_id()
    AND now() >= d.starts_at
    AND now() <  d.ends_at
$function$;

-- request_approvals_select'teki "talep sahibiyim VEYA süreci görebiliyorum" dalının
-- küme hâli: talep sahibi olunan + workflow düzeyinde görülebilen talepler.
CREATE OR REPLACE FUNCTION public.rls_own_or_workflow_viewable_request_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT r.id
  FROM public.requests r
  WHERE r.requester_employee_id = public.get_current_employee_id()
     OR r.workflow_definition_id IN (SELECT public.rls_viewable_workflow_ids())
$function$;

-- Yetkiler mevcut RLS fonksiyonlarıyla (is_approver_for_request, can_view_workflow_requests)
-- birebir aynı tutulur: PUBLIC/anon/authenticated/service_role EXECUTE. Farklı olsaydı
-- bazı rollerin sorguları boş sonuç yerine "permission denied" hatası alırdı.
GRANT EXECUTE ON FUNCTION public.rls_is_org_admin() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rls_viewable_workflow_ids() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rls_approver_request_ids() TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rls_own_or_workflow_viewable_request_ids() TO PUBLIC, anon, authenticated, service_role;

COMMIT;
