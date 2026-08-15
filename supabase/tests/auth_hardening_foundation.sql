-- Testes da janela progressiva: executar imediatamente depois da foundation.
-- Toda a fixture criada aqui é revertida ao final.
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
  not has_column_privilege('anon', 'public.auth_users', 'password', 'SELECT'),
  'anon must lose legacy password visibility at foundation'
);
select pg_temp.assert_true(
  not has_column_privilege('authenticated', 'public.auth_users', 'password', 'SELECT'),
  'authenticated must lose legacy password visibility at foundation'
);
select pg_temp.assert_true(
  has_column_privilege('authenticated', 'public.auth_users', 'id', 'SELECT'),
  'non-secret profile columns remain readable during the progressive window'
);
select pg_temp.assert_true(
  has_column_privilege('service_role', 'public.auth_users', 'password', 'SELECT'),
  'service_role must retain server-only legacy verification access'
);
select pg_temp.assert_true(
  not has_function_privilege(
    'authenticated',
    'public.link_migrated_auth_user(text,uuid)',
    'EXECUTE'
  ),
  'atomic link RPC must be server-only'
);

begin;

insert into auth.users (id, email)
values (
  '00000000-0000-0000-0000-000000000099',
  'foundation-fixture@example.invalid'
);

insert into public.auth_users (
  id, name, email, institution, role, status, password,
  must_change_password, created_at_label, last_access, updated_at
) values (
  'foundation-fixture-profile',
  'Foundation Fixture',
  'foundation-fixture@example.invalid',
  'Fixture',
  'UFPR',
  'ativo',
  'fixture-legacy-hash-preserved',
  false,
  'fixture',
  'fixture',
  now()
);

set local role service_role;
select pg_temp.assert_true(
  public.link_migrated_auth_user(
    'foundation-fixture-profile',
    '00000000-0000-0000-0000-000000000099'
  ),
  'first conditional link must succeed'
);
select pg_temp.assert_true(
  not public.link_migrated_auth_user(
    'foundation-fixture-profile',
    '00000000-0000-0000-0000-000000000099'
  ),
  'repeated conditional link must fail closed'
);
reset role;

select pg_temp.assert_true(
  (
    select auth_user_id = '00000000-0000-0000-0000-000000000099'
      and auth_linked_at is not null
      and legacy_auth_disabled_at is not null
      and auth_linked_at = legacy_auth_disabled_at
      and updated_at = auth_linked_at
      and password = 'fixture-legacy-hash-preserved'
    from public.auth_users
    where id = 'foundation-fixture-profile'
  ),
  'link, disable and timestamps must be atomic while preserving the legacy hash'
);
select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.security_audit_log
    where event_type = 'auth.profile.security_changed'
      and target_type = 'auth_profile'
      and target_id_hash ~ '^[0-9a-f]{64}$'
      and metadata->>'auth_link_changed' = 'true'
      and metadata->>'legacy_auth_disabled_changed' = 'true'
      and metadata::text !~* '(foundation-fixture|example\\.invalid|fixture-legacy-hash)'
  ),
  'atomic migration must emit one redacted security event'
);

rollback;

select jsonb_build_object(
  'status', 'AUTH_HARDENING_FOUNDATION_TESTS_PASS',
  'legacy_hash_visibility', 'SERVICE_ROLE_ONLY',
  'atomic_link_disable', 'PASS',
  'audit_redaction', 'PASS'
) as safe_test_result;
