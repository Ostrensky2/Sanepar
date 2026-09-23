-- Teste isolado PostgreSQL da publicação seletiva. Usa somente fixtures.
\set ON_ERROR_STOP on

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$roles$;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.lab_risk_results (
  id uuid primary key default gen_random_uuid(),
  file_name text not null default '',
  row_count integer not null default 0,
  risk_row_count integer not null default 0,
  points jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.lab_risk_results(id,file_name,row_count,risk_row_count,points,created_at)
values (
  '00000000-0000-4000-8000-000000000001',
  'baseline.xlsx', 2, 2,
  jsonb_build_object(
    'contractVersion','yvae-results/2.0',
    'source',jsonb_build_object('sha256',repeat('a',64),'fileName','baseline.xlsx'),
    'campaigns',jsonb_build_array(
      jsonb_build_object('campaignCode','C1','points',jsonb_build_array(jsonb_build_object('id',1))),
      jsonb_build_object('campaignCode','C2','points',jsonb_build_array(jsonb_build_object('id',2)))
    ),
    'scope',jsonb_build_object(
      'campaignCodes',jsonb_build_array('C1','C2'),
      'campaignHashes',jsonb_build_object('C1',repeat('1',64),'C2',repeat('2',64))
    )
  ),
  '2026-01-01T00:00:00Z'
);

\ir ../migrations/20260922161004_results_selective_publication.sql

create extension if not exists dblink;

create or replace function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition,false) then
    raise exception 'ASSERTION_FAILED: %',p_message;
  end if;
end
$function$;

create or replace function pg_temp.publication(
  p_id uuid,
  p_source_sha text,
  p_file text,
  p_code text,
  p_campaign_hash text,
  p_published_at text
)
returns jsonb language sql immutable as $function$
  select jsonb_build_object(
    'contractVersion','yvae-results/2.0',
    'calculationVersion','synthetic-1',
    'catalogVersion','synthetic-1',
    'publicationId',p_id,
    'publishedAt',p_published_at,
    'molecularRecordCount',1,
    'source',jsonb_build_object('sha256',p_source_sha,'fileName',p_file),
    'campaigns',jsonb_build_array(jsonb_build_object(
      'campaignCode',p_code,
      'points',jsonb_build_array(jsonb_build_object('sample','synthetic')),
      'counts',jsonb_build_object('points',1)
    )),
    'scope',jsonb_build_object(
      'campaignCodes',jsonb_build_array(p_code),
      'campaignHashes',jsonb_build_object(p_code,p_campaign_hash)
    )
  )
$function$;

create or replace function pg_temp.publication_batch(
  p_id uuid,
  p_source_sha text,
  p_file text,
  p_published_at text
)
returns jsonb language sql immutable as $function$
  select jsonb_build_object(
    'contractVersion','yvae-results/2.0',
    'calculationVersion','synthetic-1',
    'catalogVersion','synthetic-1',
    'publicationId',p_id,
    'publishedAt',p_published_at,
    'molecularRecordCount',3,
    'source',jsonb_build_object('sha256',p_source_sha,'fileName',p_file),
    'campaigns',jsonb_build_array(
      jsonb_build_object('campaignCode','C1','points',jsonb_build_array(jsonb_build_object('sample','C1')),'counts',jsonb_build_object('points',1)),
      jsonb_build_object('campaignCode','C2','points',jsonb_build_array(jsonb_build_object('sample','C2')),'counts',jsonb_build_object('points',1)),
      jsonb_build_object('campaignCode','C3','points',jsonb_build_array(jsonb_build_object('sample','C3')),'counts',jsonb_build_object('points',1))
    ),
    'scope',jsonb_build_object(
      'campaignCodes',jsonb_build_array('C1','C2','C3'),
      'campaignHashes',jsonb_build_object('C1',repeat('8',64),'C2',repeat('9',64),'C3',repeat('a',64))
    )
  )
$function$;

-- Bootstrap determinístico, sem fonte binária fabricada.
select pg_temp.assert_true(
  (select count(*)=2 from private.results_campaign_heads)
  and (select source_sha256=repeat('a',64) from private.results_campaign_heads where campaign_code='C1')
  and (select count(*)=0 from private.results_source_artifacts),
  'bootstrap must create heads without fabricating source artifacts'
);

