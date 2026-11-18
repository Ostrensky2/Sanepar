-- Synthetic fixture only. Run against a dedicated, disposable database.
begin;
insert into public.field_diary_entries(id,campaign_id,sia,execution_status)
values ('e6-synthetic','campanha-1-verao-2026','1','realized');
do $$
declare
  sheets jsonb := '[{"campaign":1,"marker":"16S","rank":"familias","sheet":"matrix","run":"synthetic","headers":["A","B"],"rows":[{"sia":"SIA-0001","collection":"e6-synthetic","values":[0,7]}]}]';
  actor uuid:=gen_random_uuid(); req uuid:=gen_random_uuid(); plan jsonb; result jsonb; other jsonb;
begin
  plan:=public.sia_matrix_archive('preview',sheets,actor);
  if plan->>'new'<>'1' or exists(select from private.sia_matrix_groups) then raise exception 'preview'; end if;
  update public.field_diary_entries set execution_status=null,activities=array['','Não informado'] where id='e6-synthetic';
  begin
    perform public.sia_matrix_archive('preview',sheets,actor);
    raise exception 'accepted placeholder';
  exception when raise_exception then if sqlerrm<>'UNCONFIRMED_COLLECTION' then raise; end if; end;
  update public.field_diary_entries set execution_status=null,samples_replicas_edna='synthetic' where id='e6-synthetic';
  if public.sia_matrix_archive('preview',sheets,actor) is distinct from plan then raise exception 'legacy collection'; end if;
  update public.field_diary_entries set activities=array['Coleta não realizada'] where id='e6-synthetic';
  begin
    perform public.sia_matrix_archive('preview',sheets,actor);
    raise exception 'accepted negative evidence';
  exception when raise_exception then if sqlerrm<>'UNCONFIRMED_COLLECTION' then raise; end if; end;
  update public.field_diary_entries set activities='{}' where id='e6-synthetic';
  result:=public.sia_matrix_archive('apply',sheets,actor,req,plan->>'planDigest');
  if result is distinct from public.sia_matrix_archive('apply',sheets,actor,req,plan->>'planDigest') then raise exception 'replay'; end if;
  plan:=public.sia_matrix_archive('preview',sheets,actor);
  perform public.sia_matrix_archive('apply',sheets,actor,gen_random_uuid(),plan->>'planDigest');
  if plan->>'unchanged'<>'1' or (select count(*) from private.sia_matrix_commits)<>1 then raise exception 'noop'; end if;
  other:=jsonb_set(jsonb_set(sheets,'{0,headers}','["A"]'),'{0,rows,0,values}','[2]');
  plan:=public.sia_matrix_archive('preview',other,actor);
  if plan#>'{details,0,changes,A}' is distinct from '[0,2]'::jsonb then raise exception 'diff'; end if;
  perform public.sia_matrix_archive('apply',other,actor,gen_random_uuid(),plan->>'planDigest');
  begin
    perform public.sia_matrix_archive('apply',other,actor,gen_random_uuid(),plan->>'planDigest');
    raise exception 'accepted stale';
  exception when serialization_failure then null; end;
  if public.sia_matrix_archive_page(1)#>'{rows,0,counts}' is distinct from '{"A":2,"B":7}'::jsonb then raise exception 'omitted'; end if;
  if has_table_privilege('authenticated','private.sia_matrix_groups','SELECT')
    or has_function_privilege('anon','public.sia_matrix_archive(text,jsonb,uuid,uuid,text)','execute') then raise exception 'grants'; end if;
end $$;
rollback;

-- UTF-8 page boundary: same scope grows across confirmed imports.
begin;
insert into public.field_diary_entries(id,campaign_id,sia,execution_status)
values ('size-test','campanha-3','1','realized');
do $$
declare
  a uuid:=gen_random_uuid(); wire jsonb; plan jsonb; before_page jsonb; lo int; hi int;
  action text; before_receipts bigint; alternate jsonb;
