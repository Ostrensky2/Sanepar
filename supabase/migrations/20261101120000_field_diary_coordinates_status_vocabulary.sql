-- Registro de campo: coordenada em número conferida pelo banco, situação do ponto
-- com motivo obrigatório para "realocado" e vocabulário comum com o IAGen.
--
-- Referência: IAGen, migration 20260810140000_iagen_campaigns_v1.sql (bloco
-- sampling_points: faixas de latitude/longitude, par lat/lon, execution_status e
-- relocation_reason).
--
-- Nada é apagado:
--   * coordenada que não converte vira nulo e o texto original fica guardado em
--     public.field_diary_coordinate_migration_log, com o motivo;
--   * troca de termo do vocabulário e coordenada anulada entram no histórico
--     public.field_diary_change_log (origem "migração 2.0.2");
--   * governance_status, collection_order e a regra "um ponto + uma data = um
--     registro" não são tocados.
--
-- Prévia somente leitura (rodar antes): scripts/db-checks/field-diary-coordinates-readonly.sql
-- Tabela de equivalência do vocabulário: docs/registro-de-campo-2.0.2.md e
-- src/lib/field-diary-vocabulary.ts (o teste confere que as duas listas batem).

begin;
set local lock_timeout = '5s';
set local statement_timeout = '300s';

-- A alteração de tipo já exige este lock. Obtê-lo antes dos planos impede que
-- uma gravação concorrente deixe a conversão ou o histórico desatualizados.
lock table public.field_diary_entries in access exclusive mode;

