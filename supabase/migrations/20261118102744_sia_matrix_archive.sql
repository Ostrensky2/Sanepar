create table if not exists private.sia_matrix_groups (
  -- [campaign, sia, diary entry, marker, run, rank, sheet]
  scope jsonb primary key check (jsonb_typeof(scope)='array' and jsonb_array_length(scope)=7),
  counts jsonb not null check (jsonb_typeof(counts)='object'),
  version bigint not null check (version>0)
);
create table if not exists private.sia_matrix_commits (
  request_id uuid primary key, actor_id uuid not null, plan_hash text not null,
  receipt jsonb not null, created_at timestamptz not null default now()
);
alter table private.sia_matrix_groups enable row level security;
alter table private.sia_matrix_groups force row level security;
alter table private.sia_matrix_commits enable row level security;
alter table private.sia_matrix_commits force row level security;
revoke all on private.sia_matrix_groups,private.sia_matrix_commits from public,anon,authenticated,service_role;

-- Mirror campaign-identity.ts for the canonical 1..9 campaigns.
create or replace function private.sia_matrix_campaign(v text) returns integer
language sql immutable strict set search_path='' as $$
  select case when n ~ '^campanha-([1-9]|1-verao-2026|2-outono-2026)$' then substr(n,10,1)::integer
    when n ~ '^[1-9]$' then n::integer else coalesce(
    substring(n from '([0-9]+)[[:space:]]*[aªº]?[[:space:]]*campanha'),
    substring(n from 'campanha[[:space:]]*([0-9]+)'))::numeric end::integer
  from (select lower(btrim(v)) n) t
$$;
create or replace function private.sia_matrix_status_text(v text) returns text
language sql immutable set search_path='' as $$
  select regexp_replace(translate(lower(btrim(coalesce(v,''))),
    'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc'),'[_[:space:]]+',' ','g')
$$;
revoke all on function private.sia_matrix_campaign(text),private.sia_matrix_status_text(text) from public,anon,authenticated,service_role;

-- Only fields consumed by the collection resolver participate in this guard.
create or replace function private.sia_matrix_diary_revision(c integer) returns text
language sql stable set search_path='' as $$
  select encode(extensions.digest(coalesce(string_agg(jsonb_build_array(d.id,d.campaign_id,d.campaign_name,d.sia,
    d.execution_status,d.activities,d.has_occurrence,d.occurrence_type,d.collection_time,d.samples_replicas_edna,d.zooplankton_id)::text,
    chr(10) order by d.id),''),'sha256'),'hex') from public.field_diary_entries d
    where c in (private.sia_matrix_campaign(d.campaign_id),private.sia_matrix_campaign(d.campaign_name))
$$;
revoke all on function private.sia_matrix_diary_revision(integer) from public,anon,authenticated,service_role;

