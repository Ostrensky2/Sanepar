-- Cutover atômico: só aplica depois de 11/11 perfis vinculados ao Supabase Auth.
-- Falha fechado antes de revogar qualquer política se o inventário divergir.
-- Ordem operacional vinculante:
--   1. foundation aplicada;
--   2. AUTH_LEGACY_MIGRATION_ENABLED=true somente durante a janela 0/11 -> 11/11;
--   3. AUTH_LEGACY_MIGRATION_ENABLED=false antes desta migration;
--   4. dry-run read-only PASS e então cutover.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

lock table public.auth_users in share row exclusive mode;

do $preflight$
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

  select count(*)
  into v_invalid_active
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

  if v_profiles <> 11 or v_linked <> 11 then
    raise exception 'cutover denied: expected 11/11 linked profiles, got %/%', v_linked, v_profiles;
  end if;
  if v_invalid_active <> 0
     or v_duplicate_email <> 0
     or v_duplicate_auth <> 0
     or v_unknown_role <> 0 then
    raise exception 'cutover denied: invalid_active=%, duplicate_email=%, duplicate_auth=%, unknown_role=%',
      v_invalid_active, v_duplicate_email, v_duplicate_auth, v_unknown_role;
  end if;
end
$preflight$;

update public.auth_users
set legacy_auth_disabled_at = coalesce(legacy_auth_disabled_at, transaction_timestamp())
where legacy_auth_disabled_at is null;

-- Remove qualquer política anterior nas tabelas expostas antes de recriar allowlists.
do $policies$
declare
  v_table text;
  v_policy record;