-- Segurança estrutural e menor privilégio.
select pg_temp.assert_true(
  (select bool_and(relrowsecurity and relforcerowsecurity)
   from pg_class where oid in (
     'private.results_source_artifacts'::regclass,
     'private.results_campaign_heads'::regclass,
     'private.results_publish_requests'::regclass
   )),
  'private tables must enable and force RLS'
);
select pg_temp.assert_true(
  not exists(select 1 from pg_policies where schemaname='private'),
  'private schema must have zero policies'
);
select pg_temp.assert_true(
  not has_table_privilege('anon','private.results_source_artifacts','SELECT')
  and not has_table_privilege('authenticated','private.results_source_artifacts','SELECT')
  and not has_table_privilege('service_role','private.results_source_artifacts','SELECT'),
  'no client role may read source artifacts directly'
);
select pg_temp.assert_true(
  has_function_privilege('service_role','public.publish_results_snapshot(jsonb,text,jsonb,jsonb,jsonb,uuid)','EXECUTE')
  and has_function_privilege('service_role','public.read_results_inventory()','EXECUTE')
  and has_function_privilege('service_role','public.read_results_source(text,uuid,text,boolean)','EXECUTE')
  and not has_function_privilege('anon','public.publish_results_snapshot(jsonb,text,jsonb,jsonb,jsonb,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.read_results_inventory()','EXECUTE'),
  'RPCs must be service_role-only'
);
select pg_temp.assert_true(
  (select bool_and(prosecdef and proconfig=array['search_path=""'])
   from pg_proc where oid in (
     'public.publish_results_snapshot(jsonb,text,jsonb,jsonb,jsonb,uuid)'::regprocedure,
     'public.read_results_inventory()'::regprocedure,
     'public.read_results_source(text,uuid,text,boolean)'::regprocedure
   )),
  'RPCs must be SECURITY DEFINER with empty search_path'
);

-- Primeira publicação C1.
\set source_a_base64 'c291cmNlLUE='
select lower(encode(extensions.digest(convert_to('source-A','UTF8'),'sha256'),'hex')) as source_a_sha \gset

select public.publish_results_snapshot(
  pg_temp.publication(
    '00000000-0000-4000-8000-000000000101',:'source_a_sha','source-a.xlsx','C1',repeat('3',64),'2026-01-01T00:00:00Z'
  ),
  :'source_a_base64',
  '{"sheets":["one","two","three","four","five","six","seven"]}'::jsonb,
  jsonb_build_object('source',jsonb_build_object('sha256',:'source_a_sha'),'campaigns',jsonb_build_array('C1','C2')),
  jsonb_build_object('C1','00000000-0000-4000-8000-000000000001'),
  '00000000-0000-4000-8000-000000009101'
) as first_response \gset

select pg_temp.assert_true(
  (:'first_response'::jsonb->>'publicationId')='00000000-0000-4000-8000-000000000101'
  and (select publication_id='00000000-0000-4000-8000-000000000101' from private.results_campaign_heads where campaign_code='C1')
  and (select publication_id='00000000-0000-4000-8000-000000000001' from private.results_campaign_heads where campaign_code='C2')
  and (select count(*)=2 from public.lab_risk_results)
  and (select count(*)=1 from private.results_source_artifacts),
  'C1 publish must atomically advance only C1'
);

-- Replay ignora publishedAt volátil e devolve exatamente a resposta original.
select pg_temp.assert_true(
  public.publish_results_snapshot(
    pg_temp.publication(
      '00000000-0000-4000-8000-000000000101',:'source_a_sha','source-a.xlsx','C1',repeat('3',64),'2030-01-01T00:00:00Z'
    ),
    :'source_a_base64',
    '{"sheets":["one","two","three","four","five","six","seven"]}'::jsonb,
    jsonb_build_object('source',jsonb_build_object('sha256',:'source_a_sha'),'campaigns',jsonb_build_array('C1','C2')),
    jsonb_build_object('C1','00000000-0000-4000-8000-000000000001'),
    '00000000-0000-4000-8000-000000009101'
  ) = :'first_response'::jsonb
  and (select count(*)=2 from public.lab_risk_results),
  'replay must return original response without inserting'
);

