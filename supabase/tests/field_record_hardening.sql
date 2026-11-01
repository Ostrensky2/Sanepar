-- Teste PostgreSQL isolado das migrations do registro de campo (versão 2.0.2):
--   20261101110000_close_anon_access.sql
--   20261101120000_field_diary_coordinates_status_vocabulary.sql
-- Executar num banco descartável a partir deste arquivo; não usa dados reais.
-- Simula o estado antigo: políticas "using (true)" para anon, bucket público,
-- coordenadas em texto e vocabulário antigo.
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

create schema if not exists auth;
create schema if not exists storage;
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

create table storage.buckets (id text primary key, name text, public boolean not null default false);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;

-- Privilégios padrão como no Supabase: tudo que nasce em public vale para anon.
grant usage on schema public, storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- Estado antigo de produção (resumo de scripts/local-cloud-schema.sql e das migrations abertas).
create table public.field_diary_entries (
  id text primary key,
  campaign_id text,
  campaign_name text not null,
  campaign_day integer not null,
  entry_date date not null,
  collection_time text,
  location_name text not null,
  sia text,
  samples_replicas_edna text,
  zooplankton_id text,
  latitude text,
  longitude text,
  municipality text not null default 'Curitiba',
  activities text[] not null default '{}',
  water_visual_conditions text[] not null default '{}',
  has_occurrence boolean not null default false,
  occurrence_type text,
  weather_conditions text,
  point_accessibility text,
  daily_summary text not null default '',
  status text not null default 'Rascunho',
  governance_status text not null default 'importado',
  updated_at timestamptz not null default now()
);
create table public.field_diary_change_log (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid,
  campaign_name text,
  field_name text not null,
  old_value text,
  new_value text,
  origin text not null,
  changed_by text,
  changed_at timestamptz not null default now()
);
create table public.point_actions (id text primary key, points jsonb not null default '[]');
create view public.diary_view as select id, campaign_name from public.field_diary_entries;
create function public.open_helper() returns integer language sql as 'select 1';

alter table public.field_diary_entries enable row level security;
alter table public.point_actions enable row level security;
create policy field_diary_entries_select_all on public.field_diary_entries for select to anon, authenticated using (true);
create policy field_diary_entries_insert_all on public.field_diary_entries for insert to anon, authenticated with check (true);
create policy point_actions_all on public.point_actions for all using (true) with check (true);
create policy yvae_storage_select_documents on storage.objects for select to anon, authenticated using (bucket_id in ('documents', 'photos'));
insert into storage.buckets (id, name, public) values ('photos', 'photos', true), ('documents', 'documents', false);

-- Base de permissões do app (foundation), simplificada.
create function public.has_current_permission(p_permission text) returns boolean
  language sql stable security definer as $$ select false $$;
create function public.is_current_auth_profile_active() returns boolean
  language sql stable security definer as $$ select false $$;
revoke all on function public.has_current_permission(text), public.is_current_auth_profile_active() from public, anon;
grant execute on function public.has_current_permission(text), public.is_current_auth_profile_active() to authenticated, service_role;

insert into public.field_diary_entries
  (id, campaign_id, campaign_name, campaign_day, entry_date, location_name, sia, latitude, longitude,
   activities, water_visual_conditions, has_occurrence, occurrence_type, weather_conditions,
   point_accessibility, zooplankton_id, collection_time, governance_status)
values
  ('11111111-1111-1111-1111-111111111111', 'campanha-1-verao-2026', '1ª Campanha', 1, '2026-02-01', 'Rio A', 'SIA-0001',
   '-25.4284', '-49.2733', '{"Coleta realizada","Vistoria visual"}', '{"Espuma","Resíduos"}', false, null,
   'Sol', 'Fácil', 'Z1', '08:00', 'consolidado'),
  ('22222222-2222-2222-2222-222222222222', 'campanha-2', '2ª Campanha', 1, '2026-06-01', 'Rio B', 'SIA-0002',
   ' -25,5 ', '-49,1', '{"Coleta realizada"}', '{"Aparentemente normal"}', true, 'Problema com equipamento',
   'Sol entre nuvens', 'Moderado', '', '', 'importado'),
  ('33333333-3333-3333-3333-333333333333', 'campanha-2', '2ª Campanha', 1, '2026-06-02', 'Rio C', 'SIA-0003',
   'abc', '-49.1', '{}', '{}', true, 'Ponto inacessível', 'Nublado / Neblina', 'Inacessível', '', '', 'importado'),
  ('44444444-4444-4444-4444-444444444444', 'campanha-2', '2ª Campanha', 2, '2026-06-03', 'Rio D', 'SIA-0004',
   '-25.1', '', '{"Coleta não realizada"}', '{}', true, 'Coleta não realizada', 'Garoando', 'Difícil', '', '', 'corrigido'),
  ('55555555-5555-5555-5555-555555555555', 'campanha-2', '2ª Campanha', 2, '2026-06-04', 'Rio E', 'SIA-0005',
   '-125.1', '-49.0', '{}', '{}', false, 'Outro', null, null, '', '', 'importado'),
  ('legado-6', 'campanha-2', '2ª Campanha', 3, '2026-06-05', 'Rio F', 'SIA-0006',
   null, null, '{"Medição em campo","Atividade livre"}', '{"Turbidez visual elevada"}', true, 'Outro',
   'Tempestade', 'Fácil', '', '', 'importado');