begin
  foreach v_table in array array[
    'auth_users',
    'app_role_permissions',
    'auth_rate_limit_buckets',
    'security_audit_log',
    'app_activity_logs',
    'campaign_imports',
    'campaign_management',
    'lab_risk_results',
    'point_actions',
    'field_diary_entries',
    'field_diary_change_log',
    'app_documents',
    'import_conflicts',
    'support_requests'
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('alter table public.%I enable row level security', v_table);
      execute format('alter table public.%I force row level security', v_table);
      for v_policy in
        select policyname
        from pg_policies
        where schemaname = 'public' and tablename = v_table
      loop
        execute format('drop policy if exists %I on public.%I', v_policy.policyname, v_table);
      end loop;
      execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
    end if;
  end loop;

  for v_policy in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'yvae_%'
  loop
    execute format('drop policy if exists %I on storage.objects', v_policy.policyname);
  end loop;
end
$policies$;

grant select (id, name, email, institution, role, status, created_at_label, last_access, updated_at, auth_user_id)
  on public.auth_users to authenticated;
grant select on public.security_audit_log to authenticated;
grant select on public.app_activity_logs to authenticated;

grant select, insert, update, delete on public.campaign_imports to authenticated;
grant select, insert, update, delete on public.campaign_management to authenticated;
grant select, insert, update, delete on public.lab_risk_results to authenticated;
grant select, insert, update, delete on public.point_actions to authenticated;
grant select, insert, update, delete on public.field_diary_entries to authenticated;
grant select on public.field_diary_change_log to authenticated;
grant select, insert, update, delete on public.app_documents to authenticated;
grant select, insert, update, delete on public.import_conflicts to authenticated;
grant select, insert, update on public.support_requests to authenticated;

drop policy if exists yvae_auth_users_select_current on public.auth_users;
create policy yvae_auth_users_select_current
on public.auth_users
for select
to authenticated
using (
  public.is_current_auth_profile_active()
  and (
    auth_user_id = (select auth.uid())
    or (
      public.has_current_permission('users.manage')
      and (
        public.current_auth_role() = 'Admin'
        or role = public.current_auth_role()
      )
    )
  )
);

drop policy if exists yvae_security_audit_select on public.security_audit_log;
create policy yvae_security_audit_select
on public.security_audit_log
for select
to authenticated
using (public.has_current_permission('settings.activity'));

drop policy if exists yvae_activity_log_select on public.app_activity_logs;
create policy yvae_activity_log_select
on public.app_activity_logs
for select
to authenticated
using (public.has_current_permission('settings.activity'));

drop policy if exists yvae_campaign_imports_select on public.campaign_imports;
create policy yvae_campaign_imports_select on public.campaign_imports
for select to authenticated using (public.has_current_permission('campaigns.view'));
drop policy if exists yvae_campaign_imports_insert on public.campaign_imports;
create policy yvae_campaign_imports_insert on public.campaign_imports
for insert to authenticated with check (public.has_current_permission('data.import'));
drop policy if exists yvae_campaign_imports_update on public.campaign_imports;
create policy yvae_campaign_imports_update on public.campaign_imports
for update to authenticated
using (public.has_current_permission('data.import'))
with check (public.has_current_permission('data.import'));
drop policy if exists yvae_campaign_imports_delete on public.campaign_imports;
create policy yvae_campaign_imports_delete on public.campaign_imports
for delete to authenticated using (public.has_current_permission('data.delete'));

drop policy if exists yvae_campaign_management_select on public.campaign_management;
create policy yvae_campaign_management_select on public.campaign_management
for select to authenticated using (public.has_current_permission('campaigns.view'));
drop policy if exists yvae_campaign_management_insert on public.campaign_management;
create policy yvae_campaign_management_insert on public.campaign_management
for insert to authenticated with check (public.has_current_permission('data.import'));
drop policy if exists yvae_campaign_management_update on public.campaign_management;
create policy yvae_campaign_management_update on public.campaign_management
for update to authenticated
using (public.has_current_permission('data.import'))
with check (public.has_current_permission('data.import'));
drop policy if exists yvae_campaign_management_delete on public.campaign_management;
create policy yvae_campaign_management_delete on public.campaign_management
for delete to authenticated using (public.has_current_permission('data.delete'));

drop policy if exists yvae_lab_risk_results_select on public.lab_risk_results;
create policy yvae_lab_risk_results_select on public.lab_risk_results
for select to authenticated using (public.has_current_permission('campaigns.view'));
drop policy if exists yvae_lab_risk_results_insert on public.lab_risk_results;
create policy yvae_lab_risk_results_insert on public.lab_risk_results
for insert to authenticated with check (public.has_current_permission('data.import'));
drop policy if exists yvae_lab_risk_results_update on public.lab_risk_results;
create policy yvae_lab_risk_results_update on public.lab_risk_results
for update to authenticated
using (public.has_current_permission('data.import'))
with check (public.has_current_permission('data.import'));
drop policy if exists yvae_lab_risk_results_delete on public.lab_risk_results;
create policy yvae_lab_risk_results_delete on public.lab_risk_results
for delete to authenticated using (public.has_current_permission('data.delete'));

drop policy if exists yvae_point_actions_select on public.point_actions;
create policy yvae_point_actions_select on public.point_actions
for select to authenticated using (public.has_current_permission('campaigns.view'));
drop policy if exists yvae_point_actions_insert on public.point_actions;
create policy yvae_point_actions_insert on public.point_actions
for insert to authenticated with check (public.has_current_permission('data.import'));
drop policy if exists yvae_point_actions_update on public.point_actions;
create policy yvae_point_actions_update on public.point_actions
for update to authenticated
using (public.has_current_permission('data.import'))
with check (public.has_current_permission('data.import'));
drop policy if exists yvae_point_actions_delete on public.point_actions;
create policy yvae_point_actions_delete on public.point_actions
for delete to authenticated using (public.has_current_permission('data.delete'));

drop policy if exists yvae_field_diary_select on public.field_diary_entries;
create policy yvae_field_diary_select on public.field_diary_entries
for select to authenticated using (public.has_current_permission('data.view'));
drop policy if exists yvae_field_diary_insert on public.field_diary_entries;
create policy yvae_field_diary_insert on public.field_diary_entries
for insert to authenticated with check (public.has_current_permission('data.import'));
drop policy if exists yvae_field_diary_update on public.field_diary_entries;
create policy yvae_field_diary_update on public.field_diary_entries
for update to authenticated
using (public.has_current_permission('data.import'))
with check (public.has_current_permission('data.import'));
drop policy if exists yvae_field_diary_delete on public.field_diary_entries;
create policy yvae_field_diary_delete on public.field_diary_entries
for delete to authenticated using (public.has_current_permission('data.delete'));

drop policy if exists yvae_field_diary_change_log_select on public.field_diary_change_log;
create policy yvae_field_diary_change_log_select on public.field_diary_change_log
for select to authenticated using (public.has_current_permission('data.view'));

drop policy if exists yvae_documents_select on public.app_documents;
create policy yvae_documents_select on public.app_documents
for select to authenticated using (public.has_current_permission('documents.view'));
drop policy if exists yvae_documents_insert on public.app_documents;
create policy yvae_documents_insert on public.app_documents
for insert to authenticated with check (public.has_current_permission('documents.manage'));
drop policy if exists yvae_documents_update on public.app_documents;
create policy yvae_documents_update on public.app_documents
for update to authenticated
using (public.has_current_permission('documents.manage'))
with check (public.has_current_permission('documents.manage'));
drop policy if exists yvae_documents_delete on public.app_documents;
create policy yvae_documents_delete on public.app_documents
for delete to authenticated using (public.has_current_permission('documents.manage'));

drop policy if exists yvae_import_conflicts_select on public.import_conflicts;
create policy yvae_import_conflicts_select on public.import_conflicts
for select to authenticated using (public.has_current_permission('data.import'));
drop policy if exists yvae_import_conflicts_insert on public.import_conflicts;
create policy yvae_import_conflicts_insert on public.import_conflicts
for insert to authenticated with check (public.has_current_permission('data.import'));
drop policy if exists yvae_import_conflicts_update on public.import_conflicts;
create policy yvae_import_conflicts_update on public.import_conflicts
for update to authenticated
using (public.has_current_permission('data.import'))
with check (public.has_current_permission('data.import'));
drop policy if exists yvae_import_conflicts_delete on public.import_conflicts;
create policy yvae_import_conflicts_delete on public.import_conflicts
for delete to authenticated using (public.has_current_permission('data.delete'));

drop policy if exists yvae_support_requests_select on public.support_requests;
create policy yvae_support_requests_select on public.support_requests
for select to authenticated
using (
  public.is_current_auth_profile_active()
  and (
    created_by_auth_user_id = (select auth.uid())
    or public.has_current_permission('settings.manage')
  )
);
drop policy if exists yvae_support_requests_insert on public.support_requests;
create policy yvae_support_requests_insert on public.support_requests
for insert to authenticated
with check (
  public.is_current_auth_profile_active()
  and created_by_auth_user_id = (select auth.uid())
);
drop policy if exists yvae_support_requests_update on public.support_requests;
create policy yvae_support_requests_update on public.support_requests
for update to authenticated
using (
  public.is_current_auth_profile_active()
  and (
    created_by_auth_user_id = (select auth.uid())
    or public.has_current_permission('settings.manage')
  )
)
with check (
  public.is_current_auth_profile_active()
  and (
    created_by_auth_user_id = (select auth.uid())
    or public.has_current_permission('settings.manage')
  )
);

revoke all on table storage.objects from anon;
grant select, insert, update, delete on table storage.objects to authenticated;

drop policy if exists yvae_storage_select_secured on storage.objects;
create policy yvae_storage_select_secured
on storage.objects
for select
to authenticated
using (
  public.is_current_auth_profile_active()
  and (
    (bucket_id = 'documents' and public.has_current_permission('documents.view'))
    or (bucket_id = 'photos' and public.has_current_permission('campaigns.view'))
  )
);

drop policy if exists yvae_storage_insert_secured on storage.objects;
create policy yvae_storage_insert_secured
on storage.objects
for insert
to authenticated
with check (
  public.is_current_auth_profile_active()
  and (
    (bucket_id = 'documents' and public.has_current_permission('documents.manage'))
    or (bucket_id = 'photos' and public.has_current_permission('data.import'))
  )
);

drop policy if exists yvae_storage_update_secured on storage.objects;
create policy yvae_storage_update_secured
on storage.objects
for update
to authenticated
using (
  public.is_current_auth_profile_active()
  and (
    (bucket_id = 'documents' and public.has_current_permission('documents.manage'))
    or (bucket_id = 'photos' and public.has_current_permission('data.import'))
  )
)
with check (
  public.is_current_auth_profile_active()
  and (
    (bucket_id = 'documents' and public.has_current_permission('documents.manage'))
    or (bucket_id = 'photos' and public.has_current_permission('data.import'))
  )
);

drop policy if exists yvae_storage_delete_secured on storage.objects;
create policy yvae_storage_delete_secured
on storage.objects
for delete
to authenticated
using (
  public.is_current_auth_profile_active()
  and (
    (bucket_id = 'documents' and public.has_current_permission('documents.manage'))
    or (bucket_id = 'photos' and public.has_current_permission('data.delete'))
  )
);

commit;