-- Mesma fonte integral pode publicar outra seleção sem conflito de artifact.
select public.publish_results_snapshot(
  pg_temp.publication(
    '00000000-0000-4000-8000-000000000102',:'source_a_sha','source-a.xlsx','C2',repeat('4',64),'2026-01-01T00:01:00Z'
  ),
  :'source_a_base64',
  '{"sheets":["one","two","three","four","five","six","seven"]}'::jsonb,
  jsonb_build_object('source',jsonb_build_object('sha256',:'source_a_sha'),'campaigns',jsonb_build_array('C1','C2')),
  jsonb_build_object('C2','00000000-0000-4000-8000-000000000001'),
  '00000000-0000-4000-8000-000000009102'
);
select pg_temp.assert_true(
  (select count(*)=1 from private.results_source_artifacts)
  and (select publication_id='00000000-0000-4000-8000-000000000102' from private.results_campaign_heads where campaign_code='C2'),
  'same source must support a second selective publish'
);

-- Nova C1 e replay antigo não podem reativar o head anterior.
\set source_b_base64 'c291cmNlLUI='
select lower(encode(extensions.digest(convert_to('source-B','UTF8'),'sha256'),'hex')) as source_b_sha \gset
select public.publish_results_snapshot(
  pg_temp.publication(
    '00000000-0000-4000-8000-000000000103',:'source_b_sha','source-b.xlsx','C1',repeat('5',64),'2026-01-01T00:02:00Z'
  ),
  :'source_b_base64','{"sheets":[1,2,3,4,5,6,7]}'::jsonb,
  jsonb_build_object('source',jsonb_build_object('sha256',:'source_b_sha'),'campaigns',jsonb_build_array('C1')),
  jsonb_build_object('C1','00000000-0000-4000-8000-000000000101'),
  '00000000-0000-4000-8000-000000009103'
);
select public.publish_results_snapshot(
  pg_temp.publication(
    '00000000-0000-4000-8000-000000000101',:'source_a_sha','source-a.xlsx','C1',repeat('3',64),'2040-01-01T00:00:00Z'
  ),
  :'source_a_base64','{"sheets":["one","two","three","four","five","six","seven"]}'::jsonb,
  jsonb_build_object('source',jsonb_build_object('sha256',:'source_a_sha'),'campaigns',jsonb_build_array('C1','C2')),
  jsonb_build_object('C1','00000000-0000-4000-8000-000000000001'),
  '00000000-0000-4000-8000-000000009101'
);
select pg_temp.assert_true(
  (select publication_id='00000000-0000-4000-8000-000000000103' from private.results_campaign_heads where campaign_code='C1'),
  'old replay must never reactivate an obsolete head'
);

-- CAS inválido falha e não deixa fonte, publicação ou request parcial.
\set source_c_base64 'c291cmNlLUM='
select lower(encode(extensions.digest(convert_to('source-C','UTF8'),'sha256'),'hex')) as source_c_sha \gset
do $rollback$
begin
  begin
    perform public.publish_results_snapshot(
      pg_temp.publication(
        '00000000-0000-4000-8000-000000000104',
        lower(encode(extensions.digest(convert_to('source-C','UTF8'),'sha256'),'hex')),
        'source-c.xlsx','C1',repeat('6',64),'2026-01-01T00:03:00Z'
      ),
      'c291cmNlLUM=','{"sheets":[1,2,3,4,5,6,7]}'::jsonb,
      jsonb_build_object(
        'source',jsonb_build_object(
          'sha256',lower(encode(extensions.digest(convert_to('source-C','UTF8'),'sha256'),'hex'))
        ),
        'campaigns',jsonb_build_array('C1')
      ),
      jsonb_build_object('C1','00000000-0000-4000-8000-000000000001'),
      '00000000-0000-4000-8000-000000009104'
    );
    raise exception 'ASSERTION_FAILED: stale CAS was accepted';
  exception when sqlstate '40001' then null;
  end;
