-- Teste PostgreSQL 17 isolado da primitiva single-use de purpose.
-- Executar no banco descartável a partir deste arquivo; não usa dados reais.
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

-- Aplicação dupla comprova idempotência da migration.
\ir ../migrations/20260815100000_auth_purpose_single_use.sql
\ir ../migrations/20260815100000_auth_purpose_single_use.sql

create extension if not exists dblink;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception 'ASSERTION_FAILED: %', p_message;
  end if;
end
$function$;

select pg_temp.assert_true(
  public.consume_auth_purpose_once(repeat('a', 64), clock_timestamp() + interval '600 seconds'),
  'first valid call must consume the purpose'
);
select pg_temp.assert_true(
  not public.consume_auth_purpose_once(repeat('a', 64), clock_timestamp() + interval '600 seconds'),
  'replay must fail closed'
);
select pg_temp.assert_true(
  not public.consume_auth_purpose_once(repeat('b', 64), clock_timestamp() - interval '1 second'),
  'expired purpose must fail closed'
);

do $invalid$
begin
  begin
    perform public.consume_auth_purpose_once('not-a-canonical-hash', clock_timestamp() + interval '60 seconds');
    raise exception 'ASSERTION_FAILED: malformed hash was accepted';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.consume_auth_purpose_once(repeat('c', 64), clock_timestamp() + interval '601 seconds');
    raise exception 'ASSERTION_FAILED: expiry above 600 seconds was accepted';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.consume_auth_purpose_once(null, clock_timestamp() + interval '60 seconds');
    raise exception 'ASSERTION_FAILED: null hash was accepted';
  exception when sqlstate '22023' then null;
  end;
end
$invalid$;

select pg_temp.assert_true(
  (select relrowsecurity and relforcerowsecurity
   from pg_class where oid = 'public.auth_purpose_consumptions'::regclass),
  'table must have ENABLE and FORCE RLS'
);
select pg_temp.assert_true(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'auth_purpose_consumptions'
  ),
  'single-use marker table must have no client policy'
);
select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.auth_purpose_consumptions', 'SELECT')
  and not has_table_privilege('authenticated', 'public.auth_purpose_consumptions', 'SELECT')
  and not has_table_privilege('service_role', 'public.auth_purpose_consumptions', 'SELECT'),
  'clients and service_role must have no direct table access'
);
select pg_temp.assert_true(
  has_function_privilege('service_role', 'public.consume_auth_purpose_once(text,timestamptz)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.consume_auth_purpose_once(text,timestamptz)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.consume_auth_purpose_once(text,timestamptz)', 'EXECUTE'),
  'RPC must be executable only by service_role'
);
select pg_temp.assert_true(
  (select prosecdef and proconfig = array['search_path=""']
   from pg_proc where oid = 'public.consume_auth_purpose_once(text,timestamptz)'::regprocedure),
  'RPC must be SECURITY DEFINER with empty search_path'
);

-- Concorrência real em duas conexões: a segunda chamada bloqueia na PK até a
-- primeira confirmar e então retorna false, sem segundo consumo.
select dblink_connect('purpose_c1', 'dbname=' || current_database());
select dblink_connect('purpose_c2', 'dbname=' || current_database());
select dblink_exec('purpose_c1', 'begin');
select dblink_exec('purpose_c1', 'set local role service_role');
select consumed
from dblink(
  'purpose_c1',
  format(
    'select public.consume_auth_purpose_once(%L, clock_timestamp() + interval ''300 seconds'')',
    repeat('d', 64)
  )
) as result(consumed boolean);
select dblink_exec('purpose_c2', 'set role service_role');
select dblink_send_query(
  'purpose_c2',
  format(
    'select public.consume_auth_purpose_once(%L, clock_timestamp() + interval ''300 seconds'')',
    repeat('d', 64)
  )
);
select pg_sleep(0.1);
select pg_temp.assert_true(dblink_is_busy('purpose_c2') = 1, 'concurrent replay must wait for the winner');
select dblink_exec('purpose_c1', 'commit');
select pg_temp.assert_true(
  not (select consumed from dblink_get_result('purpose_c2') as result(consumed boolean)),
  'concurrent replay must return false after the winner commits'
);
select dblink_disconnect('purpose_c1');
select dblink_disconnect('purpose_c2');
select pg_temp.assert_true(
  (select count(*) = 1 from public.auth_purpose_consumptions where purpose_jti_hash = decode(repeat('d', 64), 'hex')),
  'concurrency must persist exactly one marker'
);

-- A limpeza oportunística é limitada: uma chamada remove no máximo 64 linhas.
insert into public.auth_purpose_consumptions (purpose_jti_hash, expires_at)
select decode(lpad(to_hex(n), 64, '0'), 'hex'), clock_timestamp() - interval '1 hour'
from generate_series(1, 70) as fixture(n);
select pg_temp.assert_true(
  public.consume_auth_purpose_once(repeat('e', 64), clock_timestamp() + interval '60 seconds'),
  'valid call after expired fixtures must succeed'
);
select pg_temp.assert_true(
  (select count(*) = 6 from public.auth_purpose_consumptions where expires_at <= clock_timestamp()),
  'opportunistic cleanup must delete exactly the bounded batch of 64'
);

select jsonb_build_object(
  'status', 'AUTH_PURPOSE_SINGLE_USE_SQL_TESTS_PASS',
  'postgres', current_setting('server_version'),
  'first_use', 'PASS',
  'replay', 'PASS',
  'concurrency', 'PASS',
  'invalid_and_expired', 'PASS',
  'rls_and_grants', 'PASS',
  'idempotency', 'PASS',
  'bounded_cleanup', 'PASS'
) as safe_test_result;
