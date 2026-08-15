-- Inventário seguro: somente contagens/metadados, sem e-mail, UUID, hash ou PII.
begin isolation level repeatable read read only;

select jsonb_build_object(
  'transaction_read_only', current_setting('transaction_read_only'),
  'transaction_isolation', current_setting('transaction_isolation'),
  'profiles', (select count(*) from public.auth_users),
  'duplicate_normalized_email_groups', (
    select count(*)
    from (
      select lower(btrim(email))
      from public.auth_users
      group by 1
      having count(*) > 1
    ) as duplicate_email
  ),
  'profiles_matching_auth_by_normalized_email', (
    select count(*)
    from public.auth_users as profile
    join auth.users as auth_user
      on lower(btrim(auth_user.email)) = lower(btrim(profile.email))
  ),
  'profiles_without_auth_email_match', (
    select count(*)
    from public.auth_users as profile
    where not exists (
      select 1
      from auth.users as auth_user
      where lower(btrim(auth_user.email)) = lower(btrim(profile.email))
    )
  ),
  'auth_user_id_column_present', exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'auth_users'
      and column_name = 'auth_user_id'
      and data_type = 'uuid'
  ),
  'broad_public_policies', (
    select count(*)
    from pg_policies
    where schemaname in ('public', 'storage')
      and ('anon' = any(roles) or qual = 'true' or with_check = 'true')
  ),
  'legacy_password_column_present', exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'auth_users'
      and column_name = 'password'
  )
) as safe_inventory;

commit;
