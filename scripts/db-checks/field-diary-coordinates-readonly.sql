-- Prévia SOMENTE LEITURA da conversão de coordenadas do Diário de campo para número.
-- Rode no SQL Editor do Supabase ANTES de aplicar
-- 20261101120000_field_diary_coordinates_status_vocabulary.sql. Não grava nada.
-- Lista os registros cuja coordenada vai virar nulo (o texto original fica guardado
-- em field_diary_coordinate_migration_log quando a migration rodar).
-- Depois da migration, consulte o que foi guardado com:
--   select * from public.field_diary_coordinate_migration_log order by campaign_name, entry_date;
begin isolation level repeatable read read only;

with parsed as (
  select
    e.id, e.campaign_name, e.entry_date, e.sia, e.location_name, e.governance_status,
    e.latitude::text as latitude_original,
    e.longitude::text as longitude_original,
    regexp_replace(coalesce(e.latitude::text, ''), '\s', '', 'g') as lat_text,
    regexp_replace(coalesce(e.longitude::text, ''), '\s', '', 'g') as lon_text
  from public.field_diary_entries as e
), classified as (
  select *,
    case
      when lat_text = '' then 'vazio'
      when lat_text !~ '^[+-]?([0-9]+([.,][0-9]*)?|[.,][0-9]+)$' then 'latitude não é número'
      when abs(replace(lat_text, ',', '.')::numeric) > 90 then 'latitude fora de -90 a 90'
      else 'ok'
    end as lat_status,
    case
      when lon_text = '' then 'vazio'
      when lon_text !~ '^[+-]?([0-9]+([.,][0-9]*)?|[.,][0-9]+)$' then 'longitude não é número'
      when abs(replace(lon_text, ',', '.')::numeric) > 180 then 'longitude fora de -180 a 180'
      else 'ok'
    end as lon_status
  from parsed
)
select campaign_name as campanha, entry_date as data, sia, location_name as local,
       governance_status as governanca, latitude_original, longitude_original,
       concat_ws('; ',
         nullif(nullif(lat_status, 'ok'), 'vazio'),
         nullif(nullif(lon_status, 'ok'), 'vazio'),
         case when lat_status = 'ok' and lon_status = 'vazio' then 'longitude em branco (par incompleto)'
              when lat_status = 'vazio' and lon_status = 'ok' then 'latitude em branco (par incompleto)' end
       ) as motivo
from classified
where not ((lat_status = 'ok' and lon_status = 'ok') or (lat_status = 'vazio' and lon_status = 'vazio'))
order by campaign_name, entry_date, sia;

-- Resumo: quantos convertem, quantos ficam vazios e quantos viram nulo.
select
  count(*) as registros,
  count(*) filter (where nullif(btrim(latitude::text), '') is not null and nullif(btrim(longitude::text), '') is not null) as com_par_preenchido
from public.field_diary_entries;

commit;
