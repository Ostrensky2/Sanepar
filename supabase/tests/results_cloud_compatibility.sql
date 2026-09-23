-- Run ONLY on verified E7 cloud restore; no synthetic/user/local data imported.
-- Requires existing cloud public tables and approved role/schema snapshot.
\set ON_ERROR_STOP on
do $target$ begin
  if current_database() <> 'sanepar_cloud_20260923' or inet_server_port() <> 55433 then
    raise exception 'ISOLATED_CLOUD_RESTORE_REQUIRED';
  end if;
  if (select count(*) from public.lab_risk_results)<>3
    or (select count(*) from public.lab_risk_results where jsonb_typeof(points)='object')<>2
    or (select count(*) from public.lab_risk_results where jsonb_typeof(points)='array')<>1 then
    raise exception 'CLOUD_BASELINE_CHANGED';
  end if;
  -- Old migration contains a schema-wide REVOKE. Reject any nonzero impact.
  if exists(select 1 from pg_namespace n, lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
    where n.nspname='private' and (a.grantee=0 or a.grantee in
      (select oid from pg_roles where rolname in ('anon','authenticated','service_role')))) then
    raise exception 'PRIVATE_SCHEMA_GRANTS_REQUIRE_REDESIGN';
  end if;
end $target$;

create function pg_temp.data_fingerprints() returns table(relation_name text, row_count bigint, fingerprint text)
language plpgsql as $fn$
declare r record;
begin
  for r in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind='r' order by n.nspname,c.relname loop
    return query execute format('select %L::text,count(*),encode(extensions.digest(coalesce(string_agg(to_jsonb(t)::text, chr(10) order by to_jsonb(t)::text),''''),''sha256''),''hex'') from %I.%I t',
      r.nspname||'.'||r.relname,r.nspname,r.relname);
  end loop;
end $fn$;
create temp table baseline_data as select * from pg_temp.data_fingerprints();
create temp table baseline_relations as select c.oid,c.relacl,c.relowner,c.relrowsecurity,c.relforcerowsecurity
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private');
create temp table baseline_policies as select to_jsonb(p) as policy from pg_policies p;
create temp table baseline_functions as select p.oid,p.proacl,p.proowner,pg_get_functiondef(p.oid) as definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.prokind='f';
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
\ir ../migrations/20260922161004_results_selective_publication.sql
\ir ../migrations/20260922165113_results_preparation_packages.sql
\ir ../migrations/20260923191542_results_cloud_legacy_compatibility.sql

do $verify$
declare r record; result jsonb; before_heads text; after_heads text;
begin
  if exists(select 1 from baseline_data b left join pg_temp.data_fingerprints() a using(relation_name)
    where a.row_count is distinct from b.row_count or a.fingerprint is distinct from b.fingerprint) then
    raise exception 'OLD_DATA_CHANGED';
  end if;
  if exists(select 1 from baseline_relations b join pg_class c on c.oid=b.oid
    where (c.relacl,c.relowner,c.relrowsecurity,c.relforcerowsecurity) is distinct from
      (b.relacl,b.relowner,b.relrowsecurity,b.relforcerowsecurity)) then raise exception 'OLD_RELATION_SECURITY_CHANGED'; end if;
  if exists((select policy from baseline_policies except select to_jsonb(p) from pg_policies p)
    union all (select to_jsonb(p) from pg_policies p except select policy from baseline_policies)) then
    raise exception 'OLD_POLICIES_CHANGED';
  end if;
  if exists(select 1 from baseline_functions b join pg_proc p on p.oid=b.oid
    where (p.proacl,p.proowner,pg_get_functiondef(p.oid)) is distinct from (b.proacl,b.proowner,b.definition)) then
    raise exception 'OLD_FUNCTION_CHANGED';
  end if;
  if (select count(*) from private.results_campaign_heads)<>2
    or exists(select 1 from private.results_campaign_heads h join public.lab_risk_results r on r.id=h.publication_id
      where h.source_sha256 is not null or h.campaign_code<>'C'||(r.points->>'campaignNumber')
        or h.campaign_hash<>encode(extensions.digest(convert_to(r.points::text,'UTF8'),'sha256'),'hex')) then
    raise exception 'LEGACY_HEADS_INVALID';
  end if;
  if (select count(*) from private.results_source_artifacts)
    +(select count(*) from private.results_publish_requests)
    +(select count(*) from private.results_preparation_artifacts)
    +(select count(*) from private.results_preparation_revisions)
    +(select count(*) from private.results_preparation_heads)
    +(select count(*) from private.results_preparation_requests)<>0 then raise exception 'UNEXPECTED_NEW_DATA'; end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='private' and c.relname in ('results_campaign_heads','results_source_artifacts','results_publish_requests',
      'results_preparation_artifacts','results_preparation_revisions','results_preparation_heads','results_preparation_requests')
    and (not c.relrowsecurity or not c.relforcerowsecurity)) then raise exception 'RLS_INVALID'; end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join (values ('anon'),('authenticated'),('service_role')) as app(role_name)
    where n.nspname='private' and c.relkind='r' and c.relname in
      ('results_campaign_heads','results_source_artifacts','results_publish_requests','results_preparation_artifacts',
       'results_preparation_revisions','results_preparation_heads','results_preparation_requests')
    and has_table_privilege(app.role_name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) then
    raise exception 'DIRECT_TABLE_PRIVILEGE';
  end if;
  for r in select p.oid,p.proname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('publish_results_snapshot','read_results_inventory','read_results_source',
      'save_results_preparation','read_results_preparation','read_results_preparation_artifact') loop
    if not r.prosecdef or r.proconfig is distinct from array['search_path=""']::text[]
      or has_function_privilege('anon',r.oid,'EXECUTE') or has_function_privilege('authenticated',r.oid,'EXECUTE')
      or not has_function_privilege('service_role',r.oid,'EXECUTE') then raise exception 'RPC_PRIVILEGES_INVALID'; end if;
  end loop;
  result:=public.read_results_inventory();
  if jsonb_array_length(result->'publications')<>3 or result->'sourceHashes'<>'[]'::jsonb then
    raise exception 'INVENTORY_LOST_LEGACY';
  end if;
  for r in select * from private.results_campaign_heads loop
    result:=public.read_results_source(r.campaign_code,r.publication_id,null,true);
    if result->>'availability'<>'missing_source_artifact' or result->'sourceSha256'<>'null'::jsonb
      or result->'model'<>'null'::jsonb or result->'parsed'<>'null'::jsonb
      or result->'originalBase64'<>'null'::jsonb or result->>'downloadAvailable'<>'false' then
      raise exception 'SOURCE_FABRICATED';
    end if;
    begin
      perform public.read_results_source(r.campaign_code,r.publication_id,repeat('0',64),false);
      raise exception 'WRONG_SOURCE_ACCEPTED';
    exception when serialization_failure then null; end;
  end loop;
end $verify$;
-- Replay only additive compatibility migration; no plain CREATE re-execution.
create temp table before_replay as select * from pg_temp.data_fingerprints();
\ir ../migrations/20260923191542_results_cloud_legacy_compatibility.sql
do $$ begin
  if exists(select 1 from before_replay b join pg_temp.data_fingerprints() a using(relation_name)
    where (a.row_count,a.fingerprint) is distinct from (b.row_count,b.fingerprint)) then
    raise exception 'REPLAY_CHANGED_DATA';
  end if;
end $$;
set local role service_role;
select jsonb_array_length(public.read_results_inventory()->'publications') as readable_publications;
reset role;
select 'CLOUD_COMPATIBILITY_DRYRUN_PASS' as status;
rollback;
do $$ begin
  if to_regclass('private.results_campaign_heads') is not null then raise exception 'ROLLBACK_FAILED'; end if;
end $$;
select 'NONDESTRUCTIVE_ROLLBACK_PASS' as status;
