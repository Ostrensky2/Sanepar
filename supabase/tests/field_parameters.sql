-- Teste PostgreSQL isolado da migration dos parâmetros de campo (fase 3 do padrão
-- de coleta):
--   20261111140000_field_parameters.sql
-- Executar num banco descartável a partir deste arquivo; não usa dados reais.
\set ON_ERROR_STOP on

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$roles$;

-- Privilégios padrão como no Supabase: tudo que nasce em public vale para anon.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

create table public.field_diary_entries (
  id text primary key,
  campaign_name text not null,
  entry_date date not null,
  location_name text not null,
  sia text
);

-- Base de permissões do app (foundation), simplificada: a permissão vem de uma
-- configuração da sessão, para o teste poder ligar e desligar.
create function public.has_current_permission(p_permission text) returns boolean
  language sql stable as $$ select coalesce(current_setting('test.permissions', true), '') like '%' || p_permission || '%' $$;
grant execute on function public.has_current_permission(text) to authenticated, service_role;

insert into public.field_diary_entries (id, campaign_name, entry_date, location_name, sia) values
  ('registro-1', '4ª Campanha', '2026-11-07', 'Rio A', 'SIA-0136'),
  ('registro-2', 'Ação pontual', '2026-11-07', 'Rio A', '136');

-- Aplicação dupla comprova idempotência (o catálogo não duplica).
\ir ../migrations/20261111140000_field_parameters.sql
update public.field_parameters set active = false where id = 'salinity';
\ir ../migrations/20261111140000_field_parameters.sql

-- Funções de conferência num schema próprio, para valerem também depois de "set role".
create schema yvae_test;
grant usage on schema yvae_test to anon, authenticated;

create or replace function yvae_test.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception 'ASSERT FAILED: %', p_message;
  end if;
end
$function$;

create or replace function yvae_test.assert_rejected(p_sql text, p_message text)
returns void
language plpgsql
as $function$
begin
  begin
    execute p_sql;
  exception
    when check_violation or unique_violation or foreign_key_violation or not_null_violation
      or insufficient_privilege then
      return;
  end;
  raise exception 'ASSERT FAILED (aceitou o que devia recusar): %', p_message;
end
$function$;

-- 1. Catálogo inicial: os oito do padrão, uma vez só, e a segunda aplicação não
--    desfaz o que a equipe mudou.
select yvae_test.assert_true(
  (select count(*) = 8 and bool_and(is_base) from public.field_parameters),
  'oito parâmetros do padrão no catálogo'
);
select yvae_test.assert_true(
  (select unit = 'µS/cm' and min_value = 0 and max_value = 100000 and uses_depth
          and applies_to = array['water', 'plankton'] and biolog_column is null
     from public.field_parameters where id = 'conductivity'),
  'condutividade é um parâmetro de verdade, em µS/cm'
);
select yvae_test.assert_true(
  (select not uses_depth from public.field_parameters where id = 'air_temperature'),
  'temperatura do ar não tem profundidade'
);
select yvae_test.assert_true(
  (select not active from public.field_parameters where id = 'salinity'),
  'reaplicar a migration não reativa um parâmetro desativado'
);

