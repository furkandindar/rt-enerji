-- =============================================================================
-- YALNIZ DEV — organizational_units.code değerlerini prod ile hizalar
-- =============================================================================
-- Neden: SharePoint arşiv eşlemesi (lib/sharepoint/folder-mapper.ts →
-- UNIT_ARCHIVE_BASES) prod birim kodlarıyla kuruldu. Dev'deki kodlar eski
-- org modelinden kalma (F, M, IKDEP, IDRDEP, …) — hizalanmazsa dev e2e
-- testinde Finans/İK/İdari İşler talepleri "Diğer" klasörüne düşer ve test
-- yanıltır. Uygulama kodunda birim koduna bağlı başka mantık yok (grep ile
-- doğrulandı, 2026-09-15), rename güvenli.
--
-- PROD'DA ÇALIŞTIRMA — prod kodları zaten doğru.
-- =============================================================================

begin;

-- Hedef kodlar dev'de zaten varsa (çakışma) hiçbir şey yapma
do $$
begin
  if exists (
    select 1 from organizational_units
    where code in ('FD','MD','IKD','IIDEP','İŞL','MIB','MIIB','ISLB')
  ) then
    raise exception 'Hedef kodlardan biri zaten mevcut — script daha önce çalışmış olabilir.';
  end if;
end $$;

-- Yaprak birimler (arşiv eşlemesinde kullanılanlar)
update organizational_units set code = 'FD'    where code = 'F';       -- Finans Departmanı
update organizational_units set code = 'MD'    where code = 'M';       -- Muhasebe Departmanı
update organizational_units set code = 'IKD'   where code = 'IKDEP';   -- İnsan Kaynakları Departmanı
update organizational_units set code = 'IIDEP' where code = 'IDRDEP';  -- İdari İşler Departmanı
update organizational_units set code = 'İŞL'   where code = 'ISLDEP';  -- İşletme Departmanı (prod: Üretim)

-- Kapsayıcı birimler (arşivde eşlenmez; yalnız prod ile tutarlılık için)
update organizational_units set code = 'MIB'   where code = 'MIDEP';   -- Mali İşler
update organizational_units set code = 'MIIB'  where code = 'MIIDIR';  -- Mali ve İdari İşler
update organizational_units set code = 'ISLB'  where code = 'ISLDIR';  -- İşletme

commit;

-- Doğrulama: 8 satır yeni kodlarla dönmeli
select code, name from organizational_units
where code in ('FD','MD','IKD','IIDEP','İŞL','MIB','MIIB','ISLB')
order by code;
