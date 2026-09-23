-- Independent preparation only. Does not write publication/campaign tables.
create schema if not exists private;
create table private.results_preparation_artifacts (
  sha256 text primary key check (sha256 ~ '^[0-9a-f]{64}$'),
  original_bytes bytea not null check (octet_length(original_bytes) between 1 and 268435456)
);
create table private.results_preparation_revisions (
  revision_hash text primary key check (revision_hash ~ '^[0-9a-f]{64}$'),
  package_key text not null,
  parent_hash text references private.results_preparation_revisions(revision_hash),
  manifest jsonb not null,
  parsed_bindings jsonb not null,
  resolved_roles jsonb not null,
  state text not null check (state in ('received','pending','conflict','ready')),
  created_at timestamptz not null default transaction_timestamp()
);
create index results_preparation_revisions_package_idx on private.results_preparation_revisions(package_key);
create table private.results_preparation_heads (
  package_key text primary key,
  revision_hash text not null references private.results_preparation_revisions(revision_hash)
);
create table private.results_preparation_requests (
  request_id uuid primary key,
  fingerprint text not null,
  response jsonb not null
);
alter table private.results_preparation_artifacts enable row level security;
alter table private.results_preparation_artifacts force row level security;
alter table private.results_preparation_revisions enable row level security;
alter table private.results_preparation_revisions force row level security;
alter table private.results_preparation_heads enable row level security;
alter table private.results_preparation_heads force row level security;
alter table private.results_preparation_requests enable row level security;
alter table private.results_preparation_requests force row level security;
revoke all on private.results_preparation_artifacts, private.results_preparation_revisions,
  private.results_preparation_heads, private.results_preparation_requests from public, anon, authenticated, service_role;

create function public.save_results_preparation(
  p_request_id uuid, p_package_key text, p_expected_revision_hash text,
  p_manifest jsonb, p_artifacts jsonb default '[]', p_parsed_bindings jsonb default '[]'
) returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare
  v_fingerprint text; v_request private.results_preparation_requests%rowtype;
  v_head text; v_hash text; v_manifest jsonb; v_bindings jsonb := '[]';
  v_roles jsonb := '{}'; v_response jsonb; v_required text[];
  v_file jsonb; v_binding jsonb; v_artifact jsonb; v_dep jsonb; v_sheet jsonb;
  v_row jsonb; v_cell jsonb; v_bytes bytea; v_source text; v_role text; v_name text;
  v_model_hash text; v_role_source jsonb; v_revision private.results_preparation_revisions%rowtype;
  v_missing boolean := false; v_conflict boolean := false; v_state text;
  v_names text[]; v_seen text[] := '{}'; v_total bigint := 0;