begin
  foreach lo in array array[1,2001,2301] loop
    hi:=case lo when 1 then 2000 when 2001 then 2300 else 2340 end;
    select jsonb_build_array(jsonb_build_object('campaign',3,'marker','COI','run','size','rank','generos','sheet','matrix',
      'headers',jsonb_agg(repeat('界',500)||i order by i),'rows',jsonb_build_array(jsonb_build_object(
      'collection','size-test','sia','SIA-0001','values',jsonb_agg(0 order by i))))) into wire from generate_series(lo,hi) i;
    if lo<2301 then
      plan:=public.sia_matrix_archive('preview',wire,a);
      perform public.sia_matrix_archive('apply',wire,a,gen_random_uuid(),plan->>'planDigest');
    else
      before_page:=public.sia_matrix_archive_page(3);
      if octet_length((before_page#>'{rows,0}')::text) not between 3450000 and 3499744
        or before_page#>>'{rows,0,version}'<>'2' then raise exception 'fixture not near byte boundary'; end if;
      select count(*) into before_receipts from private.sia_matrix_commits;
      -- All original 2,000 wide keys change; input fits group/cell budgets but the diff does not fit.
      select jsonb_set(jsonb_set(wire,'{0,headers}',jsonb_agg(repeat('界',500)||i order by i)),
        '{0,rows,0,values}',jsonb_agg(1 order by i)) into alternate from generate_series(1,2000) i;
      foreach action in array array['preview','apply'] loop
        begin
          perform public.sia_matrix_archive(action,alternate,a,gen_random_uuid(),repeat('a',64));
          raise exception 'accepted oversized diff';
        exception when raise_exception then if sqlerrm<>'DIFF_TOO_LARGE' then raise; end if; end;
      end loop;
      alternate:=jsonb_set(wire,'{0,run}','"other"');
      foreach action in array array['preview','apply'] loop
        begin
          perform public.sia_matrix_archive(action,alternate||wire,a,gen_random_uuid(),repeat('a',64));
          raise exception 'accepted oversized merge';
        exception when raise_exception then if sqlerrm<>'GROUP_TOO_LARGE' then raise; end if; end;
      end loop;
      if public.sia_matrix_archive_page(3) is distinct from before_page
        or (select count(*) from private.sia_matrix_commits)<>before_receipts then raise exception 'boundary atomicity'; end if;
    end if;
  end loop;
end $$;
rollback;

-- One explicitly reviewed maximum batch, plus out-of-budget rejection.
begin;
insert into public.field_diary_entries(id,campaign_id,sia,execution_status)
select 'load-'||i,'campanha-3',i::text,'realized' from generate_series(1,76) i;
create temporary view e6_load as
with headers as (select jsonb_agg('taxon-'||i order by i) h from generate_series(1,500) i),
vectors as (select v,jsonb_agg(v order by i) vals from generate_series(0,1) v cross join generate_series(1,500) i group by v),
rows as (select v,jsonb_agg(jsonb_build_object('sia','SIA-'||lpad(i::text,4,'0'),'collection','load-'||i,'values',vals) order by i) rs
  from vectors cross join generate_series(1,4) i group by v)
select v,jsonb_agg(jsonb_build_object('campaign',3,'run','load-'||j,'sheet','matrix','marker','16S','rank','familias','headers',h,'rows',rs) order by j) sheets
from headers cross join rows cross join generate_series(1,8) j group by v;
do $$
declare a uuid:=gen_random_uuid(); wire jsonb; p jsonb; started timestamptz;
begin
  select sheets into wire from e6_load where v=0;
  p:=public.sia_matrix_archive('preview',wire,a);
  perform set_config('client_min_messages','debug1',true);
  started:=clock_timestamp();
  perform public.sia_matrix_archive('apply',wire,a,gen_random_uuid(),p->>'planDigest');
  raise notice 'whole apply (only final guard holds diary SHARE): %',clock_timestamp()-started;
  perform set_config('client_min_messages','notice',true);
  select sheets into wire from e6_load where v=1;
  p:=public.sia_matrix_archive('preview',wire,a);
  started:=clock_timestamp();
  perform public.sia_matrix_archive('apply',wire,a,gen_random_uuid(),p->>'planDigest');
  raise notice 'apply 16000 changed values in 32 groups: %',clock_timestamp()-started;
  begin
    perform public.sia_matrix_archive('preview',wire||wire,a);
    raise exception 'accepted oversized batch';
  exception when raise_exception then if sqlerrm<>'BATCH_TOO_LARGE' then raise; end if; end;
  if exists(select from private.sia_matrix_groups where version<>2) or (select count(*) from private.sia_matrix_commits)<>2 then raise exception 'batch effects'; end if;
end $$;
rollback;
