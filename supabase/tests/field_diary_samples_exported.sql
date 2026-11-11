-- Teste PostgreSQL isolado da marca de exportação das amostras (fase 5 do padrão
-- de coleta):
--   20261111150000_field_diary_samples_exported.sql
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

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

create table public.field_diary_entries (
  id text primary key,
  campaign_name text not null,
  entry_date date not null,
  location_name text not null,
  sia text
);

create function public.has_current_permission(p_permission text) returns boolean
  language sql stable as $$ select coalesce(current_setting('test.permissions', true), '') like '%' || p_permission || '%' $$;
grant execute on function public.has_current_permission(text) to authenticated, service_role;

insert into public.field_diary_entries (id, campaign_name, entry_date, location_name, sia) values
  ('registro-1', '4ª Campanha', '2026-11-07', 'Rio A', 'SIA-0136');

\ir ../migrations/20261111130000_field_diary_samples.sql

-- Amostras gravadas antes da marca existir.
insert into public.field_diary_samples
  (id, entry_id, sample_code, project_code, sample_type, sequence, depth_m, quantity, quantity_unit, conservation)
values
  ('00000000-0000-4000-8000-000000000001', 'registro-1', 'YVA-071126-0136-AG1', 'YVA', 'water', 1, 0, 1000, 'mL', 'FILTRO_CONGELADO'),
  ('00000000-0000-4000-8000-000000000002', 'registro-1', 'YVA-071126-0136-AG2', 'YVA', 'water', 2, 0, 1000, 'mL', 'FILTRO_CONGELADO');

-- Aplicação dupla comprova idempotência.
\ir ../migrations/20261111150000_field_diary_samples_exported.sql
\ir ../migrations/20261111150000_field_diary_samples_exported.sql

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
    when check_violation or insufficient_privilege then
      return;
  end;
  raise exception 'ASSERT FAILED (aceitou o que devia recusar): %', p_message;
end
$function$;

-- 1. As amostras que já existiam continuam como estavam, sem marca.
select yvae_test.assert_true(
  (select count(*) = 2 and count(exported_at) = 0 from public.field_diary_samples),
  'amostras antigas ficam sem marca de exportação'
);
select yvae_test.assert_true(
  (select count(*) = 1 from pg_trigger
     where tgrelid = 'public.field_diary_samples'::regclass and tgname = 'field_diary_samples_keep_exported_code'),
  'a trava existe uma vez só, mesmo com a migration aplicada duas vezes'
);
select yvae_test.assert_true(
  not has_function_privilege('anon', 'public.field_diary_samples_keep_exported_code()', 'EXECUTE'),
  'anon não executa a função da trava'
);

-- 2. Antes de exportar, o código acompanha a correção do registro.
update public.field_diary_samples
   set sample_code = 'YVA-081126-0136-AG2'
 where id = '00000000-0000-4000-8000-000000000002';
select yvae_test.assert_true(
  (select sample_code = 'YVA-081126-0136-AG2' from public.field_diary_samples where id = '00000000-0000-4000-8000-000000000002'),
  'amostra não exportada pode trocar de código'
);

-- 3. Marcar como exportada.
update public.field_diary_samples
   set exported_at = '2026-11-09 10:00:00+00'
 where id = '00000000-0000-4000-8000-000000000001' and exported_at is null;
select yvae_test.assert_true(
  (select exported_at = '2026-11-09 10:00:00+00' from public.field_diary_samples where id = '00000000-0000-4000-8000-000000000001'),
  'amostra marcada como exportada'
);

-- 4. Depois de exportada, o que compõe o código não muda mais.
select yvae_test.assert_rejected(
  $sql$update public.field_diary_samples set sample_code = 'YVA-081126-0136-AG1' where id = '00000000-0000-4000-8000-000000000001'$sql$,
  'trocar o código de amostra exportada'
);
select yvae_test.assert_rejected(
  $sql$update public.field_diary_samples set sample_code = 'YVA-071126-0136-PL1', sample_type = 'plankton' where id = '00000000-0000-4000-8000-000000000001'$sql$,
  'trocar o tipo de amostra exportada'
);
select yvae_test.assert_rejected(
  $sql$update public.field_diary_samples set sample_code = 'YVA-071126-0136-AG3', sequence = 3 where id = '00000000-0000-4000-8000-000000000001'$sql$,
  'trocar o número de amostra exportada'
);
select yvae_test.assert_rejected(
  $sql$update public.field_diary_samples set exported_at = null, sample_code = 'YVA-081126-0136-AG1' where id = '00000000-0000-4000-8000-000000000001'$sql$,
  'tirar a marca e trocar o código na mesma gravação'
);

-- 5. Os outros dados da amostra exportada continuam podendo ser corrigidos, e
--    regravar a amostra com o mesmo código (como o app faz) é aceito.
update public.field_diary_samples
   set depth_m = 2.5, quantity = 500, packaging = 'Caixa térmica', box_position = 'B2', updated_at = now(),
       sample_code = 'YVA-071126-0136-AG1', sample_type = 'water', sequence = 1, project_code = 'YVA'
 where id = '00000000-0000-4000-8000-000000000001';
select yvae_test.assert_true(
  (select depth_m = 2.5 and quantity = 500 and packaging = 'Caixa térmica' and box_position = 'B2'
          and sample_code = 'YVA-071126-0136-AG1' and exported_at = '2026-11-09 10:00:00+00'
     from public.field_diary_samples where id = '00000000-0000-4000-8000-000000000001'),
  'amostra exportada aceita correção dos outros dados e mantém a marca'
);

-- 6. A marca é gravada pelo app com a permissão de gravar registro de campo.
set role authenticated;
select set_config('test.permissions', 'data.view', false);
update public.field_diary_samples set exported_at = now() where id = '00000000-0000-4000-8000-000000000002';
reset role;
select yvae_test.assert_true(
  (select exported_at is null from public.field_diary_samples where id = '00000000-0000-4000-8000-000000000002'),
  'sem data.import a marca não é gravada'
);

set role authenticated;
select set_config('test.permissions', 'data.view data.import', false);
update public.field_diary_samples set exported_at = now() where id = '00000000-0000-4000-8000-000000000002';
select yvae_test.assert_rejected(
  $sql$update public.field_diary_samples set sample_code = 'YVA-091126-0136-AG2' where id = '00000000-0000-4000-8000-000000000002'$sql$,
  'quem fez login também não troca o código de amostra exportada'
);
reset role;
select yvae_test.assert_true(
  (select exported_at is not null and sample_code = 'YVA-081126-0136-AG2'
     from public.field_diary_samples where id = '00000000-0000-4000-8000-000000000002'),
  'com data.import a marca é gravada e o código fica'
);

-- 7. Amostra exportada ainda pode ser retirada do registro (a retirada fica no histórico do app).
delete from public.field_diary_samples where id = '00000000-0000-4000-8000-000000000002';
select yvae_test.assert_true(
  (select count(*) = 1 from public.field_diary_samples),
  'amostra exportada pode ser retirada'
);

\echo 'field_diary_samples_exported: todos os testes passaram'