end
$rollback$;
select pg_temp.assert_true(
  not exists(select 1 from public.lab_risk_results where id='00000000-0000-4000-8000-000000000104')
  and not exists(select 1 from private.results_source_artifacts where source_sha256=:'source_c_sha')
  and not exists(select 1 from private.results_publish_requests where request_id='00000000-0000-4000-8000-000000009104'),
  'CAS failure must roll back all writes'
);

-- Campos críticos ausentes falham fechado (regressão SQL NULL/three-valued logic).
do $missing_fields$
declare
  v_valid jsonb := pg_temp.publication(
    '00000000-0000-4000-8000-000000000106',
    lower(encode(extensions.digest(convert_to('source-C','UTF8'),'sha256'),'hex')),
    'source-c.xlsx','C4',repeat('8',64),'2026-01-01T00:05:00Z'
  );
  v_parsed jsonb := jsonb_build_object(
    'source',jsonb_build_object(
      'sha256',lower(encode(extensions.digest(convert_to('source-C','UTF8'),'sha256'),'hex'))
    )
  );
begin
  begin
    perform public.publish_results_snapshot(
      v_valid - 'contractVersion','c291cmNlLUM=','{}'::jsonb,v_parsed,
      '{"C4":null}'::jsonb,'00000000-0000-4000-8000-000000009106'
    );
    raise exception 'ASSERTION_FAILED: missing contractVersion was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.publish_results_snapshot(
      v_valid,'c291cmNlLUM=','{}'::jsonb,v_parsed - 'source',
      '{"C4":null}'::jsonb,'00000000-0000-4000-8000-000000009107'
    );
    raise exception 'ASSERTION_FAILED: missing parsed source was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.publish_results_snapshot(
      jsonb_set(v_valid,'{campaigns,0}',(v_valid->'campaigns'->0)-'points'),
      'c291cmNlLUM=','{}'::jsonb,v_parsed,
      '{"C4":null}'::jsonb,'00000000-0000-4000-8000-000000009108'
    );
    raise exception 'ASSERTION_FAILED: missing campaign points was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.publish_results_snapshot(
      v_valid - 'campaigns','c291cmNlLUM=','{}'::jsonb,v_parsed,
      '{"C4":null}'::jsonb,'00000000-0000-4000-8000-000000009109'
    );
    raise exception 'ASSERTION_FAILED: missing campaigns was accepted';
  exception when sqlstate '22023' then null;
  end;
end
$missing_fields$;
select pg_temp.assert_true(
  not exists(select 1 from public.lab_risk_results where id='00000000-0000-4000-8000-000000000106')
  and not exists(select 1 from private.results_publish_requests where request_id in (
    '00000000-0000-4000-8000-000000009106','00000000-0000-4000-8000-000000009107',
    '00000000-0000-4000-8000-000000009108','00000000-0000-4000-8000-000000009109'
  )),
  'invalid NULL-shaped inputs must leave no publication'
);

-- Leituras service-only: inventário e fonte atual vinculada ao head.
select pg_temp.assert_true(
  jsonb_array_length(public.read_results_inventory()->'sourceHashes')=2
  and public.read_results_inventory()->'heads'->>'C1'='00000000-0000-4000-8000-000000000103',
  'inventory must expose current heads and available sources'
);
select pg_temp.assert_true(
  public.read_results_source('C1','00000000-0000-4000-8000-000000000103',:'source_b_sha',false)->>'downloadAvailable'='true'
  and public.read_results_source('C1','00000000-0000-4000-8000-000000000103',:'source_b_sha',false)->'currentCampaignCodes'=jsonb_build_array('C1')
  and public.read_results_source('C1','00000000-0000-4000-8000-000000000103',:'source_b_sha',false)->'originalBase64'='null'::jsonb
  and public.read_results_source('C1','00000000-0000-4000-8000-000000000103',:'source_b_sha',true)->>'originalBase64'=:'source_b_base64',
  'source RPC must return structured data and bytes only when requested'
);
do $stale_read$
begin
  begin
    perform public.read_results_source(
      'C1','00000000-0000-4000-8000-000000000101',
      lower(encode(extensions.digest(convert_to('source-A','UTF8'),'sha256'),'hex')),
      false
    );
    raise exception 'ASSERTION_FAILED: stale source scope was accepted';
  exception when sqlstate '40001' then null;
  end;
