-- Executar depois da foundation e antes do cutover, sempre com ON_ERROR_STOP=1.
-- Emite somente contagens seguras e termina com erro se qualquer gate falhar.
begin isolation level repeatable read read only;

with checks as (
  select
    (select count(*) from public.auth_users) as profiles,
    (select count(auth_user_id) from public.auth_users) as linked,
    (
      select count(*)
      from public.auth_users as profile
      left join auth.users as auth_user on auth_user.id = profile.auth_user_id
      where lower(btrim(profile.status)) = 'ativo'
        and (
          profile.auth_user_id is null
          or auth_user.id is null
          or auth_user.deleted_at is not null
          or (auth_user.banned_until is not null and auth_user.banned_until > now())
        )
    ) as invalid_active,
    (
      select count(*)
      from (
        select lower(btrim(email))
        from public.auth_users
        group by 1
        having count(*) > 1
      ) as duplicate_email
    ) as duplicate_email_groups,
    (
      select count(*)
      from (
        select auth_user_id
        from public.auth_users
        where auth_user_id is not null
        group by auth_user_id
        having count(*) > 1
      ) as duplicate_auth
    ) as duplicate_auth_user_groups,
    (
      select count(*)
      from public.auth_users as profile
      where not exists (
        select 1
        from public.app_role_permissions as permission
        where permission.role_name = profile.role
      )
    ) as unknown_roles
)
select jsonb_build_object(
  'expected_profiles', 11,
  'profiles', profiles,
  'linked', linked,
  'invalid_active', invalid_active,
  'duplicate_email_groups', duplicate_email_groups,
  'duplicate_auth_user_groups', duplicate_auth_user_groups,
  'unknown_roles', unknown_roles,
  'ready', profiles = 11
    and linked = 11
    and invalid_active = 0
    and duplicate_email_groups = 0
    and duplicate_auth_user_groups = 0
    and unknown_roles = 0
) as safe_cutover_dry_run
from checks;

do $gate$
declare
  v_profiles integer;
  v_linked integer;
  v_invalid_active integer;
  v_duplicate_email integer;
  v_duplicate_auth integer;
  v_unknown_role integer;
begin
  select count(*), count(auth_user_id)
  into v_profiles, v_linked
  from public.auth_users;

  select count(*) into v_invalid_active
  from public.auth_users as profile
  left join auth.users as auth_user on auth_user.id = profile.auth_user_id
  where lower(btrim(profile.status)) = 'ativo'
    and (
      profile.auth_user_id is null
      or auth_user.id is null
      or auth_user.deleted_at is not null
      or (auth_user.banned_until is not null and auth_user.banned_until > now())
    );

  select count(*) into v_duplicate_email
  from (
    select lower(btrim(email))
    from public.auth_users
    group by 1
    having count(*) > 1
  ) as duplicates;

  select count(*) into v_duplicate_auth
  from (
    select auth_user_id
    from public.auth_users
    where auth_user_id is not null
    group by auth_user_id
    having count(*) > 1
  ) as duplicates;

  select count(*) into v_unknown_role
  from public.auth_users as profile
  where not exists (
    select 1
    from public.app_role_permissions as permission
    where permission.role_name = profile.role
  );

  if v_profiles <> 11
     or v_linked <> 11
     or v_invalid_active <> 0
     or v_duplicate_email <> 0
     or v_duplicate_auth <> 0
     or v_unknown_role <> 0 then
    raise exception 'CUTOVER_DRY_RUN_FAIL_CLOSED';
  end if;
end
$gate$;

commit;