begin
  if p_request_id is null or p_package_key is null or p_package_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'
    or (p_expected_revision_hash is not null and p_expected_revision_hash !~ '^[0-9a-f]{64}$')
    or jsonb_typeof(p_manifest) is distinct from 'object'
    or jsonb_typeof(p_artifacts) is distinct from 'array'
    or jsonb_typeof(p_parsed_bindings) is distinct from 'array' then
    raise exception 'INVALID_PREPARATION' using errcode='22023';
  end if;
  if octet_length(p_manifest::text)>262144 or octet_length(p_parsed_bindings::text)>134217728
    or octet_length(p_artifacts::text)>375809638 or jsonb_array_length(p_artifacts)>16
    or jsonb_array_length(p_parsed_bindings)>16
    or p_manifest->>'contractVersion' is distinct from 'yvae-preparation/1'
    or p_manifest->>'schemaVersion' is distinct from 'yvae-preparation/1'
    or p_manifest->>'parserVersion' is distinct from 'yvae-results/2.0'
    or coalesce(p_manifest->>'kind','') not in ('campaign_fragment','bibliography')
    or jsonb_typeof(p_manifest->'files') is distinct from 'array'
    or jsonb_typeof(p_manifest->'dependencies') is distinct from 'array'
    or jsonb_typeof(p_manifest->'scope') is distinct from 'object' then
    raise exception 'INVALID_PREPARATION_MANIFEST' using errcode='22023';
  end if;
  if jsonb_array_length(p_manifest->'files') not between 1 and 16
    or jsonb_array_length(p_manifest->'dependencies')>7 then
    raise exception 'INVALID_PREPARATION_BOUNDS' using errcode='22023';
  end if;
  if p_manifest->>'kind'='bibliography' then
    v_required := array['catalog','evidence','criteria'];
    if p_manifest->'scope' is distinct from '{"type":"global-bibliography"}'::jsonb then
      raise exception 'INVALID_PREPARATION_SCOPE' using errcode='22023';
    end if;
  else
    v_required := array['molecular','catalog','evidence','criteria','indices','components','method'];
    if p_manifest#>>'{scope,type}' is distinct from 'campaigns'
      or jsonb_typeof(p_manifest#>'{scope,campaignCodes}') is distinct from 'array' then
      raise exception 'INVALID_PREPARATION_SCOPE' using errcode='22023';
    end if;
    if jsonb_array_length(p_manifest#>'{scope,campaignCodes}') not between 1 and 64
      or exists(select 1 from jsonb_array_elements_text(p_manifest#>'{scope,campaignCodes}') x where coalesce(x,'') !~ '^C[1-9][0-9]*$')
      or (select count(*)<>count(distinct x) from jsonb_array_elements_text(p_manifest#>'{scope,campaignCodes}') x) then
      raise exception 'INVALID_PREPARATION_SCOPE' using errcode='22023';
    end if;
  end if;
  -- Client state is an assertion, never the source of persisted readiness.
  if p_manifest ? 'state' and coalesce(p_manifest->>'state','') not in ('received','pending','conflict','ready') then
    raise exception 'INVALID_PREPARATION_STATE' using errcode='22023';
  end if;
  v_manifest := p_manifest - 'state';
  for v_file in select value from jsonb_array_elements(v_manifest->'files') loop
    v_source := v_file->>'sha256';
    if v_source is null or v_source !~ '^[0-9a-f]{64}$' or v_source=any(v_seen)
      or coalesce(v_file->>'role','') not in ('full_workbook','molecular','catalog','evidence','criteria','indices','components','method')
      or jsonb_typeof(v_file->'fileName') is distinct from 'string'
      or jsonb_typeof(v_file->'mediaType') is distinct from 'string'
      or coalesce(length(v_file->>'fileName'),0) not between 1 and 512
      or coalesce(length(v_file->>'mediaType'),0) not between 1 and 128 then
      raise exception 'INVALID_PREPARATION_FILE' using errcode='22023';
    end if;
    v_seen := array_append(v_seen,v_source);
  end loop;
  if exists(select 1 from jsonb_array_elements(p_artifacts) a where not coalesce(a->>'sha256'=any(v_seen),false))
    or (select count(*)<>count(distinct a->>'sha256') from jsonb_array_elements(p_artifacts) a)
    or exists(select 1 from jsonb_array_elements(p_parsed_bindings) b where not coalesce(b->>'artifactSha256'=any(v_seen),false))
    or (select count(*)<>count(distinct b->>'artifactSha256') from jsonb_array_elements(p_parsed_bindings) b) then
    raise exception 'INVALID_PREPARATION_BINDING' using errcode='22023';
  end if;
  for v_binding in select value from jsonb_array_elements(p_parsed_bindings) order by value->>'artifactSha256' loop
    if v_binding->>'parserVersion' is distinct from 'yvae-results/2.0'
      or jsonb_typeof(v_binding->'data') is distinct from 'object'
      or jsonb_typeof(v_binding#>'{data,sheets}') is distinct from 'array' then
      raise exception 'INVALID_NORMALIZED_MODEL' using errcode='22023';
    end if;
    if jsonb_array_length(v_binding#>'{data,sheets}') not between 1 and 64 then
      raise exception 'INVALID_NORMALIZED_MODEL' using errcode='22023';
    end if;
    v_names := '{}';
    for v_sheet in select value from jsonb_array_elements(v_binding#>'{data,sheets}') loop
      v_name := case when v_sheet->>'name'='Metadata-C2' then 'Metadados' else v_sheet->>'name' end;
      if coalesce(length(v_name),0) not between 1 and 128 or v_name=any(v_names)
        or jsonb_typeof(v_sheet->'rows') is distinct from 'array' then
        raise exception 'INVALID_NORMALIZED_SHEET' using errcode='22023';
      end if;
      v_names := array_append(v_names,v_name);
      if jsonb_array_length(v_sheet->'rows')>100000 then
        raise exception 'INVALID_NORMALIZED_ROWS' using errcode='22023';
      end if;
      for v_row in select value from jsonb_array_elements(v_sheet->'rows') loop
        if jsonb_typeof(v_row) is distinct from 'array' then
          raise exception 'INVALID_NORMALIZED_ROW' using errcode='22023';
        end if;
        if jsonb_array_length(v_row)>256 then raise exception 'INVALID_NORMALIZED_ROW' using errcode='22023'; end if;
        for v_cell in select value from jsonb_array_elements(v_row) loop
          if jsonb_typeof(v_cell) not in ('string','number','boolean','null') then
            raise exception 'INVALID_NORMALIZED_CELL' using errcode='22023';
          end if;
        end loop;
      end loop;
    end loop;
    v_model_hash := encode(extensions.digest((v_binding->'data')::text,'sha256'),'hex');
    if v_binding ? 'parsedSha256' and v_binding->>'parsedSha256' is distinct from v_model_hash then
      raise exception 'NORMALIZED_HASH_MISMATCH' using errcode='22023';
    end if;
    v_bindings := v_bindings || jsonb_build_array(jsonb_build_object('artifactSha256',v_binding->>'artifactSha256',
      'parserVersion',v_binding->>'parserVersion','parsedSha256',v_model_hash,'data',v_binding->'data'));
  end loop;
  v_fingerprint := encode(extensions.digest(jsonb_build_object('package',p_package_key,'expected',p_expected_revision_hash,
    'manifest',v_manifest,'bindings',v_bindings)::text,'sha256'),'hex');
  -- Global bounded preparation lock also serializes request IDs across packages.
  perform pg_advisory_xact_lock(194821,2);
  select * into v_request from private.results_preparation_requests where request_id=p_request_id;
  if found then
    if v_request.fingerprint<>v_fingerprint then raise exception 'REQUEST_ID_COLLISION' using errcode='22023'; end if;
    return v_request.response;
  end if;
  select revision_hash into v_head from private.results_preparation_heads where package_key=p_package_key;
  if v_head is distinct from p_expected_revision_hash then raise exception 'STALE_PREPARATION' using errcode='40001'; end if;
  for v_artifact in select value from jsonb_array_elements(p_artifacts) loop
    if jsonb_typeof(v_artifact->'originalBase64') is distinct from 'string' then
      raise exception 'INVALID_ARTIFACT_BYTES' using errcode='22023';
    end if;
    v_bytes := decode(v_artifact->>'originalBase64','base64');
    v_total := v_total + octet_length(v_bytes);
    if octet_length(v_bytes) not between 1 and 268435456 or v_total>268435456
      or encode(extensions.digest(v_bytes,'sha256'),'hex') is distinct from v_artifact->>'sha256' then
      raise exception 'ARTIFACT_HASH_MISMATCH' using errcode='22023';
    end if;
    insert into private.results_preparation_artifacts values(v_artifact->>'sha256',v_bytes) on conflict do nothing;
    if not exists(select 1 from private.results_preparation_artifacts where sha256=v_artifact->>'sha256' and original_bytes=v_bytes) then
      raise exception 'ARTIFACT_COLLISION' using errcode='22023';
    end if;
  end loop;
  for v_file in select value from jsonb_array_elements(v_manifest->'files') loop
    if not exists(select 1 from private.results_preparation_artifacts where sha256=v_file->>'sha256') then
      raise exception 'MISSING_ARTIFACT' using errcode='22023';
    end if;
    select value into v_binding from jsonb_array_elements(v_bindings) where value->>'artifactSha256'=v_file->>'sha256';
    if not found then v_missing := true; continue; end if;
    for v_sheet in select value from jsonb_array_elements(v_binding#>'{data,sheets}') loop
      v_role := case v_sheet->>'name' when 'Metadados' then 'molecular' when 'Metadata-C2' then 'molecular'
        when 'Riscos_bibliografia' then 'catalog' when 'Evidencias_risco' then 'evidence'
        when 'Criterios_scores' then 'criteria' when 'Indices_pontos' then 'indices'
        when 'Calculo_conjuntos' then 'components' when 'Metodo_calculo' then 'method' end;
      if v_role is null or not (v_role=any(v_required)) or jsonb_array_length(v_sheet->'rows')<2
        or (v_file->>'role'<>'full_workbook' and v_file->>'role'<>v_role) then continue; end if;
      v_role_source := jsonb_build_object('artifactSha256',v_file->>'sha256','parsedSha256',v_binding->>'parsedSha256');
      if v_roles ? v_role and v_roles->v_role<>v_role_source then v_conflict := true; end if;
      v_roles := v_roles || jsonb_build_object(v_role,v_role_source);
    end loop;
  end loop;
  v_seen := '{}';
  for v_dep in select value from jsonb_array_elements(v_manifest->'dependencies') loop
    v_role := v_dep->>'role';
    if v_role is null or not(v_role=any(v_required)) or v_role=any(v_seen)
      or coalesce(v_dep->>'revisionHash','') !~ '^[0-9a-f]{64}$' then
      raise exception 'INVALID_PREPARATION_DEPENDENCY' using errcode='22023';
    end if;
    v_seen := array_append(v_seen,v_role);
    select * into v_revision from private.results_preparation_revisions where revision_hash=v_dep->>'revisionHash';
    if not found then v_missing := true; continue; end if;
    if v_revision.state='conflict' or not(v_revision.resolved_roles ? v_role) then v_missing:=true; continue; end if;
    if v_revision.manifest->'scope' is distinct from v_manifest->'scope'
      and not(v_role in ('catalog','evidence','criteria') and v_revision.manifest#>>'{scope,type}'='global-bibliography') then
      v_conflict:=true; continue;
    end if;
    v_role_source := v_revision.resolved_roles->v_role;
    if v_roles ? v_role and v_roles->v_role<>v_role_source then v_conflict:=true; end if;
    v_roles := v_roles || jsonb_build_object(v_role,v_role_source);
  end loop;
  v_state := case when v_conflict then 'conflict' when v_bindings='[]'::jsonb and v_roles='{}'::jsonb then 'received'
    when not v_missing and v_roles ?& v_required then 'ready' else 'pending' end;
  v_hash := encode(extensions.digest(jsonb_build_object('package',p_package_key,'parent',v_head,
    'manifest',v_manifest,'bindings',v_bindings,'resolvedRoles',v_roles,'state',v_state)::text,'sha256'),'hex');
  insert into private.results_preparation_revisions values(v_hash,p_package_key,v_head,v_manifest,v_bindings,v_roles,v_state,transaction_timestamp());
  insert into private.results_preparation_heads values(p_package_key,v_hash)
    on conflict(package_key) do update set revision_hash=excluded.revision_hash;
  v_response := jsonb_build_object('packageKey',p_package_key,'revisionHash',v_hash,'state',v_state,
    'resolvedRoles',v_roles,'parsedBindings',v_bindings);
  insert into private.results_preparation_requests values(p_request_id,v_fingerprint,v_response);
  return v_response;
end
$fn$;

create function public.read_results_preparation(p_package_key text,p_revision_hash text default null)
returns jsonb language sql stable security definer set search_path='' as $fn$
  with recursive selected as (
    select r.* from private.results_preparation_heads h join private.results_preparation_revisions r
      on r.revision_hash=coalesce(p_revision_hash,h.revision_hash) and r.package_key=h.package_key
    where h.package_key=p_package_key or (p_package_key is null and p_revision_hash is not null)
  ), pinned as (
    select r.revision_hash from selected r
    union
    select d->>'revisionHash' from pinned p join private.results_preparation_revisions r on r.revision_hash=p.revision_hash
      cross join lateral jsonb_array_elements(r.manifest->'dependencies') d
  )
  select jsonb_build_object('packageKey',r.package_key,'revisionHash',r.revision_hash,'manifest',r.manifest,
    'state',r.state,'parsedBindings',r.parsed_bindings,'resolvedRoles',r.resolved_roles,
    'headRevisionHash',h.revision_hash,'dependencies',coalesce((
      select jsonb_agg(jsonb_build_object('role',d->>'role','revisionHash',dep.revision_hash,
        'parsedBindings',dep.parsed_bindings,'resolvedRoles',dep.resolved_roles))
      from jsonb_array_elements(r.manifest->'dependencies') d
      join private.results_preparation_revisions dep on dep.revision_hash=d->>'revisionHash'
    ),'[]'::jsonb), 'dependencyRevisions',coalesce((
      select jsonb_agg(jsonb_build_object('revisionHash',dep.revision_hash,'manifest',dep.manifest,
        'parsedBindings',dep.parsed_bindings,'resolvedRoles',dep.resolved_roles,'state',dep.state))
      from pinned p join private.results_preparation_revisions dep on dep.revision_hash=p.revision_hash
      where dep.revision_hash<>r.revision_hash
    ),'[]'::jsonb))
  from private.results_preparation_heads h join private.results_preparation_revisions r
    on r.revision_hash=coalesce(p_revision_hash,h.revision_hash) and r.package_key=h.package_key
  where h.package_key=p_package_key or (p_package_key is null and p_revision_hash is not null)
$fn$;
create function public.read_results_preparation_artifact(p_revision_hash text,p_sha256 text)
returns jsonb language sql stable security definer set search_path='' as $fn$
  select jsonb_build_object('sha256',a.sha256,'originalBase64',encode(a.original_bytes,'base64'))
  from private.results_preparation_artifacts a where a.sha256=p_sha256
  and exists(select 1 from private.results_preparation_revisions r,
    lateral jsonb_array_elements(r.manifest->'files') f
    where r.revision_hash=p_revision_hash and f->>'sha256'=a.sha256)
$fn$;
revoke all on function public.save_results_preparation(uuid,text,text,jsonb,jsonb,jsonb),
  public.read_results_preparation(text,text),public.read_results_preparation_artifact(text,text) from public,anon,authenticated;
grant execute on function public.save_results_preparation(uuid,text,text,jsonb,jsonb,jsonb),
  public.read_results_preparation(text,text),public.read_results_preparation_artifact(text,text) to service_role;