-- Aplicação dupla comprova idempotência.
\ir ../migrations/20261101110000_close_anon_access.sql
\ir ../migrations/20261101120000_field_diary_coordinates_status_vocabulary.sql
\ir ../migrations/20261101110000_close_anon_access.sql
\ir ../migrations/20261101120000_field_diary_coordinates_status_vocabulary.sql

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception 'ASSERT FAILED: %', p_message;
  end if;
end
$function$;

create or replace function pg_temp.assert_rejected(p_sql text, p_message text)
returns void
language plpgsql
as $function$
begin
  begin
    execute p_sql;
  exception when check_violation or insufficient_privilege then
    return;
  end;
  raise exception 'ASSERT FAILED (deveria recusar): %', p_message;
end
$function$;

-- 1. Nenhum acesso de anon.
select pg_temp.assert_true(
  not exists (
    select 1 from pg_policies
    where schemaname in ('public', 'storage')
      and ('anon' = any(roles) or 'public' = any(roles) or qual = 'true' or with_check = 'true')
  ),
  'nenhuma política aberta para anon/PUBLIC'
);
select pg_temp.assert_true(not has_table_privilege('anon', 'public.field_diary_entries', 'SELECT'), 'anon não lê o diário');
select pg_temp.assert_true(not has_table_privilege('anon', 'public.field_diary_entries', 'INSERT'), 'anon não grava no diário');
select pg_temp.assert_true(not has_table_privilege('anon', 'public.diary_view', 'SELECT'), 'anon não lê views');
select pg_temp.assert_true(not has_table_privilege('anon', 'public.field_diary_coordinate_migration_log', 'SELECT'), 'anon não lê a guarda de coordenadas');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.open_helper()', 'EXECUTE'), 'anon não executa funções');
select pg_temp.assert_true(has_function_privilege('authenticated', 'public.has_current_permission(text)', 'EXECUTE'), 'login mantém a checagem de permissão');
select pg_temp.assert_true(not exists (select 1 from storage.buckets where public), 'nenhum bucket público');
select pg_temp.assert_true(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'field_diary_entries' and roles = '{authenticated}') = 4,
  'diário com as quatro políticas por papel'
);
create table public.created_after (x int);
select pg_temp.assert_true(not has_table_privilege('anon', 'public.created_after', 'SELECT'), 'tabela nova nasce sem anon');
drop table public.created_after;

-- Default global de PUBLIC também deve ser removido para funções novas.
-- Só revogar o default IN SCHEMA public não passaria por este teste.
create function public.created_after_function() returns integer language sql as 'select 1';
select pg_temp.assert_true(not has_function_privilege('anon', 'public.created_after_function()', 'EXECUTE'), 'anon não executa função criada depois da migration');
select pg_temp.assert_true(has_function_privilege('authenticated', 'public.created_after_function()', 'EXECUTE'), 'authenticated mantém grant explícito para função nova');
select pg_temp.assert_true(has_function_privilege('service_role', 'public.created_after_function()', 'EXECUTE'), 'service_role mantém grant explícito para função nova');
drop function public.created_after_function();

create sequence public.created_after_sequence;
select pg_temp.assert_true(not has_sequence_privilege('anon', 'public.created_after_sequence', 'USAGE, SELECT, UPDATE'), 'sequência nova nasce sem anon');
select pg_temp.assert_true(has_sequence_privilege('authenticated', 'public.created_after_sequence', 'USAGE'), 'authenticated mantém grant explícito para sequência nova');
select pg_temp.assert_true(has_sequence_privilege('service_role', 'public.created_after_sequence', 'USAGE'), 'service_role mantém grant explícito para sequência nova');
drop sequence public.created_after_sequence;

