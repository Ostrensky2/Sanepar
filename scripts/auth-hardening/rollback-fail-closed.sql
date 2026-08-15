-- Rollback compensatório seguro do cutover.
-- Não apaga vínculos, hashes, auditoria ou buckets; volta para acesso exclusivo
-- do backend/service_role, sem restaurar as antigas políticas públicas.

begin;
set local lock_timeout = '5s';

do $rollback$
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
      for v_policy in
        select policyname
        from pg_policies
        where schemaname = 'public'
          and tablename = v_table
          and policyname like 'yvae_%'
      loop
        execute format('drop policy if exists %I on public.%I', v_policy.policyname, v_table);
      end loop;
      execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
      execute format('alter table public.%I enable row level security', v_table);
      execute format('alter table public.%I force row level security', v_table);
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
$rollback$;

revoke all on table storage.objects from anon, authenticated;

commit;
