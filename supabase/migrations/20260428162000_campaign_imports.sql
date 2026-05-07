create table if not exists public.campaign_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  row_count integer not null default 0,
  point_count integer not null default 0,
  original_point_count integer not null default 0,
  effective_point_count integer not null default 0,
  missing_fields text[] not null default '{}',
  points jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.campaign_imports enable row level security;

drop policy if exists "campaign_imports_select_all" on public.campaign_imports;
create policy "campaign_imports_select_all"
on public.campaign_imports
for select
to anon, authenticated
using (true);

drop policy if exists "campaign_imports_insert_all" on public.campaign_imports;
create policy "campaign_imports_insert_all"
on public.campaign_imports
for insert
to anon, authenticated
with check (true);

create index if not exists campaign_imports_created_at_idx
on public.campaign_imports (created_at desc);
