-- Fixtures only; run in a new isolated database, never the application database.
\set ON_ERROR_STOP on
do $$ begin
  assert current_database() like 'results_preparation_test%', 'isolated fixture database required';
  assert inet_server_port()=55432, 'isolated fixture port required';
end $$;
create schema extensions;
create extension pgcrypto with schema extensions;
\ir ../migrations/20260922165113_results_preparation_packages.sql

create function public.fixture_manifest(kind text default 'bibliography', role text default 'full_workbook')
returns jsonb language sql as $$
select jsonb_build_object('contractVersion','yvae-preparation/1','schemaVersion','yvae-preparation/1',
  'parserVersion','yvae-results/2.0','kind',kind,'scope',case when kind='bibliography' then '{"type":"global-bibliography"}'::jsonb
  else '{"type":"campaigns","campaignCodes":["C1"]}'::jsonb end,
  'files',jsonb_build_array(jsonb_build_object('sha256',encode(extensions.digest('fixture','sha256'),'hex'),
    'fileName','fixture.xlsx','mediaType','application/octet-stream','role',role)),
  'dependencies','[]'::jsonb,'state','ready')
$$;
create function public.fixture_artifacts() returns jsonb language sql as $$
select jsonb_build_array(jsonb_build_object('sha256',encode(extensions.digest('fixture','sha256'),'hex'),
  'originalBase64',encode(convert_to('fixture','UTF8'),'base64')))
$$;
create function public.fixture_bindings(names text[]) returns jsonb language sql as $$
select jsonb_build_array(jsonb_build_object('artifactSha256',encode(extensions.digest('fixture','sha256'),'hex'),
  'parserVersion','yvae-results/2.0','data',jsonb_build_object('sheets',
    (select jsonb_agg(jsonb_build_object('name',n,'rows','[["header"],["value"]]'::jsonb)) from unnest(names) n))))
$$;

do $test$
declare
  m jsonb := public.fixture_manifest();
  b jsonb := public.fixture_bindings(array['Riscos_bibliografia','Evidencias_risco','Criterios_scores']);
  a jsonb := public.fixture_artifacts();
  r jsonb; r2 jsonb; oldhash text; n integer; before_count integer;
  id uuid := '00000000-0000-4000-8000-000000000101';
