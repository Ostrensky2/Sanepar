-- Resumo do histórico em uma única leitura por publicação.
-- A versão anterior extraía cada campo com um operador próprio sobre `points`,
-- e cada operador descomprimia o JSON integral (até 13 MB por linha). Aqui o
-- topo do objeto é lido uma vez por jsonb_each, trocando valores aninhados pelo
-- nome do tipo; o resumo sai desse objeto pequeno. Mesmo contrato de saída.

create or replace function public.read_results_inventory()
returns jsonb language sql stable security definer set search_path='' as $fn$
  with summarized as (
    select r.id,r.file_name,r.row_count,r.risk_row_count,r.created_at,
      case when exists(select 1 from private.results_campaign_heads h where h.publication_id=r.id)
        then r.points else null end as head_points,
      s.kind,s.len,s.top
    from public.lab_risk_results r
    cross join lateral (
      select t.kind,
        case when t.kind='array' then jsonb_array_length(r.points) end as len,
        case when t.kind='object' then (
          select jsonb_object_agg(e.key,case when jsonb_typeof(e.value) in ('object','array')
            then to_jsonb(jsonb_typeof(e.value)) else e.value end)
          from jsonb_each(r.points) e) end as top
      from (select jsonb_typeof(r.points) as kind) t
    ) s
  )
  select jsonb_build_object(
    'heads',coalesce((select jsonb_object_agg(h.campaign_code,to_jsonb(h.publication_id::text) order by h.campaign_code)
      from private.results_campaign_heads h),'{}'::jsonb),
    'publications',coalesce((select jsonb_agg(jsonb_build_object(
      'id',x.id,'file_name',x.file_name,'row_count',x.row_count,'risk_row_count',x.risk_row_count,
      'points',x.head_points,
      'summary',jsonb_build_object(
        'kind',x.kind,
        'length',x.len,
        'schemaVersion',x.top->>'schemaVersion',
        'contractVersion',x.top->>'contractVersion',
        'campaignNumber',x.top->'campaignNumber',
        'campaignId',x.top->>'campaignId',
        'fileName',x.top->>'fileName',
        'importedAt',x.top->>'importedAt',
        'hasLegacyRows',coalesce(x.top->>'molecularRows'='array' and x.top->>'rankingRows'='array'
          and x.top->>'viewModel'='object',false)),
      'created_at',x.created_at) order by x.created_at desc,x.id desc)
      from summarized x),'[]'::jsonb),
    'sourceHashes',coalesce((select jsonb_agg(a.source_sha256 order by a.source_sha256)
      from private.results_source_artifacts a),'[]'::jsonb))
$fn$;
revoke all on function public.read_results_inventory() from public,anon,authenticated;
grant execute on function public.read_results_inventory() to service_role;
