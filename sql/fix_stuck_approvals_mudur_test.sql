-- ============================================================================
-- FIX: "Müdür Test" (INACTIVE test hesabı) üzerinde takılı bekleyen onaylar
-- Tarih: 2026-07-22 | Ortam: SADECE PROD (dev'de test hesabı bilinçli olarak var)
--
-- Problem:
--   İdari İşler Departmanı'nın unit-head pozisyonu (İdari İşler Şefi) boş.
--   UNIT_HEAD escalation bir üst birime çıkıyor: İdari İşler > İdari İşler
--   Müdürü pozisyonunda ise sadece go-live öncesi açılmış "Müdür Test"
--   (deneme.mudur@rtenerji.com, INACTIVE) oturuyor. Sonuç: go-live'dan beri
--   İdari İşler ekibinin (Gözde Yiğit, Samet Battal, Gökşin Uzun) HİÇBİR
--   talebinin amir adımı onaylanamadı.
--
-- Etkilenen aktif talepler (10 adet, PENDING):
--   2026-000043, -000071, -000102, -000114, -000144, -000263 (Görev Formu, Samet Battal)
--   2026-000268 (Kısa İzin, Gözde Yiğit), 2026-000289 (Görev Formu, Gözde Yiğit)
--   2026-000290 (Kısa İzin, Gökşin Uzun), 2026-000296 (Talep Formu, Samet Battal)
--   Dokunulmayanlar: 2026-000032 (CANCELLED), 2026-000033 (DRAFT — yeniden
--   submit edilince ADIM 2 sonrası doğru kişiye route olur).
-- ============================================================================

-- ============================================================================
-- ADIM 1 — Bekleyen onayları gerçek bir onaycıya taşı (DATA FIX)
-- v_new_approver: varsayılan Bekir Korkmaz (Genel Müdür). İdari İşler'in
-- gerçek amiri başka biriyse ID'yi DEĞİŞTİR (bkz. dosya sonundaki sorgu).
-- Not: 2026-000289'da Bekir Korkmaz zaten 4. adımda (Genel Koordinatör);
-- bu durumda 2. ve 4. adımı ayrı ayrı onaylaması gerekir — bilinen ve kabul
-- edilen davranış.
-- ============================================================================
DO $$
DECLARE
  v_mudur_test   uuid := '50e8788c-b524-4f44-8d77-36d0d9f51a34'; -- Müdür Test
  v_new_approver uuid := '5fadc202-2920-4c04-8564-a989e15ed019'; -- Bekir Korkmaz (Genel Müdür) — GEREKİRSE DEĞİŞTİR
  v_count        int;
BEGIN
  UPDATE request_approvals ra
  SET approver_employee_id = v_new_approver
  FROM requests r
  WHERE r.id = ra.request_id
    AND ra.approver_employee_id = v_mudur_test
    AND ra.status = 'PENDING'
    AND r.status  = 'PENDING'                          -- CANCELLED / DRAFT dokunma
    AND ra.revision_cycle = r.current_revision_cycle;  -- eski revizyon satırları tarihçe olarak kalsın

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Yeniden atanan onay satırı: % (beklenen: 10)', v_count;
END $$;

-- ============================================================================
-- ADIM 2 — Kök neden: Müdür Test'i unit-head pozisyonundan çıkar
-- Employee kaydı (INACTIVE) ve app_user (ORG_VIEWER) kalabilir; sorun yaratan
-- şey pozisyon ataması. Bu satır silinince İdari İşler Müdürü pozisyonu
-- boşalır ve yeni taleplerde escalation Genel Müdürlük'e (Bekir Korkmaz)
-- kadar çıkar — mevcut motor davranışıyla tutarlı.
-- ============================================================================
DELETE FROM employee_positions
WHERE employee_id = '50e8788c-b524-4f44-8d77-36d0d9f51a34';

-- ============================================================================
-- ADIM 2b (OPSİYONEL) — Gerçek İdari İşler amiri varsa pozisyona ata.
-- Bu, yeni taleplerin GM yerine doğru amire route olmasını sağlar.
-- Çalıştırmadan önce <GERCEK_MUDUR_EMPLOYEE_ID> doldur ve yorumu kaldır.
-- ============================================================================
-- INSERT INTO employee_positions (employee_id, position_id, start_date)
-- SELECT '<GERCEK_MUDUR_EMPLOYEE_ID>'::uuid, p.id, CURRENT_DATE
-- FROM positions p
-- JOIN organizational_units ou ON ou.id = p.unit_id
-- WHERE p.title = 'İdari İşler Müdürü' AND ou.name = 'İdari İşler';

-- ============================================================================
-- DOĞRULAMA — fix sonrası çalıştır
-- ============================================================================
-- 1) Müdür Test üzerinde aktif talepte bekleyen onay kalmamalı (0 satır).
--    Cycle filtresi önemli: 2026-000296'nın eski revizyon satırları (cycle 0-1)
--    bilerek taşınmadı — tarihçe. Bekleyenler view'ı da sadece güncel cycle'ı
--    gösterdiği için (feature_approvals_pagination_views) kimseye görünmezler.
SELECT r.request_no, ra.status
FROM request_approvals ra
JOIN requests r ON r.id = ra.request_id
WHERE ra.approver_employee_id = '50e8788c-b524-4f44-8d77-36d0d9f51a34'
  AND ra.status = 'PENDING' AND r.status = 'PENDING'
  AND ra.revision_cycle = r.current_revision_cycle;

-- 2) Müdür Test'in pozisyon ataması kalmamalı (0 satır):
SELECT * FROM employee_positions
WHERE employee_id = '50e8788c-b524-4f44-8d77-36d0d9f51a34';

-- 3) Taşınan 10 talep yeni onaycıda görünmeli (tam 10 satır dönmeli).
--    Yeni onaycıyı ADIM 1'de değiştirdiysen buradaki ID'yi de değiştir.
SELECT r.request_no, wd.name AS workflow, (e.first_name || ' ' || e.last_name) AS requester
FROM request_approvals ra
JOIN requests r ON r.id = ra.request_id
JOIN workflow_definitions wd ON wd.id = r.workflow_definition_id
LEFT JOIN employees e ON e.id = r.requester_employee_id
WHERE ra.approver_employee_id = '5fadc202-2920-4c04-8564-a989e15ed019'
  AND ra.status = 'PENDING' AND r.status = 'PENDING'
  AND ra.revision_cycle = r.current_revision_cycle
  AND r.request_no IN ('2026-000043','2026-000071','2026-000102','2026-000114',
                       '2026-000144','2026-000263','2026-000268','2026-000289',
                       '2026-000290','2026-000296')
ORDER BY r.created_at;

-- (Yardımcı) Yeni onaycı adayı seçmek için aktif çalışan listesi:
-- SELECT e.id, e.first_name, e.last_name, p.title
-- FROM employees e
-- JOIN employee_positions ep ON ep.employee_id = e.id
-- JOIN positions p ON p.id = ep.position_id
-- WHERE e.status = 'ACTIVE' ORDER BY e.last_name;
