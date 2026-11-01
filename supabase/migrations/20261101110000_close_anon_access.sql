-- Fecha o acesso de quem não fez login (papel anon) a todo o banco e ao Storage.
--
-- Por quê: as migrations antigas criaram políticas "using (true)" para anon em
-- campaign_imports, point_actions, campaign_management, lab_risk_results,
-- app_documents, app_activity_logs e no Storage (documents/photos). O cutover
-- 20260815091000 já trocava parte delas, mas só roda com 11/11 perfis vinculados
-- e não cobre tabelas criadas fora das migrations. Esta migration não depende do
-- cutover: varre o schema public e o Storage e falha (sem aplicar nada) se, no
-- fim, ainda sobrar qualquer acesso de anon.
--
-- O app não usa anon para dados: todas as leituras e gravações passam pelas rotas
-- de API no servidor, com a chave secreta (service_role) e a permissão conferida
-- em requireApiSession. A chave publicável fica só para o login (Supabase Auth).
--
-- Idempotente: pode ser aplicada de novo sem efeito.
-- Conferência antes/depois: scripts/db-checks/anon-access-readonly.sql

begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

-- 1. Políticas abertas no schema public: qualquer política que alcance anon ou
--    PUBLIC (todos os papéis), ou que libere tudo com "true".
do $open_policies$
declare
  v_policy record;
