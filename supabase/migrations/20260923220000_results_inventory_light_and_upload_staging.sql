-- Inventário leve + área privada de envio direto de planilhas de Resultados.
--
-- 1) read_results_inventory devolvia o JSON integral de TODAS as publicações
--    (~19,6 MB em 23/09/2026, quase tudo histórico fora de vigência). Chamadas
--    simultâneas da página inicial derrubavam a API (Cloudflare 520 -> app 503).
--    Agora só as publicações vigentes (apontadas por heads) trazem `points`;
--    as demais trazem apenas `summary`, suficiente para inventário/histórico.
--    Nenhum dado é alterado: somente a forma de leitura.
-- 2) Bucket privado `results-uploads`: o navegador envia a planilha direto ao
--    Storage por URL assinada, contornando o limite de 4,5 MB de corpo das
--    funções da Vercel. Sem políticas para anon/authenticated: só URL assinada
--    emitida pelo servidor (service_role) grava, e só o servidor lê.

create or replace function public.read_results_inventory()
returns jsonb language sql stable security definer set search_path='' as $fn$
  select jsonb_build_object(
    'heads',coalesce((select jsonb_object_agg(h.campaign_code,to_jsonb(h.publication_id::text) order by h.campaign_code)
      from private.results_campaign_heads h),'{}'::jsonb),
    'publications',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'file_name',r.file_name,'row_count',r.row_count,'risk_row_count',r.risk_row_count,
      'points',case when exists(select 1 from private.results_campaign_heads h where h.publication_id=r.id)
        then r.points else null end,
      'summary',jsonb_build_object(
        'kind',jsonb_typeof(r.points),
        'length',case when jsonb_typeof(r.points)='array' then jsonb_array_length(r.points) end,
        'schemaVersion',case when jsonb_typeof(r.points)='object' then r.points->>'schemaVersion' end,
        'contractVersion',case when jsonb_typeof(r.points)='object' then r.points->>'contractVersion' end,
        'campaignNumber',case when jsonb_typeof(r.points)='object' then r.points->'campaignNumber' end,
        'campaignId',case when jsonb_typeof(r.points)='object' then r.points->>'campaignId' end,
        'fileName',case when jsonb_typeof(r.points)='object' then r.points->>'fileName' end,
        'importedAt',case when jsonb_typeof(r.points)='object' then r.points->>'importedAt' end,
        'hasLegacyRows',case when jsonb_typeof(r.points)='object' then
          jsonb_typeof(r.points->'molecularRows')='array' and jsonb_typeof(r.points->'rankingRows')='array'
          and jsonb_typeof(r.points->'viewModel')='object' else false end),
      'created_at',r.created_at) order by r.created_at desc,r.id desc)
      from public.lab_risk_results r),'[]'::jsonb),
    'sourceHashes',coalesce((select jsonb_agg(a.source_sha256 order by a.source_sha256)
      from private.results_source_artifacts a),'[]'::jsonb))
$fn$;
revoke all on function public.read_results_inventory() from public,anon,authenticated;
grant execute on function public.read_results_inventory() to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'results-uploads',
  'results-uploads',
  false,
  26214400,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
