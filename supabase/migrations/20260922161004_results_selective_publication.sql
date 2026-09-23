-- Publicação seletiva de campanhas com fonte privada durável, CAS, replay
-- idempotente e vigência explícita. A migration é aditiva e não publica dados.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create table if not exists private.results_source_artifacts (
  source_sha256 text primary key,
  file_name text not null,
  original_bytes bytea not null,
  workbook_model jsonb not null,
  parsed_workbook jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint results_source_artifacts_sha256_format
    check (source_sha256 ~ '^[0-9a-f]{64}$'),
  constraint results_source_artifacts_file_name_bounds
    check (char_length(file_name) between 1 and 512),
  constraint results_source_artifacts_original_bounds
    check (octet_length(original_bytes) between 1 and 268435456),
  constraint results_source_artifacts_model_object
    check (jsonb_typeof(workbook_model) = 'object'),
  constraint results_source_artifacts_parsed_object
    check (jsonb_typeof(parsed_workbook) = 'object')
);

create table if not exists private.results_campaign_heads (
  campaign_code text primary key,
  publication_id uuid not null
    references public.lab_risk_results(id) on update restrict on delete restrict,
  -- Pode não haver artefato binário para publicações anteriores à migration.
  source_sha256 text,
  campaign_hash text not null,
  updated_at timestamptz not null default transaction_timestamp(),
  constraint results_campaign_heads_code_format
    check (campaign_code ~ '^C[1-9][0-9]*$'),
  constraint results_campaign_heads_source_sha_format
    check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
  constraint results_campaign_heads_campaign_hash_format
    check (campaign_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists results_campaign_heads_publication_id_idx
  on private.results_campaign_heads(publication_id);

create table if not exists private.results_publish_requests (
  request_id uuid primary key,
  request_fingerprint text not null unique,
  publication_id uuid not null
    references public.lab_risk_results(id) on update restrict on delete restrict,
  source_sha256 text not null
    references private.results_source_artifacts(source_sha256) on update restrict on delete restrict,
  selected_campaign_codes text[] not null,
  response jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  constraint results_publish_requests_fingerprint_format
    check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint results_publish_requests_campaigns_nonempty
    check (cardinality(selected_campaign_codes) > 0),
  constraint results_publish_requests_response_object
    check (jsonb_typeof(response) = 'object')
);

alter table private.results_source_artifacts enable row level security;
alter table private.results_source_artifacts force row level security;
alter table private.results_campaign_heads enable row level security;
alter table private.results_campaign_heads force row level security;
alter table private.results_publish_requests enable row level security;
alter table private.results_publish_requests force row level security;

revoke all on table
  private.results_source_artifacts,
  private.results_campaign_heads,
  private.results_publish_requests
from public, anon, authenticated, service_role;

-- Bootstrap somente V2 reconhecido. A linha mais nova por campanha vence de
-- forma determinística; nenhuma linha histórica de lab_risk_results é alterada.
with candidates as (
  select
    upper(btrim(campaign.value->>'campaignCode')) as campaign_code,
    result.id as publication_id,
    case
      when lower(result.points->'source'->>'sha256') ~ '^[0-9a-f]{64}$'
      then lower(result.points->'source'->>'sha256')
      else null
    end as source_sha256,
    case
      when lower(result.points->'scope'->'campaignHashes'->>upper(btrim(campaign.value->>'campaignCode'))) ~ '^[0-9a-f]{64}$'
      then lower(result.points->'scope'->'campaignHashes'->>upper(btrim(campaign.value->>'campaignCode')))
      else encode(extensions.digest(convert_to(jsonb_build_object(
        'calculationVersion', result.points->'calculationVersion',
        'catalogVersion', result.points->'catalogVersion',
        'campaign', campaign.value
      )::text, 'UTF8'), 'sha256'), 'hex')
    end as campaign_hash,
    result.created_at,
    row_number() over (
      partition by upper(btrim(campaign.value->>'campaignCode'))
      order by result.created_at desc, result.id desc
    ) as precedence
  from public.lab_risk_results as result
  cross join lateral jsonb_array_elements(result.points->'campaigns') as campaign(value)
  where result.points->>'contractVersion' = 'yvae-results/2.0'
    and upper(btrim(campaign.value->>'campaignCode')) ~ '^C[1-9][0-9]*$'
)
insert into private.results_campaign_heads (
  campaign_code,
  publication_id,
  source_sha256,
  campaign_hash,
  updated_at
)
select campaign_code, publication_id, source_sha256, campaign_hash, created_at
from candidates
where precedence = 1
  and campaign_hash ~ '^[0-9a-f]{64}$'
on conflict (campaign_code) do nothing;

create or replace function public.publish_results_snapshot(
  p_publication jsonb,
  p_source_base64 text,
  p_model jsonb,
  p_parsed jsonb,
  p_expected_heads jsonb,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_source bytea;
  v_source_sha256 text;
  v_file_name text;
  v_publication_id uuid;
  v_selected text[];
  v_campaign_hashes jsonb;
  v_actual_heads jsonb;
  v_request_fingerprint text;
  v_existing_fingerprint text;
  v_response jsonb;
  v_row_count integer;
  v_risk_row_count integer;
  v_inserted integer;
begin
  if p_request_id is null
     or p_publication is null or jsonb_typeof(p_publication) <> 'object'
     or p_model is null or jsonb_typeof(p_model) <> 'object'
     or p_parsed is null or jsonb_typeof(p_parsed) <> 'object'
     or p_expected_heads is null or jsonb_typeof(p_expected_heads) <> 'object'
     or p_source_base64 is null
     or char_length(p_source_base64) < 4
     or char_length(p_source_base64) > 357913944
     or char_length(p_source_base64) % 4 <> 0
     or p_source_base64 !~ '^[A-Za-z0-9+/]*={0,2}$' then
    raise exception 'INVALID_RESULTS_PUBLISH_INPUT' using errcode = '22023';
  end if;

  begin
    v_source := decode(p_source_base64, 'base64');
    v_publication_id := (p_publication->>'publicationId')::uuid;
  exception when others then
    raise exception 'INVALID_RESULTS_PUBLISH_INPUT' using errcode = '22023';
  end;

  if octet_length(v_source) < 1 or octet_length(v_source) > 268435456 then
    raise exception 'INVALID_RESULTS_SOURCE_SIZE' using errcode = '22023';
  end if;

  v_source_sha256 := lower(encode(extensions.digest(v_source, 'sha256'), 'hex'));
  v_file_name := btrim(p_publication->'source'->>'fileName');
  v_campaign_hashes := p_publication->'scope'->'campaignHashes';

  if p_publication->>'contractVersion' is distinct from 'yvae-results/2.0'
     or v_publication_id is null
     or p_publication->>'calculationVersion' is null
     or p_publication->>'catalogVersion' is null
     or p_publication->'source'->>'sha256' is null
     or lower(p_publication->'source'->>'sha256') <> v_source_sha256
     or lower(p_parsed->'source'->>'sha256') is distinct from v_source_sha256
     or v_file_name is null or char_length(v_file_name) not between 1 and 512
     or jsonb_typeof(p_publication->'campaigns') is distinct from 'array'
     or jsonb_array_length(p_publication->'campaigns') = 0
     or jsonb_typeof(p_publication->'scope'->'campaignCodes') is distinct from 'array'
     or jsonb_typeof(v_campaign_hashes) is distinct from 'object' then
    raise exception 'INVALID_RESULTS_PUBLICATION' using errcode = '22023';
  end if;

  select array_agg(code order by ordinal), count(*)
  into v_selected, v_row_count
  from (
    select upper(btrim(value)) as code, ordinality as ordinal
    from jsonb_array_elements_text(p_publication->'scope'->'campaignCodes')
      with ordinality as selected(value, ordinality)
  ) as normalized;

  if v_selected is null
     or cardinality(v_selected) <> jsonb_array_length(p_publication->'campaigns')
     or exists (
       select 1 from unnest(v_selected) as code where code is null or code !~ '^C[1-9][0-9]*$'
     )
     or cardinality(v_selected) <> (select count(distinct code) from unnest(v_selected) as code)
     or v_selected <> (select array_agg(code order by code) from unnest(v_selected) as code)
     or v_selected <> (
       select array_agg(upper(btrim(campaign->>'campaignCode')) order by upper(btrim(campaign->>'campaignCode')))
       from jsonb_array_elements(p_publication->'campaigns') as campaign
     )
     or (select count(*) from jsonb_object_keys(v_campaign_hashes)) <> cardinality(v_selected)
     or (select count(*) from jsonb_object_keys(p_expected_heads)) <> cardinality(v_selected)
     or exists (
       select 1
       from unnest(v_selected) as code
       where not v_campaign_hashes ? code
          or jsonb_typeof(v_campaign_hashes->code) is distinct from 'string'
          or lower(v_campaign_hashes->>code) !~ '^[0-9a-f]{64}$'
          or not p_expected_heads ? code
          or (
            jsonb_typeof(p_expected_heads->code) <> 'null'
            and (
              jsonb_typeof(p_expected_heads->code) <> 'string'
              or (p_expected_heads->>code) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            )
          )
     )
     or exists (
       select 1 from jsonb_object_keys(v_campaign_hashes) as key where not key = any(v_selected)
     )
     or exists (
       select 1 from jsonb_object_keys(p_expected_heads) as key where not key = any(v_selected)
     ) then
    raise exception 'INVALID_RESULTS_SCOPE' using errcode = '22023';
  end if;

  v_row_count := (p_publication->>'molecularRecordCount')::integer;
  select coalesce(sum(jsonb_array_length(campaign->'points')), 0)::integer
  into v_risk_row_count
  from jsonb_array_elements(p_publication->'campaigns') as campaign
  where jsonb_typeof(campaign->'points') = 'array';

  if v_row_count is null or v_row_count < 0
     or exists (
       select 1 from jsonb_array_elements(p_publication->'campaigns') as campaign
       where jsonb_typeof(campaign->'points') is distinct from 'array'
     ) then
    raise exception 'INVALID_RESULTS_COUNTS' using errcode = '22023';
  end if;

  v_request_fingerprint := encode(extensions.digest(
    convert_to(jsonb_build_object(
      'publication', p_publication - 'publishedAt',
      'sourceSha256', v_source_sha256,
      'modelSha256', encode(extensions.digest(convert_to(p_model::text, 'UTF8'), 'sha256'), 'hex'),
      'parsedSha256', encode(extensions.digest(convert_to(p_parsed::text, 'UTF8'), 'sha256'), 'hex'),
      'expectedHeads', p_expected_heads
    )::text, 'UTF8'),
    'sha256'
  ), 'hex');

  -- Uma trava global mantém curta e determinística a ordem de CAS, replay e
  -- atualização de múltiplas campanhas sobre um único snapshot.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('yvae.results.publish', 0));

  select request.request_fingerprint, request.response
  into v_existing_fingerprint, v_response
  from private.results_publish_requests as request
  where request.request_id = p_request_id;

  if found then
    if v_existing_fingerprint <> v_request_fingerprint then
      raise exception 'IDEMPOTENCY_KEY_REUSED' using errcode = '22023';
    end if;
    return v_response;
  end if;

  select request.response
  into v_response
  from private.results_publish_requests as request
  where request.request_fingerprint = v_request_fingerprint;

  if found then
    return v_response;
  end if;

  select coalesce(
    jsonb_object_agg(selected.code, to_jsonb(head.publication_id::text)),
    '{}'::jsonb
  )
  into v_actual_heads
  from unnest(v_selected) as selected(code)
  left join private.results_campaign_heads as head
    on head.campaign_code = selected.code;

  if v_actual_heads <> p_expected_heads then
    raise exception 'RESULTS_HEAD_CONFLICT'
      using errcode = '40001', detail = 'selected campaign heads changed';
  end if;

  insert into private.results_source_artifacts (
    source_sha256, file_name, original_bytes, workbook_model, parsed_workbook
  ) values (
    v_source_sha256, v_file_name, v_source, p_model, p_parsed
  )
  on conflict (source_sha256) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 and not exists (
    select 1
    from private.results_source_artifacts as artifact
    where artifact.source_sha256 = v_source_sha256
      and artifact.file_name = v_file_name
      and artifact.original_bytes = v_source
      and artifact.workbook_model = p_model
      and artifact.parsed_workbook = p_parsed
  ) then
    raise exception 'SOURCE_ARTIFACT_CONFLICT' using errcode = '23505';
  end if;

  insert into public.lab_risk_results (
    id, file_name, row_count, risk_row_count, points
  ) values (
    v_publication_id, v_file_name, v_row_count, v_risk_row_count, p_publication
  );

  insert into private.results_campaign_heads (
    campaign_code, publication_id, source_sha256, campaign_hash, updated_at
  )
  select
    code,
    v_publication_id,
    v_source_sha256,
    lower(v_campaign_hashes->>code),
    transaction_timestamp()
  from unnest(v_selected) as selected(code)
  on conflict (campaign_code) do update
  set publication_id = excluded.publication_id,
      source_sha256 = excluded.source_sha256,
      campaign_hash = excluded.campaign_hash,
      updated_at = excluded.updated_at;

  v_response := jsonb_build_object(
    'state', 'published',
    'requestId', p_request_id,
    'publicationId', v_publication_id,
    'sourceSha256', v_source_sha256,
    'selectedCampaignCodes', to_jsonb(v_selected),
    'heads', (
      select jsonb_object_agg(code, to_jsonb(v_publication_id::text))
      from unnest(v_selected) as selected(code)
    )
  );

  insert into private.results_publish_requests (
    request_id,
    request_fingerprint,
    publication_id,
    source_sha256,
    selected_campaign_codes,
    response
  ) values (
    p_request_id,
    v_request_fingerprint,
    v_publication_id,
    v_source_sha256,
    v_selected,
    v_response
  );

  return v_response;
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_RESULTS_PUBLISH_INPUT' using errcode = '22023';
end
$function$;

create or replace function public.read_results_inventory()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'heads', coalesce((
      select jsonb_object_agg(head.campaign_code, to_jsonb(head.publication_id::text) order by head.campaign_code)
      from private.results_campaign_heads as head
    ), '{}'::jsonb),
    'publications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', result.id,
        'points', result.points,
        'created_at', result.created_at
      ) order by result.created_at desc, result.id desc)
      from public.lab_risk_results as result
      where result.points->>'contractVersion' = 'yvae-results/2.0'
    ), '[]'::jsonb),
    'sourceHashes', coalesce((
      select jsonb_agg(artifact.source_sha256 order by artifact.source_sha256)
      from private.results_source_artifacts as artifact
    ), '[]'::jsonb)
  )
