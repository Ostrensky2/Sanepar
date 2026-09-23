-- Cloud legacy compatibility. Additive metadata only: never rewrite results.
-- Dependencies: 20260922161004 and 20260922165113, reviewed as one gate bundle.
-- Source SHA remains NULL when no original binary is available.
-- campaign_hash below fingerprints the stored JSON, NOT an original workbook.
do $guard$
begin
  if exists (
    select r.points->>'campaignNumber'
    from public.lab_risk_results r
    where r.points->>'schemaVersion'='yvae-results/1.0'
      and (r.points->>'campaignNumber',r.points->>'campaignId') in
        (('1','campanha-1-verao-2026'),('2','campanha-2-outono-2026'))
      and not exists(select 1 from private.results_campaign_heads h
        where h.campaign_code='C'||(r.points->>'campaignNumber'))
    group by r.points->>'campaignNumber' having count(*)>1
  ) then
    raise exception 'AMBIGUOUS_LEGACY_CAMPAIGN' using errcode='22023';
  end if;
end
$guard$;

insert into private.results_campaign_heads(campaign_code,publication_id,source_sha256,campaign_hash,updated_at)
select 'C'||(r.points->>'campaignNumber'),r.id,null,
  encode(extensions.digest(convert_to(r.points::text,'UTF8'),'sha256'),'hex'),r.created_at
from public.lab_risk_results r
where r.points->>'schemaVersion'='yvae-results/1.0'
  and (r.points->>'campaignNumber',r.points->>'campaignId') in
    (('1','campanha-1-verao-2026'),('2','campanha-2-outono-2026'))
  and not exists(select 1 from private.results_campaign_heads h
    where h.campaign_code='C'||(r.points->>'campaignNumber'))
on conflict(campaign_code) do nothing;

create or replace function public.read_results_inventory()
returns jsonb language sql stable security definer set search_path='' as $fn$
  select jsonb_build_object(
    'heads',coalesce((select jsonb_object_agg(h.campaign_code,to_jsonb(h.publication_id::text) order by h.campaign_code)
      from private.results_campaign_heads h),'{}'::jsonb),
    'publications',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'file_name',r.file_name,'row_count',r.row_count,'risk_row_count',r.risk_row_count,
      'points',r.points,'created_at',r.created_at) order by r.created_at desc,r.id desc)
      from public.lab_risk_results r),'[]'::jsonb),
    'sourceHashes',coalesce((select jsonb_agg(a.source_sha256 order by a.source_sha256)
      from private.results_source_artifacts a),'[]'::jsonb))
$fn$;

create or replace function public.read_results_source(
  p_campaign_code text,p_publication_id uuid,p_source_sha256 text,p_include_bytes boolean default false
) returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare
  v_code text:=upper(btrim(p_campaign_code));
  v_hash text; v_name text; v_model jsonb; v_parsed jsonb; v_bytes bytea;
begin
  if v_code is null or v_code !~ '^C[1-9][0-9]*$' or p_publication_id is null
    or (p_source_sha256 is not null and lower(p_source_sha256) !~ '^[0-9a-f]{64}$') then
    raise exception 'INVALID_RESULTS_SOURCE_SCOPE' using errcode='22023';
  end if;
  select h.source_sha256 into v_hash from private.results_campaign_heads h
  where h.campaign_code=v_code and h.publication_id=p_publication_id
    and h.source_sha256 is not distinct from lower(p_source_sha256);
  if not found then raise exception 'STALE_SCOPE' using errcode='40001'; end if;
  select a.file_name,a.workbook_model,a.parsed_workbook,a.original_bytes
    into v_name,v_model,v_parsed,v_bytes
    from private.results_source_artifacts a where a.source_sha256=v_hash;
  return jsonb_build_object(
    'sourceSha256',v_hash,'fileName',coalesce(v_name,(select r.file_name from public.lab_risk_results r where r.id=p_publication_id)),
    'availability',case when v_bytes is null then 'missing_source_artifact' else 'available' end,
    'downloadAvailable',v_bytes is not null,'parsed',v_parsed,'model',v_model,
    'currentCampaignCodes',coalesce((select jsonb_agg(h.campaign_code order by h.campaign_code)
      from private.results_campaign_heads h
      where (v_hash is not null and h.source_sha256=v_hash)
        or (v_hash is null and h.source_sha256 is null and h.publication_id=p_publication_id)),'[]'::jsonb),
    'originalBase64',case when coalesce(p_include_bytes,false) and v_bytes is not null then encode(v_bytes,'base64') else null end);
end
$fn$;
revoke all on function public.read_results_inventory(),public.read_results_source(text,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.read_results_inventory(),public.read_results_source(text,uuid,text,boolean) to service_role;
