-- Execute only after results_preparation_packages.sql on isolated fixture DB.
\set ON_ERROR_STOP on
do $$ begin
  assert current_database() like 'results_preparation_test%', 'isolated fixture database required';
  assert inet_server_port()=55432, 'isolated fixture port required';
end $$;
create extension if not exists dblink;
select dblink_connect('preparation_a',format('host=127.0.0.1 port=55432 dbname=%I user=postgres',current_database()));
select dblink_connect('preparation_b',format('host=127.0.0.1 port=55432 dbname=%I user=postgres',current_database()));
select dblink_send_query('preparation_a',$q$
  select public.save_results_preparation('00000000-0000-4000-8000-000000000301','race',null,
    public.fixture_manifest()||'{"label":"a"}', '[]', public.fixture_bindings(array['Riscos_bibliografia']))::text
$q$);
select dblink_send_query('preparation_b',$q$
  select public.save_results_preparation('00000000-0000-4000-8000-000000000302','race',null,
    public.fixture_manifest()||'{"label":"b"}', '[]', public.fixture_bindings(array['Riscos_bibliografia']))::text
$q$);
-- Redact models from test output. The loser must report STALE_PREPARATION.
select count(*) as result_a from dblink_get_result('preparation_a',false) as t(response text);
select count(*) as result_b from dblink_get_result('preparation_b',false) as t(response text);
do $$ begin
  assert (select count(*) from private.results_preparation_revisions where package_key='race')=1,'one concurrent revision';
  assert (select count(*) from private.results_preparation_requests where request_id in
    ('00000000-0000-4000-8000-000000000301','00000000-0000-4000-8000-000000000302'))=1,'one concurrent request';
end $$;
select dblink_disconnect('preparation_a');
select dblink_disconnect('preparation_b');
select 'RESULTS_PREPARATION_CONCURRENCY_PASS';
