-- Tabelas próprias para entidades que viviam como linhas-sentinela (__nome__)
-- dentro de campaign_imports, e chave explícita de campanha nas importações.

-- 1. Status de gestão das campanhas (documento único)
create table if not exists public.campaign_management (
  id text primary key,
  management jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.campaign_management enable row level security;

drop policy if exists "campaign_management_select_all" on public.campaign_management;
create policy "campaign_management_select_all"
on public.campaign_management
for select
to anon, authenticated
using (true);

drop policy if exists "campaign_management_insert_all" on public.campaign_management;
create policy "campaign_management_insert_all"
on public.campaign_management
for insert
to anon, authenticated
with check (true);

drop policy if exists "campaign_management_update_all" on public.campaign_management;
create policy "campaign_management_update_all"
on public.campaign_management
for update
to anon, authenticated
using (true)
with check (true);

-- 2. Resultados laboratoriais publicados (pontos de risco)
create table if not exists public.lab_risk_results (
  id uuid primary key default gen_random_uuid(),
  file_name text not null default '',
  row_count integer not null default 0,
  risk_row_count integer not null default 0,
  points jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.lab_risk_results enable row level security;

drop policy if exists "lab_risk_results_select_all" on public.lab_risk_results;
create policy "lab_risk_results_select_all"
on public.lab_risk_results
for select
to anon, authenticated
using (true);

drop policy if exists "lab_risk_results_insert_all" on public.lab_risk_results;
create policy "lab_risk_results_insert_all"
on public.lab_risk_results
for insert
to anon, authenticated
with check (true);

create index if not exists lab_risk_results_created_at_idx
on public.lab_risk_results (created_at desc);

-- 3. Chave de campanha explícita nas importações (evita "campanha fantasma"
--    inferida do primeiro ponto da planilha)
alter table public.campaign_imports add column if not exists campaign_key text;

update public.campaign_imports
set campaign_key = coalesce(
  nullif(lower(btrim(points->0->>'campaign')), ''),
  lower(btrim(file_name))
)
where campaign_key is null
  and file_name not like '\_\_%' escape '\';

create index if not exists campaign_imports_campaign_key_idx
on public.campaign_imports (campaign_key, created_at desc);

-- 4. Migra os snapshots mais recentes para as novas tabelas
insert into public.campaign_management (id, management, updated_at)
select 'singleton', ci.points, ci.created_at
from public.campaign_imports ci
where ci.file_name = '__campaign_management__'
order by ci.created_at desc
limit 1
on conflict (id) do nothing;

insert into public.lab_risk_results (file_name, row_count, risk_row_count, points, created_at)
select
  coalesce(replace(ci.missing_fields[1], 'arquivo:', ''), ''),
  ci.row_count,
  ci.original_point_count,
  ci.points,
  ci.created_at
from public.campaign_imports ci
where ci.file_name = '__lab_risk_results__'
  and not exists (select 1 from public.lab_risk_results)
order by ci.created_at desc
limit 1;
