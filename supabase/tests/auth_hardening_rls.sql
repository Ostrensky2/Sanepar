-- Testes locais de integridade, acesso horizontal/vertical e rate limiting.
-- Requer fixture -> foundation -> seed -> cutover.
\set ON_ERROR_STOP on

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
  (select count(*) = 11 from public.auth_users where auth_user_id is not null),
  'cutover requires 11/11 linked profiles'
);
select pg_temp.assert_true(
  (select count(*) = 11 from public.auth_users where legacy_auth_disabled_at is not null),
  'legacy authenticator must be disabled for every profile'
);
select pg_temp.assert_true(
  (select count(*) = 11 from public.auth_users where password like 'fixture-legacy-hash-%'),
  'legacy hashes must be preserved'
);
select pg_temp.assert_true(
  not has_column_privilege('authenticated', 'public.auth_users', 'password', 'SELECT'),
  'authenticated must never read legacy password hashes'
);
select pg_temp.assert_true(
  not has_table_privilege('anon', 'public.auth_users', 'SELECT'),
  'anon must not read profiles'
);
select pg_temp.assert_true(
  not has_function_privilege(
    'authenticated',
    'public.consume_auth_rate_limit(text,text,integer,integer,integer)',
    'EXECUTE'
  ),
  'rate limiter RPC must be server-only'
);

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
select pg_temp.assert_true(public.is_current_auth_profile_active(), 'active UFPR profile expected');
select pg_temp.assert_true(public.has_current_permission('data.import'), 'UFPR import permission expected');
select pg_temp.assert_true(not public.has_current_permission('users.manage'), 'UFPR vertical escalation denied');
select pg_temp.assert_true((select count(*) = 1 from public.auth_users), 'UFPR must see only own profile');

insert into public.campaign_imports default values;
delete from public.campaign_imports;
reset role;
select pg_temp.assert_true(
  (select count(*) = 1 from public.campaign_imports),
  'UFPR without data.delete must not delete imported rows'
);

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', false);
select pg_temp.assert_true(
  (select count(*) = 2 from public.auth_users),
  'ATGC users.manage visibility must remain scoped to same role'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select pg_temp.assert_true((select count(*) = 11 from public.auth_users), 'Admin must see all profiles');
select pg_temp.assert_true(
  (select count(*) > 0 from public.security_audit_log),
  'Admin must see cutover audit events'
);
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000011', false);
select pg_temp.assert_true(not public.is_current_auth_profile_active(), 'inactive profile must be denied');
select pg_temp.assert_true((select count(*) = 0 from public.auth_users), 'inactive profile cannot read self');
reset role;

set role service_role;
select pg_temp.assert_true(
  (select allowed from public.consume_auth_rate_limit(
    'login:ip', repeat('a', 64), 2, 60, 120
  )),
  'first rate-limit hit allowed'
);
select pg_temp.assert_true(
  (select allowed from public.consume_auth_rate_limit(
    'login:ip', repeat('a', 64), 2, 60, 120
  )),
  'second rate-limit hit allowed'
);
select pg_temp.assert_true(
  not (select allowed from public.consume_auth_rate_limit(
    'login:ip', repeat('a', 64), 2, 60, 120
  )),
  'third rate-limit hit denied'
);

do $test$
begin
  begin
    perform public.consume_auth_rate_limit('login:ip', 'not-a-hash', 2, 60, 0);
    raise exception 'ASSERTION_FAILED: malformed subject was accepted';
  exception
    when sqlstate '22023' then null;
  end;

  begin
    perform public.write_security_audit(
      'auth.test', 'failure', 'fixture', null,
      jsonb_build_object('token', 'redacted'), null
    );
    raise exception 'ASSERTION_FAILED: sensitive audit metadata was accepted';
  exception
    when sqlstate '22023' then null;
  end;
end
$test$;
reset role;

select pg_temp.assert_true(
  not exists (
    select 1
    from pg_policies
    where schemaname in ('public', 'storage')
      and 'anon' = any(roles)
  ),
  'no anon RLS policy may remain'
);

select jsonb_build_object(
  'status', 'AUTH_HARDENING_SQL_TESTS_PASS',
  'profiles', 11,
  'horizontal_access', 'PASS',
  'vertical_access', 'PASS',
  'inactive_profile', 'PASS',
  'legacy_hash_visibility', 'DENIED',
  'rate_limit', 'PASS',
  'audit_redaction', 'PASS'
) as safe_test_result;
