-- Resumo de cada publicação guardado no momento da gravação.
-- Ler qualquer campo de `points` descomprime o JSON inteiro (até 13 MB por
-- linha histórica); com o resumo pronto, o inventário não toca mais no JSON
-- das publicações fora de vigência. `points` não é alterado.

create or replace function private.results_points_summary(p jsonb)
returns jsonb language sql immutable parallel safe set search_path='' as $fn$
  select case jsonb_typeof(p)
    when 'array' then jsonb_build_object('kind','array','length',jsonb_array_length(p),'hasLegacyRows',false)
    when 'object' then jsonb_build_object(
      'kind','object',
      'schemaVersion',p->>'schemaVersion',
      'contractVersion',p->>'contractVersion',
      'campaignNumber',p->'campaignNumber',
      'campaignId',p->>'campaignId',
      'fileName',p->>'fileName',
      'importedAt',p->>'importedAt',
      'hasLegacyRows',coalesce(jsonb_typeof(p->'molecularRows')='array'
        and jsonb_typeof(p->'rankingRows')='array' and jsonb_typeof(p->'viewModel')='object',false))
    else jsonb_build_object('kind',jsonb_typeof(p),'hasLegacyRows',false)
  end
$fn$;
revoke all on function private.results_points_summary(jsonb) from public,anon,authenticated;

alter table public.lab_risk_results
  add column if not exists points_summary jsonb
  generated always as (private.results_points_summary(points)) stored;

create or replace function public.read_results_inventory()
returns jsonb language sql stable security definer set search_path='' as $fn$
  select jsonb_build_object(
    'heads',coalesce((select jsonb_object_agg(h.campaign_code,to_jsonb(h.publication_id::text) order by h.campaign_code)
      from private.results_campaign_heads h),'{}'::jsonb),
    'publications',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'file_name',r.file_name,'row_count',r.row_count,'risk_row_count',r.risk_row_count,
      'points',case when exists(select 1 from private.results_campaign_heads h where h.publication_id=r.id)
        then r.points else null end,
      'summary',r.points_summary,
      'created_at',r.created_at) order by r.created_at desc,r.id desc)
      from public.lab_risk_results r),'[]'::jsonb),
    'sourceHashes',coalesce((select jsonb_agg(a.source_sha256 order by a.source_sha256)
      from private.results_source_artifacts a),'[]'::jsonb))
$fn$;
revoke all on function public.read_results_inventory() from public,anon,authenticated;
grant execute on function public.read_results_inventory() to service_role;