begin
  for v_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and (
        'anon' = any(roles)
        or 'public' = any(roles)
        or btrim(coalesce(qual, '')) = 'true'
        or btrim(coalesce(with_check, '')) = 'true'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', v_policy.policyname, v_policy.schemaname, v_policy.tablename);
  end loop;
end
$open_policies$;

-- 2. RLS ligado em todas as tabelas do schema public e nenhum privilégio para anon
--    (tabelas, views, sequências). PUBLIC também perde, porque anon herda de PUBLIC.
do $table_grants$
declare
  v_relation record;
begin
  for v_relation in
    select c.oid, c.relname, c.relkind
    from pg_class as c
    join pg_namespace as n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
      and not exists (
        select 1 from pg_depend as d
        where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
      )
  loop
    if v_relation.relkind in ('r', 'p') then
      execute format('alter table public.%I enable row level security', v_relation.relname);
    end if;

    if v_relation.relkind = 'S' then
      execute format('revoke all on sequence public.%I from anon, public', v_relation.relname);
    else
      execute format('revoke all on table public.%I from anon, public', v_relation.relname);
    end if;
  end loop;
end
$table_grants$;

-- 3. Funções do schema public: anon deixa de executar. Quem executava por herança
--    de PUBLIC (authenticated, service_role) recebe a permissão explícita antes,
--    para nada do login ou das rotas de API mudar.
do $function_grants$
declare
  v_function record;
  v_role text;
begin
  for v_function in
    select p.oid, p.oid::regprocedure as signature
    from pg_proc as p
    join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and not exists (
        select 1 from pg_depend as d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      )
  loop
    foreach v_role in array array['authenticated', 'service_role'] loop
      if exists (select 1 from pg_roles where rolname = v_role)
         and has_function_privilege(v_role, v_function.oid, 'EXECUTE') then
        execute format('grant execute on function %s to %I', v_function.signature, v_role);
      end if;
    end loop;

    execute format('revoke all on function %s from anon, public', v_function.signature);
  end loop;
end
$function_grants$;

-- 4. Defaults do papel executor (postgres em produção). A revogação global de
--    EXECUTE é necessária: um REVOKE limitado ao schema não retira o EXECUTE
--    concedido globalmente a PUBLIC por padrão. Os grants explícitos existentes
--    para authenticated/service_role são preservados. Defaults de outros
--    criadores, como supabase_admin, não são alterados por esta migration.
--    https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke all on tables from anon, public;
alter default privileges in schema public revoke all on sequences from anon, public;
alter default privileges in schema public revoke all on functions from anon, public;

-- 5. Políticas por papel para quem fez login, iguais às do cutover 20260815091000
--    (access-control do app). Recriadas aqui para o estado final não depender de o
--    cutover ter rodado. Só quando a base de permissões (foundation) existe.
do $authenticated_policies$
declare
  v_rule record;
begin
  if to_regprocedure('public.has_current_permission(text)') is null then
    raise notice 'has_current_permission ausente: tabelas ficam só com acesso do servidor (service_role).';
    return;
  end if;

  for v_rule in
    select *
    from (values
      -- tabela,               prefixo (mesmo nome do cutover), ler,  gravar,  apagar
      ('campaign_imports',    'yvae_campaign_imports',    'campaigns.view', 'data.import',      'data.delete'),
      ('campaign_management', 'yvae_campaign_management', 'campaigns.view', 'data.import',      'data.delete'),
      ('lab_risk_results',    'yvae_lab_risk_results',    'campaigns.view', 'data.import',      'data.delete'),
      ('point_actions',       'yvae_point_actions',       'campaigns.view', 'data.import',      'data.delete'),
      ('field_diary_entries', 'yvae_field_diary',         'data.view',      'data.import',      'data.delete'),
      ('app_documents',       'yvae_documents',           'documents.view', 'documents.manage', 'documents.manage'),
      ('import_conflicts',    'yvae_import_conflicts',    'data.import',    'data.import',      'data.delete')
    ) as rule(table_name, policy_prefix, read_permission, write_permission, delete_permission)
  loop
    if to_regclass('public.' || v_rule.table_name) is null then
      continue;
    end if;

    execute format('grant select, insert, update, delete on public.%I to authenticated', v_rule.table_name);

    execute format('drop policy if exists %I on public.%I', v_rule.policy_prefix || '_select', v_rule.table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_current_permission(%L))',
      v_rule.policy_prefix || '_select', v_rule.table_name, v_rule.read_permission
    );

    execute format('drop policy if exists %I on public.%I', v_rule.policy_prefix || '_insert', v_rule.table_name);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.has_current_permission(%L))',
      v_rule.policy_prefix || '_insert', v_rule.table_name, v_rule.write_permission
    );

    execute format('drop policy if exists %I on public.%I', v_rule.policy_prefix || '_update', v_rule.table_name);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.has_current_permission(%L)) with check (public.has_current_permission(%L))',
      v_rule.policy_prefix || '_update', v_rule.table_name, v_rule.write_permission, v_rule.write_permission
    );

    execute format('drop policy if exists %I on public.%I', v_rule.policy_prefix || '_delete', v_rule.table_name);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.has_current_permission(%L))',
      v_rule.policy_prefix || '_delete', v_rule.table_name, v_rule.delete_permission
    );
  end loop;

  -- Histórico de alterações: leitura para quem vê os dados; gravação só pelo servidor.
  if to_regclass('public.field_diary_change_log') is not null then
    grant select on public.field_diary_change_log to authenticated;
    drop policy if exists yvae_field_diary_change_log_select on public.field_diary_change_log;
    create policy yvae_field_diary_change_log_select on public.field_diary_change_log
      for select to authenticated using (public.has_current_permission('data.view'));
  end if;

  -- Storage (fotos e documentos) para quem fez login, como no cutover.
  if to_regprocedure('public.is_current_auth_profile_active()') is not null then
    drop policy if exists yvae_storage_select_secured on storage.objects;
    create policy yvae_storage_select_secured on storage.objects
      for select to authenticated
      using (
        public.is_current_auth_profile_active()
        and (
          (bucket_id = 'documents' and public.has_current_permission('documents.view'))
          or (bucket_id = 'photos' and public.has_current_permission('campaigns.view'))
        )
      );

    drop policy if exists yvae_storage_insert_secured on storage.objects;
    create policy yvae_storage_insert_secured on storage.objects
      for insert to authenticated
      with check (
        public.is_current_auth_profile_active()
        and (
          (bucket_id = 'documents' and public.has_current_permission('documents.manage'))
          or (bucket_id = 'photos' and public.has_current_permission('data.import'))
        )
      );

    drop policy if exists yvae_storage_update_secured on storage.objects;
    create policy yvae_storage_update_secured on storage.objects
      for update to authenticated
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
    create policy yvae_storage_delete_secured on storage.objects
      for delete to authenticated
      using (
        public.is_current_auth_profile_active()
        and (
          (bucket_id = 'documents' and public.has_current_permission('documents.manage'))
          or (bucket_id = 'photos' and public.has_current_permission('data.delete'))
        )
      );
  end if;

  -- Registro de atividades: leitura para quem acompanha atividade; gravação só pelo servidor.
  if to_regclass('public.app_activity_logs') is not null then
    grant select on public.app_activity_logs to authenticated;
    drop policy if exists yvae_activity_log_select on public.app_activity_logs;
    create policy yvae_activity_log_select on public.app_activity_logs
      for select to authenticated using (public.has_current_permission('settings.activity'));
  end if;