-- Funções de apoio só desta transação.
create or replace function pg_temp.norm(p_value text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    translate(lower(btrim(coalesce(p_value, ''))), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
    '\s+', ' ', 'g'
  );
$$;

-- Devolve o número (6 casas) ou null; p_status diz se veio vazio, válido ou inválido.
create or replace function pg_temp.parse_coordinate(p_value text, p_limit numeric, out p_number numeric, out p_status text)
language plpgsql
immutable
as $$
declare
  v_text text := regexp_replace(coalesce(p_value, ''), '\s', '', 'g');
  v_number numeric;
begin
  if v_text = '' then
    p_status := 'empty';
    return;
  end if;

  if v_text !~ '^[+-]?([0-9]+([.,][0-9]*)?|[.,][0-9]+)$' then
    p_status := 'not_a_number';
    return;
  end if;

  v_number := replace(v_text, ',', '.')::numeric;

  if abs(v_number) > p_limit then
    p_status := 'out_of_range';
    return;
  end if;

  p_number := round(v_number, 6);
  p_status := 'valid';
end;
$$;

-- 1. Guarda dos casos que não converteram (consulta pelo relatório; só servidor e
--    quem vê os dados de campo leem).
create table if not exists public.field_diary_coordinate_migration_log (
  id bigint generated always as identity primary key,
  entry_id text not null,
  campaign_name text,
  entry_date date,
  sia text,
  location_name text,
  governance_status text,
  latitude_original text,
  longitude_original text,
  reason text not null,
  migrated_at timestamptz not null default now()
);

alter table public.field_diary_coordinate_migration_log enable row level security;
revoke all on table public.field_diary_coordinate_migration_log from public, anon, authenticated;

do $log_policy$
begin
  if to_regprocedure('public.has_current_permission(text)') is not null then
    grant select on table public.field_diary_coordinate_migration_log to authenticated;
    drop policy if exists yvae_field_diary_coordinate_log_select on public.field_diary_coordinate_migration_log;
    create policy yvae_field_diary_coordinate_log_select on public.field_diary_coordinate_migration_log
      for select to authenticated using (public.has_current_permission('data.view'));
  end if;
end
$log_policy$;

-- 2. Coordenadas: classifica cada registro (só se a coluna ainda for texto).
do $coordinates$
declare
  v_type text;
begin
  select data_type into v_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'field_diary_entries' and column_name = 'latitude';

  if v_type is null or v_type = 'numeric' then
    raise notice 'field_diary_entries.latitude já é numérica (ou não existe); conversão pulada.';
    return;
  end if;

  create temporary table coordinate_plan on commit drop as
  select
    e.id,
    e.campaign_name,
    e.entry_date,
    e.sia,
    e.location_name,
    e.governance_status,
    e.latitude as latitude_original,
    e.longitude as longitude_original,
    lat.p_number as latitude_number,
    lat.p_status as latitude_status,
    lon.p_number as longitude_number,
    lon.p_status as longitude_status
  from public.field_diary_entries as e
  cross join lateral pg_temp.parse_coordinate(e.latitude::text, 90) as lat
  cross join lateral pg_temp.parse_coordinate(e.longitude::text, 180) as lon;

  insert into public.field_diary_coordinate_migration_log (
    entry_id, campaign_name, entry_date, sia, location_name, governance_status,
    latitude_original, longitude_original, reason
  )
  select
    id, campaign_name, entry_date, sia, location_name, governance_status,
    latitude_original, longitude_original,
    concat_ws('; ',
      case latitude_status
        when 'not_a_number' then 'latitude não é número'
        when 'out_of_range' then 'latitude fora de -90 a 90'
      end,
      case longitude_status
        when 'not_a_number' then 'longitude não é número'
        when 'out_of_range' then 'longitude fora de -180 a 180'
      end,
      case
        when latitude_status = 'valid' and longitude_status = 'empty' then 'longitude em branco (par incompleto)'
        when latitude_status = 'empty' and longitude_status = 'valid' then 'latitude em branco (par incompleto)'
      end
    )
  from coordinate_plan
  where not (
    (latitude_status = 'valid' and longitude_status = 'valid')
    or (latitude_status = 'empty' and longitude_status = 'empty')
  );

  -- Histórico por campo (regra 9) para cada coordenada que vira nulo.
  insert into public.field_diary_change_log (entry_id, campaign_name, field_name, old_value, new_value, origin, changed_by)
  select
    case when plan.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then plan.id::uuid end,
    plan.campaign_name,
    field.name,
    field.old_value,
    '',
    'migração 2.0.2',
    'Coordenada não convertida para número; texto original em field_diary_coordinate_migration_log'
  from coordinate_plan as plan
  cross join lateral (values ('latitude', plan.latitude_original), ('longitude', plan.longitude_original)) as field(name, old_value)
  where not (
      (plan.latitude_status = 'valid' and plan.longitude_status = 'valid')
      or (plan.latitude_status = 'empty' and plan.longitude_status = 'empty')
    )
    and btrim(coalesce(field.old_value, '')) <> '';

  -- Par que não fecha vira nulo (o texto original já está guardado acima)...
  update public.field_diary_entries as e
  set latitude = null,
      longitude = null
  from coordinate_plan as plan
  where plan.id = e.id
    and not (
      (plan.latitude_status = 'valid' and plan.longitude_status = 'valid')
      or (plan.latitude_status = 'empty' and plan.longitude_status = 'empty')
    );

  -- ...e o resto converte em número com 6 casas, mantendo a posição das colunas.
  alter table public.field_diary_entries
    alter column latitude type numeric(9,6)
      using (pg_temp.parse_coordinate(latitude::text, 90)).p_number,
    alter column longitude type numeric(9,6)
      using (pg_temp.parse_coordinate(longitude::text, 180)).p_number;
end
$coordinates$;

alter table public.field_diary_entries
  drop constraint if exists field_diary_entries_coordinates_pair_ck,
  drop constraint if exists field_diary_entries_latitude_ck,
  drop constraint if exists field_diary_entries_longitude_ck;

alter table public.field_diary_entries
  add constraint field_diary_entries_coordinates_pair_ck check (
    (latitude is null) = (longitude is null)
  ),
  add constraint field_diary_entries_latitude_ck check (
    latitude is null or latitude between -90 and 90
  ),
  add constraint field_diary_entries_longitude_ck check (
    longitude is null or longitude between -180 and 180
  );

comment on column public.field_diary_entries.latitude is
  'Latitude efetiva em graus decimais (numeric 9,6). Conferida: -90 a 90 e sempre em par com a longitude.';
comment on column public.field_diary_entries.longitude is
  'Longitude efetiva em graus decimais (numeric 9,6). Conferida: -180 a 180 e sempre em par com a latitude.';

-- 3. Situação do ponto (mesmos códigos do IAGen).
alter table public.field_diary_entries
  add column if not exists execution_status text,
  add column if not exists relocation_reason text;

-- Registros antigos: mesma inferência de src/lib/point-execution-status.ts
-- (inferPointExecutionStatus). "relocated" nunca é inferido: exige motivo.
update public.field_diary_entries as e
set execution_status = case
  when exists (select 1 from unnest(e.activities) as a(v) where pg_temp.norm(a.v) = 'coleta nao realizada')
    or (e.has_occurrence and pg_temp.norm(e.occurrence_type) = 'coleta nao realizada')
    then 'not_realized'
  when cardinality(e.activities) > 0
    or btrim(coalesce(e.collection_time, '')) <> ''
    or btrim(coalesce(e.samples_replicas_edna, '')) <> ''
    or btrim(coalesce(e.zooplankton_id, '')) <> ''
    then 'realized'
  when (e.has_occurrence and pg_temp.norm(e.occurrence_type) = 'ponto inacessivel')
    or pg_temp.norm(e.point_accessibility) in ('inacessivel', 'acesso bloqueado')
    then 'blocked'
  else 'planned'
end
where e.execution_status is null;

alter table public.field_diary_entries
  alter column execution_status set default 'planned',
  alter column execution_status set not null;

alter table public.field_diary_entries
  drop constraint if exists field_diary_entries_execution_status_ck,
  drop constraint if exists field_diary_entries_relocation_reason_ck;

alter table public.field_diary_entries
  add constraint field_diary_entries_execution_status_ck check (
    execution_status in ('planned', 'realized', 'not_realized', 'relocated', 'blocked')
  ),
  add constraint field_diary_entries_relocation_reason_ck check (
    execution_status <> 'relocated'
    or char_length(btrim(coalesce(relocation_reason, ''))) between 1 and 500
  );

comment on column public.field_diary_entries.execution_status is
  'Situação do ponto: planned, realized, not_realized, relocated, blocked (mesmos códigos do IAGen).';
comment on column public.field_diary_entries.relocation_reason is
  'Motivo da realocação; obrigatório e com até 500 caracteres após desconsiderar espaços nas extremidades, quando execution_status = relocated.';

-- 4. Vocabulário comum com o IAGen: termo antigo -> termo novo.
--    Mantida em sincronia com LEGACY_VOCABULARY_EQUIVALENCE (src/lib/field-diary-vocabulary.ts).
create temporary table vocabulary_equivalence (
  kind text not null,
  old_term text not null,
  new_term text not null
) on commit drop;

insert into vocabulary_equivalence (kind, old_term, new_term) values
  ('activities', 'Coleta realizada', 'Coleta de eDNA'),
  ('activities', 'Vistoria visual', 'Reconhecimento do ponto'),
  ('activities', 'Medição em campo', 'Medição de parâmetros'),
  ('waterVisualConditions', 'Aparentemente normal', 'Água clara'),
  ('waterVisualConditions', 'Turbidez visual elevada', 'Água turva'),
  ('waterVisualConditions', 'Espuma', 'Presença de espuma'),
  ('weatherConditions', 'Sol', 'Céu limpo'),
  ('weatherConditions', 'Sol entre nuvens', 'Parcialmente nublado'),
  ('weatherConditions', 'Nublado Pós Chuva', 'Nublado'),
  ('weatherConditions', 'Chuvoso', 'Chuva fraca'),
  ('weatherConditions', 'Garoando', 'Chuva fraca'),
  ('weatherConditions', 'Nublado / Neblina', 'Neblina'),
  ('pointAccessibility', 'Fácil', 'Acesso normal'),
  ('pointAccessibility', 'Moderado', 'Acesso moderado'),
  ('pointAccessibility', 'Difícil', 'Acesso difícil'),
  ('pointAccessibility', 'Inacessível', 'Acesso bloqueado'),
  ('occurrenceType', 'Problema de acesso ao ponto', 'Acesso impedido'),
  ('occurrenceType', 'Problema com equipamento', 'Falha de equipamento'),
  ('occurrenceType', 'Condição climática adversa', 'Condição climática'),
  ('occurrenceType', 'Outro', 'Outra');

create or replace function pg_temp.map_term(p_kind text, p_value text)
returns text
language sql
stable
as $$
  select coalesce(
    (select v.new_term from vocabulary_equivalence as v
      where v.kind = p_kind and pg_temp.norm(v.old_term) = pg_temp.norm(p_value)
      limit 1),
    p_value
  );
$$;

-- Lista traduzida, na ordem original e sem repetição. "Coleta realizada" com ID de
-- zooplâncton vira também "Coleta de zooplâncton".
create or replace function pg_temp.map_list(p_kind text, p_values text[], p_zooplankton_id text)
returns text[]
language plpgsql
stable
as $$
declare
  v_value text;
  v_term text;
  v_result text[] := '{}';
begin
  foreach v_value in array coalesce(p_values, '{}'::text[]) loop
    if btrim(coalesce(v_value, '')) = '' then
      continue;
    end if;

    v_term := pg_temp.map_term(p_kind, btrim(v_value));
    if not v_term = any(v_result) then
      v_result := v_result || v_term;
    end if;

    if p_kind = 'activities'
       and pg_temp.norm(v_value) = 'coleta realizada'
       and btrim(coalesce(p_zooplankton_id, '')) <> ''
       and not 'Coleta de zooplâncton' = any(v_result) then
      v_result := v_result || 'Coleta de zooplâncton'::text;
    end if;
  end loop;

  return v_result;
end;
$$;

create temporary table vocabulary_plan on commit drop as
select
  e.id,
  e.campaign_name,
  e.activities as activities_old,
  pg_temp.map_list('activities', e.activities, e.zooplankton_id) as activities_new,
  e.water_visual_conditions as water_old,
  pg_temp.map_list('waterVisualConditions', e.water_visual_conditions, null) as water_new,
  e.weather_conditions as weather_old,
  pg_temp.map_term('weatherConditions', e.weather_conditions) as weather_new,
  e.point_accessibility as accessibility_old,
  pg_temp.map_term('pointAccessibility', e.point_accessibility) as accessibility_new,
  e.occurrence_type as occurrence_old,
  pg_temp.map_term('occurrenceType', e.occurrence_type) as occurrence_new
from public.field_diary_entries as e;

insert into public.field_diary_change_log (entry_id, campaign_name, field_name, old_value, new_value, origin, changed_by)
select
  case when plan.id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then plan.id::uuid end,
  plan.campaign_name,
  change.field_name,
  change.old_value,
  change.new_value,
  'migração 2.0.2',
  'Vocabulário comum com o IAGen (tabela de equivalência)'
from vocabulary_plan as plan
cross join lateral (values
  ('activities', array_to_string(plan.activities_old, '; '), array_to_string(plan.activities_new, '; ')),
  ('waterVisualConditions', array_to_string(plan.water_old, '; '), array_to_string(plan.water_new, '; ')),
  ('weatherConditions', plan.weather_old, plan.weather_new),
  ('pointAccessibility', plan.accessibility_old, plan.accessibility_new),
  ('occurrenceType', plan.occurrence_old, plan.occurrence_new)
) as change(field_name, old_value, new_value)
where change.old_value is distinct from change.new_value;

update public.field_diary_entries as e
set activities = plan.activities_new,
    water_visual_conditions = plan.water_new,
    weather_conditions = plan.weather_new,
    point_accessibility = plan.accessibility_new,
    occurrence_type = plan.occurrence_new
from vocabulary_plan as plan
where plan.id = e.id
  and (
    plan.activities_old is distinct from plan.activities_new
    or plan.water_old is distinct from plan.water_new
    or plan.weather_old is distinct from plan.weather_new
    or plan.accessibility_old is distinct from plan.accessibility_new
    or plan.occurrence_old is distinct from plan.occurrence_new
  );

commit;
