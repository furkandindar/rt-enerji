-- =====================================================================
-- Talep görünürlüğü daraltma: kısıtsız süreçler artık herkese açık değil — 2026-11-25
-- =====================================================================
-- Sorun: private.rls_viewable_workflow_ids() kısıtsız (is_restricted = false) süreçlerin
-- TÜM taleplerini her kurum üyesine açıyordu. Ekranlar yalnız kişinin kendi verisini
-- listelediği için görünmüyordu, ama oturum açmış herhangi bir çalışan API'ye doğrudan
-- istekle şunları okuyabiliyordu (prod, sıradan bir kullanıcı, 2026-11-25):
--   * 59 kişinin 1.671 talebi (kim, ne zaman, hangi süreç — maaş avansı dahil, durum),
--   * bu taleplerdeki 596 onaycı notu (ret / revize gerekçeleri dahil),
--   * 801 ek dosyanın adı ve boyutu.
-- Form içerikleri (detay tabloları), ek dosyaların ve PDF'lerin kendisi zaten korunuyordu.
--
-- Yeni kural — bir talebi görenler:
--   talep sahibi · onay zinciri (onaycı / işlem yapan / aktif vekil) · requests.view_all ·
--   Müdür / birim kapsamı · kısıtlı süreçte başlatıcı (departman görüntüleyici) ·
--   @bahsedilen kişi (yalnız kısıtsız süreçlerde; başlık + onay zinciri + notlar).
--
-- @bahsetme: anılan kişi bugüne kadar talebi geniş görünürlük sayesinde açabiliyordu
-- (51 anmanın 33'ü zincir dışından biri). Anma = paylaşım: anılan kişi talebin
-- başlığını, onay zincirini ve notlarını görür; form içeriği, ekler ve PDF görmez
-- (detay politikaları ve ek/PDF uçları anmayı tanımaz). Kısıtlı süreçlerde anma
-- görünürlük vermez (aday zaten görebilenlerdir). Aday kuralı kodda:
-- lib/workflow/mentions.ts.
--
-- Değişmeyen: org dizini (çalışan/pozisyon/birim) ve süreç yapılandırması üyelere açık
-- kalır (rls_is_member politikaları); kısıtlı süreçlerin başlatıcı görünürlüğü aynen.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- A. "Tüm talepleri görülebilen süreçler": kısıtsız-süreç-üye dalı kaldırıldı
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.rls_viewable_workflow_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT wd.id
  FROM public.workflow_definitions wd
  WHERE private.has_permission('requests.view_all')
     OR EXISTS (
          SELECT 1
          FROM public.workflow_initiators wi
          JOIN public.employee_positions ep
            ON ep.employee_id = private.get_current_employee_id()
           AND ep.end_date IS NULL
          JOIN public.positions p ON p.id = ep.position_id
          WHERE wi.workflow_definition_id = wd.id
            AND (
              (wi.position_id IS NOT NULL AND wi.position_id = ep.position_id)
              OR (wi.unit_id IS NOT NULL AND wi.unit_id = p.unit_id)
            )
        )
$function$;

-- Eski tekil sürüm (politikalarda artık kullanılmıyor) — aynı kurala çekildi.
CREATE OR REPLACE FUNCTION private.can_view_workflow_requests(p_workflow_definition_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT private.has_permission('requests.view_all')
  OR EXISTS (
    SELECT 1
    FROM workflow_initiators wi
    JOIN employee_positions ep
      ON ep.employee_id = private.get_current_employee_id()
     AND ep.end_date IS NULL
    JOIN positions p ON p.id = ep.position_id
    WHERE wi.workflow_definition_id = p_workflow_definition_id
      AND (
        (wi.position_id IS NOT NULL AND wi.position_id = ep.position_id)
        OR (wi.unit_id IS NOT NULL AND wi.unit_id = p.unit_id)
      )
  );
$function$;

-- ---------------------------------------------------------------------
-- B. @bahsedilen kişi (yalnız kısıtsız süreçler)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.rls_mentioned_request_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT m.request_id
  FROM public.request_mentions m
  JOIN public.requests r ON r.id = m.request_id
  JOIN public.workflow_definitions wd ON wd.id = r.workflow_definition_id
  WHERE m.mentioned_employee_id = private.get_current_employee_id()
    AND NOT wd.is_restricted
$$;
REVOKE ALL ON FUNCTION private.rls_mentioned_request_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.rls_mentioned_request_ids() TO authenticated, service_role;

-- Talep başlığı
ALTER POLICY requests_select ON public.requests
  USING (
    (requester_employee_id = ( SELECT private.get_current_employee_id() AS get_current_employee_id))
    OR ( SELECT private.has_permission('requests.view_all'::text) AS has_permission)
    OR (workflow_definition_id IN ( SELECT private.rls_viewable_workflow_ids() AS rls_viewable_workflow_ids))
    OR (id IN ( SELECT private.rls_approver_request_ids() AS rls_approver_request_ids))
    OR (id IN ( SELECT private.rls_unit_manager_request_ids() AS rls_unit_manager_request_ids))
    OR (id IN ( SELECT private.rls_mentioned_request_ids() AS rls_mentioned_request_ids))
  );

-- Onay zinciri + notlar (request_approvals_select bu kümeyi kullanır)
CREATE OR REPLACE FUNCTION private.rls_own_or_workflow_viewable_request_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT r.id
  FROM public.requests r
  WHERE r.requester_employee_id = private.get_current_employee_id()
     OR r.workflow_definition_id IN (SELECT private.rls_viewable_workflow_ids())
  UNION
  SELECT private.rls_mentioned_request_ids()
$function$;

-- ---------------------------------------------------------------------
-- C. @bahsetme adayları / görünürlük karşılığı (requests_select'in çalışan-parametreli hali)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.employees_who_can_view_request(p_request_id uuid, p_employee_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(employee_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH RECURSIVE req AS (
    SELECT r.id, r.requester_employee_id, r.workflow_definition_id, r.status,
           wd.is_restricted, wd.unit_manager_visible, wd.content_restricted
    FROM public.requests r
    JOIN public.workflow_definitions wd ON wd.id = r.workflow_definition_id
    WHERE r.id = p_request_id
  ),
  req_units AS (
    SELECT p.unit_id AS id
    FROM req
    JOIN public.employee_positions ep ON ep.employee_id = req.requester_employee_id AND ep.end_date IS NULL
    JOIN public.positions p ON p.id = ep.position_id
    WHERE p.unit_id IS NOT NULL
  ),
  anc AS (
    SELECT id FROM req_units
    UNION
    SELECT ou.parent_id
    FROM public.organizational_units ou
    JOIN anc ON ou.id = anc.id
    WHERE ou.parent_id IS NOT NULL
  ),
  unit_managers AS (
    SELECT DISTINCT hep.employee_id
    FROM req
    CROSS JOIN anc
    JOIN public.positions hp ON hp.unit_id = anc.id AND hp.is_unit_head AND hp.is_active
    JOIN public.employee_positions hep ON hep.position_id = hp.id AND hep.end_date IS NULL
    WHERE req.unit_manager_visible AND NOT req.content_restricted AND req.status <> 'DRAFT'
    UNION
    SELECT vep.employee_id
    FROM req
    CROSS JOIN req_units
    JOIN public.positions vp ON vp.unit_id = req_units.id AND vp.is_active
    JOIN public.employee_positions vep ON vep.position_id = vp.id AND vep.end_date IS NULL
    JOIN public.app_users au ON au.employee_id = vep.employee_id
    JOIN public.role_permissions rpv ON rpv.role = au.role AND rpv.permission = 'requests.view_unit'
    WHERE req.unit_manager_visible AND NOT req.content_restricted AND req.status <> 'DRAFT'
  )
  SELECT e.id AS employee_id
  FROM public.employees e
  CROSS JOIN req
  WHERE (p_employee_ids IS NULL OR e.id = ANY (p_employee_ids))
    AND NOT e.is_system
    AND (
      e.id = req.requester_employee_id
      OR EXISTS (
        SELECT 1 FROM public.app_users au
        JOIN public.role_permissions rp ON rp.role = au.role
        WHERE au.employee_id = e.id AND rp.permission = 'requests.view_all'
      )
      OR e.id IN (SELECT um.employee_id FROM unit_managers um)
      OR EXISTS (
        SELECT 1 FROM public.request_approvals ra
        WHERE ra.request_id = req.id
          AND (
            ra.approver_employee_id = e.id
            OR ra.acted_by_employee_id = e.id
            OR EXISTS (
              SELECT 1 FROM public.approval_delegations d
              WHERE d.status = 'ACTIVE'
                AND d.delegator_employee_id  = ra.approver_employee_id
                AND d.delegate_employee_id   = e.id
                AND d.workflow_definition_id = req.workflow_definition_id
                AND now() >= d.starts_at
                AND now() <  d.ends_at
            )
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.workflow_initiators wi
        JOIN public.employee_positions ep
          ON ep.employee_id = e.id
         AND ep.end_date IS NULL
        JOIN public.positions p ON p.id = ep.position_id
        WHERE wi.workflow_definition_id = req.workflow_definition_id
          AND (
            (wi.position_id IS NOT NULL AND wi.position_id = ep.position_id)
            OR (wi.unit_id IS NOT NULL AND wi.unit_id = p.unit_id)
          )
      )
      OR (
        NOT req.is_restricted
        AND EXISTS (
          SELECT 1 FROM public.request_mentions m
          WHERE m.request_id = req.id AND m.mentioned_employee_id = e.id
        )
      )
    );
$function$;

COMMIT;

-- =====================================================================
-- DEV  (ghrfpfapklbswydmyutb): 2026-11-25 uygulandı. Kullanıcı başına görünen talep
--   kümesi önce/sonra: Admin aynı; 8 kullanıcı yalnız ilgisiz talepleri kaybetti (kaybolan
--   taleplerde sahip / onaycı / anılan / bildirim alıcısı / kısıtlı süreç = 0), kazanılan 0.
--   Değişen tablolar yalnız requests, request_approvals, request_attachments,
--   request_mentions; detay tabloları, bildirimler, onay görünümleri aynı.
--   Anma testi: kısıtsız süreçte anılan talebi + onay zincirini görür, form içeriği/ek/PDF
--   yok; kısıtlıda anma görünürlük vermez. Uç e2e 10/10.
-- =====================================================================
-- PROD (iiagqsbiexyukupkffwb): 2026-11-25 uygulandı (kod deploy 471d0d4'ten SONRA).
--   79 kullanıcı: kazanılan satır 0; kişinin ilişkili olduğu (sahip / onaycı / işlem yapan /
--   anılan / bildirim alan aktif çalışan) talep görünmez olan 0. Kaldırılan satırlar:
--   requests 122.694, request_approvals 526.437, request_attachments 58.572 (kullanıcı başına
--   toplam). Bu 4 tablo + request_extra_approvers dışında görünürlük 79/79 birebir
--   (ek onaycı listesinin önceki hali yeniden kurularak doğrulandı). Admin + Süper Admin aynı.
--   Örnek sıradan kullanıcı: 1.672 → 2 talep. Advisor değişmedi.