end
$authenticated_policies$;

-- 6. Storage: nenhum bucket público e nenhuma política para anon/PUBLIC.
--    Fotos e documentos já são servidos por URL assinada emitida pelo servidor.
do $storage_policies$
declare
  v_policy record;
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets set public = false where public;
  end if;

  for v_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'storage'
      and (
        'anon' = any(roles)
        or 'public' = any(roles)
        or btrim(coalesce(qual, '')) = 'true'
        or btrim(coalesce(with_check, '')) = 'true'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', v_policy.policyname, v_policy.schemaname, v_policy.tablename);
  end loop;

  begin
    if to_regclass('storage.objects') is not null then
      revoke all on table storage.objects from anon;
    end if;
    if to_regclass('storage.buckets') is not null then
      revoke all on table storage.buckets from anon;
    end if;
  exception when insufficient_privilege then
    -- Sem política para anon e com RLS ligado no Storage, anon não alcança nenhum
    -- arquivo mesmo que o privilégio de tabela continue.
    raise notice 'Sem permissão para revogar privilégios de tabela no Storage; políticas de anon já removidas.';
  end;
end
$storage_policies$;

-- 7. Conferência final: se sobrar qualquer acesso de anon, nada desta migration vale.
do $verify$
declare
  v_open_policies integer;
  v_anon_relations integer;
  v_anon_functions integer;
  v_public_buckets integer;
  v_rls_off integer;
begin
  select count(*) into v_open_policies
  from pg_policies
  where schemaname in ('public', 'storage')
    and (
      'anon' = any(roles)
      or 'public' = any(roles)
      or btrim(coalesce(qual, '')) = 'true'
      or btrim(coalesce(with_check, '')) = 'true'
    );

  select count(*) into v_anon_relations
  from pg_class as c
  join pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'f')
    and has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
    and not exists (
      select 1 from pg_depend as d
      where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
    );

  select count(*) into v_anon_functions
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind in ('f', 'p')
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and not exists (
      select 1 from pg_depend as d
      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
    );

  if to_regclass('storage.buckets') is not null then
    execute 'select count(*) from storage.buckets where public' into v_public_buckets;
  else
    v_public_buckets := 0;
  end if;

  select count(*) into v_rls_off
  from pg_class as c
  join pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity
    and not exists (
      select 1 from pg_depend as d
      where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
    );

  if v_open_policies <> 0 or v_anon_relations <> 0 or v_anon_functions <> 0
     or v_public_buckets <> 0 or v_rls_off <> 0 then
    raise exception 'anon ainda tem acesso: políticas_abertas=%, tabelas=%, funções=%, buckets_públicos=%, tabelas_sem_rls=%',
      v_open_policies, v_anon_relations, v_anon_functions, v_public_buckets, v_rls_off;
  end if;
end
$verify$;

commit;