-- 2. Acesso: nada para anon, RLS ligado, políticas por permissão.
select yvae_test.assert_true(
  not has_table_privilege('anon', 'public.field_parameters', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
  and not has_table_privilege('anon', 'public.field_parameter_readings', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
  'anon não pode ter privilégio nas tabelas de parâmetros'
);
select yvae_test.assert_true(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.field_parameters'::regclass, 'public.field_parameter_readings'::regclass)),
  'RLS ligado nas duas tabelas'
);
select yvae_test.assert_true(
  (select count(*) = 3 from pg_policies where schemaname = 'public' and tablename = 'field_parameters'
     and roles = '{authenticated}')
  and (select count(*) = 4 from pg_policies where schemaname = 'public' and tablename = 'field_parameter_readings'
     and roles = '{authenticated}'),
  'três políticas no catálogo e quatro nas medições, todas só para authenticated'
);
select yvae_test.assert_true(
  not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename in ('field_parameters', 'field_parameter_readings')
      and (btrim(coalesce(qual, '')) = 'true' or btrim(coalesce(with_check, '')) = 'true')
  ),
  'nenhuma política aberta'
);
select yvae_test.assert_true(
  not has_table_privilege('authenticated', 'public.field_parameters', 'DELETE'),
  'quem fez login não apaga parâmetro do catálogo'
);
select yvae_test.assert_true(
  has_table_privilege('service_role', 'public.field_parameters', 'SELECT, INSERT, UPDATE, DELETE')
  and has_table_privilege('service_role', 'public.field_parameter_readings', 'SELECT, INSERT, UPDATE, DELETE'),
  'o servidor (service_role) lê e grava'
);

-- 3. Parâmetro novo criado pela equipe.
insert into public.field_parameters (id, label, unit, min_value, max_value, applies_to)
values ('clorofila_a', 'Clorofila a', 'µg/L', 0, 500, array['water', 'plankton']);

select yvae_test.assert_true(
  (select not is_base and active and uses_depth and sort_order = 1000
     from public.field_parameters where id = 'clorofila_a'),
  'parâmetro criado pela equipe entra ativo, depois dos do padrão'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_parameters (id, label, applies_to) values ('clorofila_2', 'CLOROFILA A', array['water'])$sql$,
  'dois parâmetros com o mesmo nome'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_parameters (id, label, applies_to) values ('Clorofila B', 'Clorofila b', array['water'])$sql$,
  'identificador com maiúscula e espaço'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_parameters (id, label, applies_to) values ('sem_nome', '   ', array['water'])$sql$,
  'parâmetro sem nome'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_parameters (id, label, min_value, max_value, applies_to) values ('faixa_ruim', 'Faixa ruim', 10, 5, array['water'])$sql$,
  'faixa com máximo menor que o mínimo'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_parameters (id, label, min_value, applies_to) values ('faixa_nan', 'Faixa NaN', 'NaN', array['water'])$sql$,
  'faixa que não é número'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_parameters (id, label, applies_to) values ('sem_tipo', 'Sem tipo', array[]::text[])$sql$,
  'parâmetro que não vale para nenhum tipo de amostra'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_parameters (id, label, applies_to) values ('tipo_ruim', 'Tipo ruim', array['zooplankton'])$sql$,
  'tipo de amostra fora da lista'
);

-- 4. Medições válidas entram: decimal, negativo, sem profundidade e em várias profundidades.
insert into public.field_parameter_readings
  (id, entry_id, parameter_id, value, unit, depth_m, measured_time, equipment)
values
  ('00000000-0000-4000-8000-000000000001', 'registro-1', 'conductivity', 120.5, 'µS/cm', 0, '09:30', 'Sonda multiparâmetro'),
  ('00000000-0000-4000-8000-000000000002', 'registro-1', 'conductivity', 131, 'µS/cm', 5, '09:34', 'Sonda multiparâmetro'),
  ('00000000-0000-4000-8000-000000000003', 'registro-1', 'air_temperature', -3.5, '°C', null, null, null),
  ('00000000-0000-4000-8000-000000000004', 'registro-1', 'clorofila_a', 12, 'µg/L', 0, '23:59', null),
  ('00000000-0000-4000-8000-000000000005', 'registro-2', 'conductivity', 99, 'µS/cm', 0, null, null);

select yvae_test.assert_true(
  (select value = 120.5 and depth_m = 0 and created_at is not null and updated_at is not null
     from public.field_parameter_readings where id = '00000000-0000-4000-8000-000000000001'),
  'medição gravada com valor decimal e profundidade 0 (superfície)'
);
select yvae_test.assert_true(
  (select count(*) = 2 from public.field_parameter_readings
    where entry_id = 'registro-1' and parameter_id = 'conductivity'),
  'o mesmo parâmetro em duas profundidades do mesmo registro'
);

-- 5. O banco recusa o que foge do padrão.
select yvae_test.assert_rejected(
  $sql$insert into public.field_parameter_readings (entry_id, parameter_id, value, depth_m) values ('registro-1', 'conductivity', 140, 0)$sql$,
  'segunda medição do mesmo parâmetro na mesma profundidade'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_parameter_readings (entry_id, parameter_id, value) values ('registro-1', 'air_temperature', 20)$sql$,
  'segunda medição de um parâmetro sem profundidade'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_parameter_readings (entry_id, parameter_id, value) values ('registro-1', 'ph', 'NaN')$sql$,
  'valor que não é número'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_parameter_readings (entry_id, parameter_id, value) values ('registro-1', 'ph', null)$sql$,
  'medição sem valor'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_parameter_readings (entry_id, parameter_id, value, depth_m) values ('registro-1', 'ph', 7, -1)$sql$,
  'profundidade negativa'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_parameter_readings (entry_id, parameter_id, value, measured_time) values ('registro-1', 'ph', 7, '9h30')$sql$,
  'hora fora do formato HH:MM'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_parameter_readings (entry_id, parameter_id, value, measured_time) values ('registro-1', 'ph', 7, '24:00')$sql$,
  'hora que não existe'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_parameter_readings (entry_id, parameter_id, value) values ('registro-1', 'parametro_inexistente', 7)$sql$,
  'medição de parâmetro que não está no catálogo'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_parameter_readings (entry_id, parameter_id, value) values ('registro-inexistente', 'ph', 7)$sql$,
  'medição de registro que não existe'
);
select yvae_test.assert_rejected(
  $sql$delete from public.field_diary_entries where id = 'registro-1'$sql$,
  'apagar registro de campo que tem medições'
);
select yvae_test.assert_rejected(
  $sql$delete from public.field_parameters where id = 'conductivity'$sql$,
  'apagar parâmetro que já tem medição'
);

-- 6. Quem fez login só enxerga e grava com a permissão certa (RLS).
set role authenticated;

select set_config('test.permissions', '', false);
select yvae_test.assert_true(
  (select count(*) = 0 from public.field_parameters)
  and (select count(*) = 0 from public.field_parameter_readings),
  'sem data.view não lê catálogo nem medições'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_parameters (id, label, applies_to) values ('nitrato', 'Nitrato', array['water'])$sql$,
  'sem data.import não cria parâmetro'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_parameter_readings (entry_id, parameter_id, value) values ('registro-2', 'ph', 7)$sql$,
  'sem data.import não grava medição'
);

select set_config('test.permissions', 'data.view data.import', false);
select yvae_test.assert_true(
  (select count(*) = 9 from public.field_parameters)
  and (select count(*) = 5 from public.field_parameter_readings),
  'com data.view lê catálogo e medições'
);
insert into public.field_parameters (id, label, unit, applies_to) values ('nitrato', 'Nitrato', 'mg/L', array['water']);
update public.field_parameters set active = false where id = 'nitrato';
insert into public.field_parameter_readings (entry_id, parameter_id, value) values ('registro-2', 'ph', 7.2);
delete from public.field_parameter_readings where entry_id = 'registro-2' and parameter_id = 'ph';
select yvae_test.assert_rejected(
  $sql$delete from public.field_parameters where id = 'nitrato'$sql$,
  'quem fez login apagando parâmetro do catálogo'
);

reset role;
select yvae_test.assert_true(
  (select not active from public.field_parameters where id = 'nitrato')
  and (select count(*) = 5 from public.field_parameter_readings),
  'com data.import cria e desativa parâmetro, grava e tira medição'
);

-- 7. Quem não fez login (anon) não lê nem grava.
set role anon;
select yvae_test.assert_rejected(
  $sql$select count(*) from public.field_parameters$sql$,
  'anon lendo o catálogo'
);
select yvae_test.assert_rejected(
  $sql$select count(*) from public.field_parameter_readings$sql$,
  'anon lendo medições'
);
reset role;

select 'field_parameters: ok' as resultado;