-- 2. Coordenadas convertidas para número; o que não converteu vira nulo e fica guardado.
select pg_temp.assert_true(
  (select data_type from information_schema.columns
   where table_schema = 'public' and table_name = 'field_diary_entries' and column_name = 'latitude') = 'numeric',
  'latitude numérica'
);
select pg_temp.assert_true(
  (select latitude = -25.428400 and longitude = -49.273300 from public.field_diary_entries where id like '1111%'),
  'ponto decimal convertido'
);
select pg_temp.assert_true(
  (select latitude = -25.5 and longitude = -49.1 from public.field_diary_entries where id like '2222%'),
  'vírgula e espaços convertidos'
);
select pg_temp.assert_true(
  (select latitude is null and longitude is null from public.field_diary_entries where id like '3333%'),
  'texto inválido vira nulo'
);
select pg_temp.assert_true(
  (select count(*) from public.field_diary_coordinate_migration_log) = 3,
  'três casos guardados (texto inválido, par incompleto, fora da faixa)'
);
select pg_temp.assert_true(
  exists (select 1 from public.field_diary_coordinate_migration_log
          where entry_id like '4444%' and latitude_original = '-25.1' and reason like '%par incompleto%'),
  'par incompleto guardado com o texto original'
);

-- 3. O banco recusa coordenada inválida, par incompleto e realocado sem motivo.
select pg_temp.assert_rejected(
  $$update public.field_diary_entries set latitude = 91 where id like '1111%'$$, 'latitude acima de 90');
select pg_temp.assert_rejected(
  $$update public.field_diary_entries set longitude = -181 where id like '1111%'$$, 'longitude abaixo de -180');
select pg_temp.assert_rejected(
  $$update public.field_diary_entries set longitude = null where id like '1111%'$$, 'par incompleto');
select pg_temp.assert_rejected(
  $$update public.field_diary_entries set execution_status = 'relocated' where id like '2222%'$$, 'realocado sem motivo');
select pg_temp.assert_rejected(
  $$update public.field_diary_entries set execution_status = 'relocated', relocation_reason = '   ' where id like '2222%'$$,
  'realocado com motivo em branco');
select pg_temp.assert_rejected(
  $$update public.field_diary_entries set execution_status = 'relocated', relocation_reason = repeat('x', 501) where id like '2222%'$$,
  'realocado com motivo acima de 500 caracteres');
select pg_temp.assert_rejected(
  $$update public.field_diary_entries set execution_status = 'movido' where id like '2222%'$$, 'situação fora da lista');
update public.field_diary_entries set execution_status = 'relocated', relocation_reason = repeat('x', 500) where id like '2222%';
select pg_temp.assert_true(
  (select char_length(relocation_reason) = 500 from public.field_diary_entries where id like '2222%'),
  'realocado aceita motivo no limite de 500 caracteres');
update public.field_diary_entries set execution_status = 'relocated', relocation_reason = 'Ponte caída' where id like '2222%';

-- 4. Situação deduzida dos registros antigos.
select pg_temp.assert_true(
  (select string_agg(execution_status, ',' order by id) from public.field_diary_entries)
    = 'realized,relocated,blocked,not_realized,planned,realized',
  'situação deduzida: realizado, (realocado pelo teste), bloqueado, não realizado, planejado, realizado'
);

-- 5. Vocabulário: termos antigos trocados, termo desconhecido mantido, histórico gravado.
select pg_temp.assert_true(
  (select activities = '{"Coleta de eDNA","Coleta de zooplâncton","Reconhecimento do ponto"}'
      and water_visual_conditions = '{"Presença de espuma",Resíduos}'
      and weather_conditions = 'Céu limpo' and point_accessibility = 'Acesso normal'
      and governance_status = 'consolidado'
   from public.field_diary_entries where id like '1111%'),
  'equivalência aplicada sem mexer na governança'
);
select pg_temp.assert_true(
  (select activities = '{"Medição de parâmetros","Atividade livre"}' and occurrence_type = 'Outra'
      and weather_conditions = 'Tempestade'
   from public.field_diary_entries where id = 'legado-6'),
  'termo sem equivalente é mantido'
);
select pg_temp.assert_true(
  (select weather_conditions = 'Neblina' and point_accessibility = 'Acesso bloqueado'
   from public.field_diary_entries where id like '3333%'),
  'clima e acessibilidade traduzidos'
);
select pg_temp.assert_true(
  (select count(*) from public.field_diary_change_log where origin = 'migração 2.0.2') = 23,
  'histórico da migração gravado uma única vez (aplicação dupla)'
);

\echo 'field_record_hardening: OK'
