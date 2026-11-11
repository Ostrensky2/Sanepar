-- Teste PostgreSQL isolado da migration das amostras do ponto (fase 2 do padrão
-- de coleta):
--   20261111130000_field_diary_samples.sql
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

-- Aplicação dupla comprova idempotência.
\ir ../migrations/20261111130000_field_diary_samples.sql
\ir ../migrations/20261111130000_field_diary_samples.sql

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

-- 1. Acesso: nada para anon, RLS ligado, políticas por permissão.
select yvae_test.assert_true(
  not has_table_privilege('anon', 'public.field_diary_samples', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
  'anon não pode ter privilégio em field_diary_samples'
);
select yvae_test.assert_true(
  (select relrowsecurity from pg_class where oid = 'public.field_diary_samples'::regclass),
  'RLS ligado em field_diary_samples'
);
select yvae_test.assert_true(
  (select count(*) = 4 from pg_policies where schemaname = 'public' and tablename = 'field_diary_samples'
     and roles = '{authenticated}'),
  'quatro políticas, todas só para authenticated'
);
select yvae_test.assert_true(
  not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'field_diary_samples'
      and (btrim(coalesce(qual, '')) = 'true' or btrim(coalesce(with_check, '')) = 'true')
  ),
  'nenhuma política aberta'
);
select yvae_test.assert_true(
  has_table_privilege('service_role', 'public.field_diary_samples', 'SELECT, INSERT, UPDATE, DELETE'),
  'o servidor (service_role) lê e grava'
);

-- 2. Uma amostra válida entra.
insert into public.field_diary_samples
  (id, entry_id, sample_code, project_code, sample_type, sequence, depth_m, quantity, quantity_unit, conservation)
values
  ('00000000-0000-4000-8000-000000000001', 'registro-1', 'YVA-071126-0136-AG1', 'YVA', 'water', 1, 0, 1000, 'mL', 'FILTRO_CONGELADO'),
  ('00000000-0000-4000-8000-000000000002', 'registro-1', 'YVA-071126-0136-PL1', 'YVA', 'plankton', 1, null, null, 'mL', 'OUTRO'),
  ('00000000-0000-4000-8000-000000000003', 'registro-1', 'YVA-071126-P01-TE12', 'YVA', 'tissue', 12, null, 2.5, 'g', 'AMOSTRA_BRUTA_CONGELADA');

select yvae_test.assert_true(
  (select depth_m = 0 and quantity = 1000 and created_at is not null and updated_at is not null
     from public.field_diary_samples where sample_code = 'YVA-071126-0136-AG1'),
  'amostra válida gravada com profundidade 0 (superfície)'
);

-- 3. O banco recusa o que foge do padrão.
select yvae_test.assert_rejected(
  $sql$insert into public.field_diary_samples (entry_id, sample_code, project_code, sample_type, sequence, quantity_unit, conservation)
       values ('registro-2', 'YVA-071126-0136-AG1', 'YVA', 'water', 1, 'mL', 'OUTRO')$sql$,
  'código repetido em outro registro'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_diary_samples (entry_id, sample_code, project_code, sample_type, sequence, quantity_unit, conservation)
       values ('registro-1', 'YVA-07112026-0136-GA-AG1', 'YVA', 'water', 1, 'mL', 'OUTRO')$sql$,
  'código no formato antigo (com laboratório e ano de 4 dígitos)'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_diary_samples (entry_id, sample_code, project_code, sample_type, sequence, quantity_unit, conservation)
       values ('registro-1', 'yva-071126-0136-ag2', 'YVA', 'water', 2, 'mL', 'OUTRO')$sql$,
  'código em minúsculas'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_diary_samples (entry_id, sample_code, project_code, sample_type, sequence, quantity_unit, conservation)
       values ('registro-1', 'ABC-071126-0136-AG2', 'YVA', 'water', 2, 'mL', 'OUTRO')$sql$,
  'código de outro projeto'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_diary_samples (entry_id, sample_code, project_code, sample_type, sequence, quantity_unit, conservation)
       values ('registro-1', 'YVA-071126-0136-AG2', 'YVA', 'zooplankton', 2, 'mL', 'OUTRO')$sql$,
  'tipo de amostra fora da lista'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_diary_samples (entry_id, sample_code, project_code, sample_type, sequence, quantity_unit, conservation)
       values ('registro-1', 'YVA-071126-0136-AG2', 'YVA', 'water', 0, 'mL', 'OUTRO')$sql$,
  'sequência zero'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_diary_samples (entry_id, sample_code, project_code, sample_type, sequence, depth_m, quantity_unit, conservation)
       values ('registro-1', 'YVA-071126-0136-AG2', 'YVA', 'water', 2, -1, 'mL', 'OUTRO')$sql$,
  'profundidade negativa'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_diary_samples (entry_id, sample_code, project_code, sample_type, sequence, quantity, quantity_unit, conservation)
       values ('registro-1', 'YVA-071126-0136-AG2', 'YVA', 'water', 2, -5, 'mL', 'OUTRO')$sql$,
  'quantidade negativa'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_diary_samples (entry_id, sample_code, project_code, sample_type, sequence, quantity_unit, conservation)
       values ('registro-1', 'YVA-071126-0136-AG2', 'YVA', 'water', 2, 'mL', 'GELADEIRA')$sql$,
  'conservação fora da lista'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_diary_samples (entry_id, sample_code, project_code, sample_type, sequence, quantity_unit, conservation)
       values ('registro-inexistente', 'YVA-071126-0136-AG2', 'YVA', 'water', 2, 'mL', 'OUTRO')$sql$,
  'amostra de registro que não existe'
);
select yvae_test.assert_rejected(
  $sql$delete from public.field_diary_entries where id = 'registro-1'$sql$,
  'apagar registro de campo que tem amostras'
);

-- 4. Quem fez login só enxerga e grava com a permissão certa (RLS).
set role authenticated;

select set_config('test.permissions', '', false);
select yvae_test.assert_true(
  (select count(*) = 0 from public.field_diary_samples),
  'sem data.view não lê amostra nenhuma'
);
select yvae_test.assert_rejected(
  $sql$insert into public.field_diary_samples (entry_id, sample_code, project_code, sample_type, sequence, quantity_unit, conservation)
       values ('registro-1', 'YVA-071126-0136-AG2', 'YVA', 'water', 2, 'mL', 'OUTRO')$sql$,
  'sem data.import não grava amostra'
);

select set_config('test.permissions', 'data.view data.import', false);
select yvae_test.assert_true(
  (select count(*) = 3 from public.field_diary_samples),
  'com data.view lê as amostras'
);
insert into public.field_diary_samples (entry_id, sample_code, project_code, sample_type, sequence, quantity_unit, conservation)
values ('registro-1', 'YVA-071126-0136-AG2', 'YVA', 'water', 2, 'mL', 'OUTRO');
delete from public.field_diary_samples where sample_code = 'YVA-071126-0136-AG2';

reset role;
select yvae_test.assert_true(
  (select count(*) = 3 from public.field_diary_samples),
  'com data.import grava e tira amostra do registro'
);

-- 5. Quem não fez login (anon) não lê nem grava.
set role anon;
select yvae_test.assert_rejected(
  $sql$select count(*) from public.field_diary_samples$sql$,
  'anon lendo amostras'
);
reset role;

select 'field_diary_samples: ok' as resultado;