create or replace function public.sia_matrix_archive(p_mode text,p_sheets jsonb,p_actor uuid,
  p_request uuid default null,p_expected text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  s jsonb; r jsonb; k jsonb; incoming jsonb; old private.sia_matrix_groups%rowtype;
  past private.sia_matrix_commits%rowtype; hashes text[]:='{}'; keys_seen jsonb:='{}';
  details jsonb:='[]'; detail jsonb; detail_bytes integer:=2; delta jsonb; token text; payload_hash text; response jsonb;
  n_new int:=0; n_changed int:=0; n_same int:=0; replay boolean:=false; diary_before text; guard_start timestamptz;
  group_bytes integer; merged_bytes integer:=0;
begin
  if p_actor is null or p_actor='00000000-0000-0000-0000-000000000000' or p_mode is null or p_mode not in ('preview','apply')
    or jsonb_typeof(p_sheets) is distinct from 'array' or jsonb_array_length(p_sheets) not between 1 and 64
    or octet_length(p_sheets::text)>8388608 then raise exception 'INVALID_INPUT'; end if;
  if (select count(distinct x->>'campaign') from jsonb_array_elements(p_sheets) x)<>1 then
    raise exception 'ONE_CAMPAIGN_REQUIRED';
  end if;
  if (select sum(jsonb_array_length(x->'rows'))>32 or
      sum(jsonb_array_length(x->'rows')::bigint*jsonb_array_length(x->'headers'))>16000
      from jsonb_array_elements(p_sheets) x) then raise exception 'BATCH_TOO_LARGE'; end if;
  if p_mode='apply' then
    if p_request is null or p_expected is null or p_expected !~ '^[0-9a-f]{64}$' then raise exception 'CONFIRMATION_REQUIRED'; end if;
    -- Every writer enters the same archive-specific critical section, including first inserts.
    if not pg_try_advisory_xact_lock(719442,20261118) then raise exception 'ARCHIVE_BUSY' using errcode='55P03'; end if;
    select * into past from private.sia_matrix_commits where request_id=p_request;
    replay:=found;
    if replay and (past.actor_id<>p_actor or past.plan_hash<>p_expected) then raise exception 'REQUEST_CONFLICT'; end if;
    if not replay then
      if current_setting('transaction_isolation')<>'read committed' then raise exception 'READ_COMMITTED_REQUIRED'; end if;
      diary_before:=private.sia_matrix_diary_revision((p_sheets#>>'{0,campaign}')::integer);
      if public.sia_matrix_archive('preview',p_sheets,p_actor)->>'planDigest' is distinct from p_expected then
        raise exception 'STALE_PLAN' using errcode='40001';
      end if;
    end if;
  end if;
  for s in select value from jsonb_array_elements(p_sheets) loop
    if not (s ?& array['campaign','marker','rank','sheet','run','headers','rows']) or
      (s->>'campaign' ~ '^[1-9]$' and s->>'marker' in ('16S','COI') and s->>'rank' in ('familias','generos')
       and s->>'sheet' in ('matrix','associations') and s->>'run' ~ '^[a-z0-9][a-z0-9._-]{0,79}$'
       and jsonb_array_length(s->'headers') between 1 and 6000 and jsonb_array_length(s->'rows') between 1 and 2000) is not true
      then raise exception 'INVALID_SHEET'; end if;
    if exists(select 1 from jsonb_array_elements(s->'headers') h(v) group by v having count(*)>1
      or jsonb_typeof(v)<>'string' or length(btrim(v#>>'{}')) not between 1 and 512) then raise exception 'INVALID_HEADERS'; end if;
    for r in select value from jsonb_array_elements(s->'rows') loop
      if (r->>'sia' ~ '^SIA-([0-9]{4}|[1-9][0-9]{4,15})$' and r->>'sia'<>'SIA-0000' and length(btrim(r->>'collection')) between 1 and 160
        and jsonb_array_length(r->'values')=jsonb_array_length(s->'headers')) is not true then raise exception 'INVALID_ROW'; end if;
      if not replay and (select case when bool_or(
          (nullif(btrim(d.campaign_id),'') is not null and private.sia_matrix_campaign(d.campaign_id) is distinct from (s->>'campaign')::int)
          or (nullif(btrim(d.campaign_name),'') is not null and private.sia_matrix_campaign(d.campaign_name) is distinct from (s->>'campaign')::int))
        then null else array_agg(d.id) filter(where case
          when nullif(btrim(d.execution_status),'') is not null then d.execution_status in ('realized','relocated')
          when exists(select from unnest(d.activities) a where private.sia_matrix_status_text(a)='coleta nao realizada')
            or (d.has_occurrence is distinct from false and private.sia_matrix_status_text(d.occurrence_type)='coleta nao realizada') then false
          else exists(select from unnest(coalesce(d.activities,'{}') || array[d.collection_time,d.samples_replicas_edna,d.zooplankton_id]) a
            where btrim(private.sia_matrix_status_text(a)) not in ('','nao informado')) end) end
        from public.field_diary_entries d
        where (s->>'campaign')::int in (private.sia_matrix_campaign(d.campaign_id),private.sia_matrix_campaign(d.campaign_name))
          and upper(btrim(d.sia)) ~ '^(SIA[-[:space:]]*)?[0-9]+$'
          and ltrim(regexp_replace(upper(btrim(d.sia)),'^(SIA[-[:space:]]*)?0*',''),'0')=ltrim(substr(r->>'sia',5),'0')
          ) is distinct from array[r->>'collection']
        then raise exception 'UNCONFIRMED_COLLECTION'; end if;
      select jsonb_object_agg(header,val) into incoming
        from rows from (jsonb_array_elements_text(s->'headers'),jsonb_array_elements(r->'values')) as cells(header,val)
        where jsonb_typeof(val)='number' and val::text ~ '^[0-9]{1,16}$' and (val::text)::numeric<=9007199254740991;
      if incoming is null or (select count(*) from jsonb_object_keys(incoming))<>jsonb_array_length(s->'headers') then raise exception 'INVALID_READS'; end if;
      k:=jsonb_build_array((s->>'campaign')::int,r->>'sia',r->>'collection',s->>'marker',s->>'run',s->>'rank',s->>'sheet');
      if keys_seen ? k::text then raise exception 'DUPLICATE_SCOPE'; end if;
      keys_seen:=keys_seen || jsonb_build_object(k::text,true);
      hashes:=array_append(hashes,encode(extensions.digest(jsonb_build_array(k,incoming)::text,'sha256'),'hex'));
      if replay then continue; end if;
      select * into old from private.sia_matrix_groups where scope=k;
      -- Same single-row envelope and initial page overhead as sia_matrix_archive_page.
      -- Keep the actual version for a no-op, including at a decimal boundary.
      group_bytes:=octet_length(jsonb_build_object('scope',k,
        'counts',coalesce(old.counts,'{}'::jsonb)||incoming,
        'version',case when old.counts @> incoming then old.version else coalesce(old.version,0)+1 end
      )::text);
      if 256+group_bytes>3500000 then raise exception 'GROUP_TOO_LARGE'; end if;
      merged_bytes:=merged_bytes+group_bytes;
      if merged_bytes>4000000 then raise exception 'BATCH_TOO_LARGE'; end if;
      if old.version is null then delta:=incoming;
      else
        select coalesce(jsonb_object_agg(e.key,jsonb_build_array(stored.value,e.value)),'{}')
          into delta from jsonb_each(incoming) e left join jsonb_each(old.counts) stored using(key)
          where stored.value is distinct from e.value;
      end if;
      if old.version is null then n_new:=n_new+1;
      elsif delta<>'{}' then n_changed:=n_changed+1;
      else n_same:=n_same+1; end if;
      keys_seen:=jsonb_set(keys_seen,array[k::text],to_jsonb(coalesce(old.version,0)));
      if delta<>'{}' then
        detail:=jsonb_build_object('scope',k,'expectedVersion',coalesce(old.version,0),
          'changes',case when old.version is null then null else delta end);
        detail_bytes:=detail_bytes+octet_length(detail::text)+2;
        if detail_bytes>1999000 then raise exception 'DIFF_TOO_LARGE'; end if;
        details:=details || jsonb_build_array(detail);
        if p_mode='apply' then
          insert into private.sia_matrix_groups values(k,incoming,1)
            on conflict(scope) do update set counts=private.sia_matrix_groups.counts||excluded.counts,version=private.sia_matrix_groups.version+1;
        end if;
      end if;
    end loop;
  end loop;
  select encode(extensions.digest(string_agg(h,'' order by h),'sha256'),'hex') into payload_hash from unnest(hashes) h;
  if replay then
    if past.receipt->>'payloadHash'<>payload_hash then raise exception 'REQUEST_CONFLICT'; end if;
    return past.receipt;
  end if;
  token:=encode(extensions.digest(jsonb_build_array(p_actor,keys_seen,payload_hash)::text,'sha256'),'hex');
  if p_mode='apply' and token<>p_expected then raise exception 'STALE_PLAN' using errcode='40001'; end if;
  response:=jsonb_build_object('planDigest',token,'payloadHash',payload_hash,'new',n_new,'changed',n_changed,'unchanged',n_same,'details',details);
  -- apply runs the complete bounded preview under the archive lock before the first INSERT.
  if octet_length(response::text)>2000000 then raise exception 'DIFF_TOO_LARGE'; end if;
  if p_mode='apply' and n_new+n_changed>0 then
    -- Acquire only at commit time. A concurrent diary writer or changed resolver inputs
    -- invalidate this whole transaction, including any provisional archive rows.
    guard_start:=clock_timestamp();
    lock table public.field_diary_entries in share mode nowait;
    if private.sia_matrix_diary_revision((p_sheets#>>'{0,campaign}')::integer) is distinct from diary_before then
      raise exception 'STALE_PLAN' using errcode='40001';
    end if;
    insert into private.sia_matrix_commits values(p_request,p_actor,token,response,now());
    raise debug 'SIA diary final guard to receipt: %',clock_timestamp()-guard_start;
  end if;
  return response;
end $$;
create or replace function public.sia_matrix_archive_page(p_campaign integer,p_after jsonb default null,p_limit integer default 20,p_revision text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  revision text; entries jsonb:='[]'; candidate jsonb; item jsonb; cursor_key jsonb; bytes integer:=256;
begin
  select encode(extensions.digest(p_campaign::text||':'||coalesce(string_agg(jsonb_build_array(g.scope,g.version)::text,chr(10) order by g.scope),''),'sha256'),'hex')
    into revision from private.sia_matrix_groups g where g.scope->0=to_jsonb(p_campaign);
  if (p_after is not null or p_revision is not null) and p_revision is distinct from revision then raise exception 'STALE_PAGE' using errcode='40001'; end if;
  for candidate in select to_jsonb(g) from private.sia_matrix_groups g where g.scope->0=to_jsonb(p_campaign)
    and (p_after is null or g.scope>p_after) order by g.scope limit least(greatest(coalesce(p_limit,20),1),50)+1 loop
    if jsonb_array_length(entries)>=least(greatest(coalesce(p_limit,20),1),50) or bytes+octet_length(candidate::text)>3500000 then
      if item is null then raise exception 'GROUP_TOO_LARGE'; end if;
      cursor_key:=item->'scope'; exit;
    end if;
    entries:=entries||jsonb_build_array(candidate); item:=candidate; bytes:=bytes+octet_length(candidate::text)+2;
  end loop;
  return jsonb_build_object('revision',revision,'rows',entries,'nextAfter',cursor_key);
end
$$;
revoke all on function public.sia_matrix_archive(text,jsonb,uuid,uuid,text),public.sia_matrix_archive_page(integer,jsonb,integer,text) from public,anon,authenticated;
grant execute on function public.sia_matrix_archive(text,jsonb,uuid,uuid,text),public.sia_matrix_archive_page(integer,jsonb,integer,text) to service_role;