$function$;

create or replace function public.read_results_source(
  p_campaign_code text,
  p_publication_id uuid,
  p_source_sha256 text,
  p_include_bytes boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_campaign_code text := upper(btrim(p_campaign_code));
  v_head_source_sha256 text;
  v_file_name text;
  v_model jsonb;
  v_parsed jsonb;
  v_original bytea;
begin
  if v_campaign_code !~ '^C[1-9][0-9]*$'
     or p_publication_id is null
     or p_source_sha256 is null
     or lower(p_source_sha256) !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_RESULTS_SOURCE_SCOPE' using errcode = '22023';
  end if;

  select head.source_sha256
  into v_head_source_sha256
  from private.results_campaign_heads as head
  where head.campaign_code = v_campaign_code
    and head.publication_id = p_publication_id
    and head.source_sha256 = lower(p_source_sha256);

  if not found then
    raise exception 'STALE_SCOPE' using errcode = '40001';
  end if;

  select artifact.file_name, artifact.workbook_model,
         artifact.parsed_workbook, artifact.original_bytes
  into v_file_name, v_model, v_parsed, v_original
  from private.results_source_artifacts as artifact
  where artifact.source_sha256 = v_head_source_sha256;

  return jsonb_build_object(
    'sourceSha256', v_head_source_sha256,
    'fileName', coalesce(v_file_name, (
      select result.file_name from public.lab_risk_results as result
      where result.id = p_publication_id
    )),
    'currentCampaignCodes', coalesce((
      select jsonb_agg(head.campaign_code order by head.campaign_code)
      from private.results_campaign_heads as head
      where head.source_sha256 = v_head_source_sha256
    ), '[]'::jsonb),
    'downloadAvailable', v_original is not null,
    'parsed', v_parsed,
    'model', v_model,
    'originalBase64', case
      when coalesce(p_include_bytes, false) and v_original is not null
      then encode(v_original, 'base64')
      else null
    end
  );
end
$function$;

revoke all on function public.publish_results_snapshot(jsonb, text, jsonb, jsonb, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.read_results_inventory()
  from public, anon, authenticated;
revoke all on function public.read_results_source(text, uuid, text, boolean)
  from public, anon, authenticated;

grant execute on function public.publish_results_snapshot(jsonb, text, jsonb, jsonb, jsonb, uuid)
  to service_role;
grant execute on function public.read_results_inventory()
  to service_role;
grant execute on function public.read_results_source(text, uuid, text, boolean)
  to service_role;