begin
  r := public.save_results_preparation(id,'catalog',null,m,a,b);
  assert r->>'state'='ready','three real catalog roles';
  oldhash:=r->>'revisionHash';
  assert public.read_results_preparation(null,oldhash)->>'revisionHash'=oldhash,'global pinned lookup';
  assert public.read_results_preparation(null,null) is null,'no unbounded lookup';
  assert public.read_results_preparation('catalog')->'parsedBindings'=r->'parsedBindings','reload models';
  assert public.read_results_preparation_artifact(oldhash,a->0->>'sha256')->>'originalBase64'=a->0->>'originalBase64','original bytes';
  assert public.read_results_preparation_artifact(repeat('0',64),a->0->>'sha256') is null,'scope binding';
  assert public.save_results_preparation(id,'catalog',null,m,'[]',b)=r,'replay before CAS';
  begin
    perform public.save_results_preparation(id,'catalog',null,m||'{"label":"changed"}',a,b);
    raise exception 'collision accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_results_preparation(gen_random_uuid(),'catalog',null,m,a,b);
    raise exception 'stale CAS accepted';
  exception when serialization_failure then null; end;
  r2:=public.save_results_preparation(gen_random_uuid(),'catalog',oldhash,m||'{"label":"new"}','[]',b);
  assert r2->>'revisionHash'<>oldhash,'new revision';
  assert public.read_results_preparation('catalog',oldhash)->'manifest'=m-'state','old manifest immutable';
  assert public.save_results_preparation(id,'catalog',null,m,'[]',b)=r,'old replay stable';
  assert public.read_results_preparation('catalog')->>'revisionHash'=r2->>'revisionHash','replay does not reactivate';
  r:=public.save_results_preparation(gen_random_uuid(),'raw',null,m,'[]','[]');
  assert r->>'state'='received','client ready ignored';
  r:=public.save_results_preparation(gen_random_uuid(),'partial',null,m,'[]',public.fixture_bindings(array['Riscos_bibliografia']));
  assert r->>'state'='pending','missing roles';
  r:=public.save_results_preparation(gen_random_uuid(),'missing',null,
    m||jsonb_build_object('dependencies',jsonb_build_array(jsonb_build_object('role','catalog','revisionHash',repeat('f',64)))),
    '[]',b);
  assert r->>'state'='pending','unresolved dependency cannot be ready';
  r:=public.save_results_preparation(gen_random_uuid(),'campaign',null,
    public.fixture_manifest('campaign_fragment')||jsonb_build_object('dependencies',jsonb_build_array(
      jsonb_build_object('role','catalog','revisionHash',oldhash),jsonb_build_object('role','evidence','revisionHash',oldhash),
      jsonb_build_object('role','criteria','revisionHash',oldhash))), '[]',
    public.fixture_bindings(array['Metadados','Indices_pontos','Calculo_conjuntos','Metodo_calculo']));
  assert r->>'state'='ready','pinned real dependencies complete seven roles';
  assert jsonb_array_length(public.read_results_preparation('campaign')->'dependencies')=3,'dependency models reload';
  r2:=public.save_results_preparation(gen_random_uuid(),'transitive',null,
    public.fixture_manifest('campaign_fragment')||jsonb_build_object('dependencies',jsonb_build_array(
      jsonb_build_object('role','catalog','revisionHash',r->>'revisionHash'),
      jsonb_build_object('role','evidence','revisionHash',r->>'revisionHash'),
      jsonb_build_object('role','criteria','revisionHash',r->>'revisionHash'))), '[]',
    public.fixture_bindings(array['Metadados','Indices_pontos','Calculo_conjuntos','Metodo_calculo']));
  assert r2->>'state'='ready','transitive role resolution';
  assert jsonb_array_length(public.read_results_preparation('transitive')->'dependencyRevisions')=2,'transitive model retrieval';
  r:=public.save_results_preparation(gen_random_uuid(),'conflict',null,
    m||jsonb_build_object('dependencies',jsonb_build_array(jsonb_build_object('role','catalog','revisionHash',oldhash))),
    '[]',jsonb_set(b,'{0,data,sheets,0,rows,1,0}','"different"'));
  assert r->>'state'='conflict','different normalized interpretations conflict';
  before_count:=(select count(*) from private.results_preparation_revisions);
  begin
    perform public.save_results_preparation(gen_random_uuid(),'badbytes',null,m,
      jsonb_set(a,'{0,originalBase64}','"YmFk"'),b);
    raise exception 'bad hash accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_results_preparation(gen_random_uuid(),'badparsed',null,m,'[]',
      jsonb_set(b,'{0,parsedSha256}',to_jsonb(repeat('a',64))));
    raise exception 'bad parsed hash accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_results_preparation(gen_random_uuid(),'badalias',null,m,'[]',
      public.fixture_bindings(array['Metadados','Metadata-C2']));
    raise exception 'duplicate alias accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_results_preparation(gen_random_uuid(),repeat('x',129),null,m,'[]',b);
    raise exception 'bounds accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_results_preparation(gen_random_uuid(),'badcell',null,m,'[]',
      jsonb_set(b,'{0,data,sheets,0,rows,1,0}','{}'));
    raise exception 'object cell accepted';
  exception when invalid_parameter_value then null; end;
  assert (select count(*) from private.results_preparation_revisions)=before_count,'invalid requests no writes';
  assert (select count(*) from private.results_preparation_artifacts)=1,'content addressed byte dedup';
  assert (select count(*) from pg_policies where schemaname='private')=0,'zero policies';
  assert (select bool_and(relrowsecurity and relforcerowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='private' and c.relkind='r'),'forced RLS';
  assert not has_table_privilege('service_role','private.results_preparation_revisions','UPDATE'),'no overwrite';
  assert not has_function_privilege('anon','public.save_results_preparation(uuid,text,text,jsonb,jsonb,jsonb)','EXECUTE'),'anon denied';
  assert not has_function_privilege('authenticated','public.read_results_preparation(text,text)','EXECUTE'),'auth denied';
  assert has_function_privilege('service_role','public.read_results_preparation(text,text)','EXECUTE'),'service allowed';
end
$test$;
set role service_role;
select public.read_results_preparation('catalog')->>'state' = 'ready' as service_read_pass;
reset role;
select 'RESULTS_PREPARATION_TESTS_PASS';
