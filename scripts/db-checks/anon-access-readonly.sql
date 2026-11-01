-- Conferência SOMENTE LEITURA do acesso de quem não fez login (papel anon).
-- Rode no SQL Editor do Supabase (projeto uoptbbmfgfiuhbmicofp) antes e depois de
-- aplicar 20261101110000_close_anon_access.sql. Não grava nada.
-- Depois da migration, as cinco consultas devem voltar vazias.
begin isolation level repeatable read read only;

-- 1. Políticas que alcançam anon ou PUBLIC, ou liberam tudo com "true".
select 'politica_aberta' as achado, schemaname as schema, tablename as tabela, policyname as politica,
       cmd as operacao, roles::text as papeis, qual as usando, with_check as conferindo
from pg_policies
where schemaname in ('public', 'storage')
  and ('anon' = any(roles) or 'public' = any(roles)
       or btrim(coalesce(qual, '')) = 'true' or btrim(coalesce(with_check, '')) = 'true')
order by schemaname, tablename, policyname;

-- 2. Tabelas e views do schema public em que anon tem algum privilégio.
select 'privilegio_anon' as achado, c.relname as tabela,
       concat_ws(', ',
         case when has_table_privilege('anon', c.oid, 'SELECT') then 'leitura' end,
         case when has_table_privilege('anon', c.oid, 'INSERT') then 'inclusão' end,
         case when has_table_privilege('anon', c.oid, 'UPDATE') then 'alteração' end,
         case when has_table_privilege('anon', c.oid, 'DELETE') then 'exclusão' end) as privilegios,
       c.relrowsecurity as rls_ligado
from pg_class as c
join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p', 'v', 'm', 'f')
  and has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
  and not exists (select 1 from pg_depend as d
                  where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
order by c.relname;

-- 3. Tabelas do schema public sem RLS ligado.
select 'tabela_sem_rls' as achado, c.relname as tabela
from pg_class as c
join pg_namespace as n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
  and not exists (select 1 from pg_depend as d
                  where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
order by c.relname;

-- 4. Funções do schema public que anon consegue executar.
select 'funcao_anon' as achado, p.oid::regprocedure::text as funcao, p.prosecdef as security_definer
from pg_proc as p
join pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind in ('f', 'p')
  and has_function_privilege('anon', p.oid, 'EXECUTE')
  and not exists (select 1 from pg_depend as d
                  where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
order by 2;

-- 5. Buckets públicos do Storage (arquivo abre por link sem login).
select 'bucket_publico' as achado, id as bucket from storage.buckets where public order by id;

-- Para referência: todas as políticas em vigor (tabela, operação, papéis).
select schemaname as schema, tablename as tabela, policyname as politica, cmd as operacao, roles::text as papeis
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

commit;