end
$stale_read$;

-- Lote único C1+C2+C3: um CAS stale aborta tudo; o válido substitui todas as
-- selecionadas e preserva C4, que está ausente do lote.
select public.publish_results_snapshot(
  pg_temp.publication(
    '00000000-0000-4000-8000-000000000106',:'source_c_sha','source-c.xlsx','C4',repeat('b',64),'2026-01-01T00:06:00Z'
  ),
  :'source_c_base64','{"sheets":[1,2,3,4,5,6,7]}'::jsonb,
  jsonb_build_object('source',jsonb_build_object('sha256',:'source_c_sha'),'campaigns',jsonb_build_array('C4')),
  '{"C4":null}'::jsonb,
  '00000000-0000-4000-8000-000000009110'
);
\set source_e_base64 'c291cmNlLUU='
select lower(encode(extensions.digest(convert_to('source-E','UTF8'),'sha256'),'hex')) as source_e_sha \gset
do $batch_stale$
begin
  begin
    perform public.publish_results_snapshot(
      pg_temp.publication_batch(
        '00000000-0000-4000-8000-000000000200',
        lower(encode(extensions.digest(convert_to('source-E','UTF8'),'sha256'),'hex')),
        'source-e.xlsx','2026-01-01T00:07:00Z'
      ),
      'c291cmNlLUU=','{"sheets":[1,2,3,4,5,6,7]}'::jsonb,
      jsonb_build_object(
        'source',jsonb_build_object(
          'sha256',lower(encode(extensions.digest(convert_to('source-E','UTF8'),'sha256'),'hex'))
        ),
        'campaigns',jsonb_build_array('C1','C2','C3')
      ),
      jsonb_build_object(
        'C1','00000000-0000-4000-8000-000000000103',
        'C2','00000000-0000-4000-8000-000000000001',
        'C3',null
      ),
      '00000000-0000-4000-8000-000000009200'
    );
    raise exception 'ASSERTION_FAILED: batch with one stale head was accepted';
  exception when sqlstate '40001' then null;
  end;
end
$batch_stale$;
select pg_temp.assert_true(
  not exists(select 1 from public.lab_risk_results where id='00000000-0000-4000-8000-000000000200')
  and not exists(select 1 from private.results_source_artifacts where source_sha256=:'source_e_sha')
  and (select publication_id='00000000-0000-4000-8000-000000000103' from private.results_campaign_heads where campaign_code='C1')
  and (select publication_id='00000000-0000-4000-8000-000000000102' from private.results_campaign_heads where campaign_code='C2')
  and not exists(select 1 from private.results_campaign_heads where campaign_code='C3')
  and (select publication_id='00000000-0000-4000-8000-000000000106' from private.results_campaign_heads where campaign_code='C4'),
  'one stale selected head must roll back the complete batch'
);
select public.publish_results_snapshot(
  pg_temp.publication_batch(
    '00000000-0000-4000-8000-000000000201',:'source_e_sha','source-e.xlsx','2026-01-01T00:08:00Z'
  ),
  :'source_e_base64','{"sheets":[1,2,3,4,5,6,7]}'::jsonb,
  jsonb_build_object('source',jsonb_build_object('sha256',:'source_e_sha'),'campaigns',jsonb_build_array('C1','C2','C3')),
  jsonb_build_object(
    'C1','00000000-0000-4000-8000-000000000103',
    'C2','00000000-0000-4000-8000-000000000102',
    'C3',null
  ),
  '00000000-0000-4000-8000-000000009201'
);
select pg_temp.assert_true(
  (select count(*)=3 from private.results_campaign_heads where campaign_code in ('C1','C2','C3') and publication_id='00000000-0000-4000-8000-000000000201')
  and (select publication_id='00000000-0000-4000-8000-000000000106' from private.results_campaign_heads where campaign_code='C4')
  and (select risk_row_count=3 from public.lab_risk_results where id='00000000-0000-4000-8000-000000000201'),
  'valid batch must replace all selected heads and preserve absent C4'
);

-- Concorrência real: duas requests/payloads diferentes disputam o mesmo head;
-- exatamente uma vence e a outra recebe CAS conflict.
\set source_f_base64 'c291cmNlLUY='
\set source_g_base64 'c291cmNlLUc='
select lower(encode(extensions.digest(convert_to('source-F','UTF8'),'sha256'),'hex')) as source_f_sha \gset
select lower(encode(extensions.digest(convert_to('source-G','UTF8'),'sha256'),'hex')) as source_g_sha \gset
select dblink_connect(
  'results_c1',
  'host=127.0.0.1 port='||current_setting('port')||' dbname='||current_database()||' user=postgres'
);
select dblink_connect(
  'results_c2',
  'host=127.0.0.1 port='||current_setting('port')||' dbname='||current_database()||' user=postgres'
);
select dblink_exec('results_c1','begin');
select dblink_exec('results_c1','set local role service_role');
select response
from dblink(
  'results_c1',
  format(
    'select public.publish_results_snapshot(%L::jsonb,%L,%L::jsonb,%L::jsonb,%L::jsonb,%L::uuid)::text',
    pg_temp.publication('00000000-0000-4000-8000-000000000301',:'source_f_sha','source-f.xlsx','C5',repeat('c',64),'2026-01-01T00:09:00Z')::text,
    :'source_f_base64','{"sheets":[1,2,3,4,5,6,7]}',
    jsonb_build_object('source',jsonb_build_object('sha256',:'source_f_sha'),'campaigns',jsonb_build_array('C5'))::text,
    '{"C5":null}','00000000-0000-4000-8000-000000009301'
  )
) as first(response text);
select dblink_exec('results_c2','set role service_role');
select dblink_send_query(
  'results_c2',
  format(
    'select public.publish_results_snapshot(%L::jsonb,%L,%L::jsonb,%L::jsonb,%L::jsonb,%L::uuid)::text',
    pg_temp.publication('00000000-0000-4000-8000-000000000302',:'source_g_sha','source-g.xlsx','C5',repeat('d',64),'2026-01-01T00:10:00Z')::text,
    :'source_g_base64','{"sheets":[1,2,3,4,5,6,7]}',
    jsonb_build_object('source',jsonb_build_object('sha256',:'source_g_sha'),'campaigns',jsonb_build_array('C5'))::text,
    '{"C5":null}','00000000-0000-4000-8000-000000009302'
  )
);
select pg_sleep(0.1);
select pg_temp.assert_true(dblink_is_busy('results_c2')=1,'concurrent competing request must wait on advisory lock');
select dblink_exec('results_c1','commit');
do $concurrent_conflict$
begin
  begin
    perform response from dblink_get_result('results_c2') as result(response text);
    raise exception 'ASSERTION_FAILED: competing request did not fail CAS';
  exception when sqlstate '40001' then null;
  end;
end
$concurrent_conflict$;
select dblink_disconnect('results_c1');
select dblink_disconnect('results_c2');
select pg_temp.assert_true(
  (select publication_id='00000000-0000-4000-8000-000000000301' from private.results_campaign_heads where campaign_code='C5')
  and (select count(*)=1 from public.lab_risk_results where id in ('00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000302'))
  and (select count(*)=1 from private.results_publish_requests where request_id in ('00000000-0000-4000-8000-000000009301','00000000-0000-4000-8000-000000009302')),
  'concurrency must persist only the winning publication and request'
);

select jsonb_build_object(
  'status','RESULTS_SELECTIVE_PUBLICATION_SQL_TESTS_PASS',
  'postgres',current_setting('server_version'),
  'atomicity','PASS',
  'cas','PASS',
  'replay','PASS',
  'concurrency','PASS',
  'preservation','PASS',
  'source_privacy','PASS',
  'current_source_binding','PASS'
) as safe_test_result;
