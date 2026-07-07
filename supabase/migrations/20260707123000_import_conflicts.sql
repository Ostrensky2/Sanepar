create table if not exists public.import_conflicts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  entity_type text not null check (entity_type in ('ponto', 'diario')),
  entity_key text not null,
  field_name text not null,
  app_value jsonb,
  sheet_value jsonb,
  status text not null default 'pendente' check (status in ('pendente', 'resolvido')),
  resolution text check (resolution in ('app', 'planilha')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);

alter table public.import_conflicts enable row level security;

drop policy if exists "import_conflicts_select_all" on public.import_conflicts;
create policy "import_conflicts_select_all"
on public.import_conflicts
for select
to anon, authenticated
using (true);

drop policy if exists "import_conflicts_insert_all" on public.import_conflicts;
create policy "import_conflicts_insert_all"
on public.import_conflicts
for insert
to anon, authenticated
with check (true);

drop policy if exists "import_conflicts_update_all" on public.import_conflicts;
create policy "import_conflicts_update_all"
on public.import_conflicts
for update
to anon, authenticated
using (true)
with check (true);

create index if not exists import_conflicts_pending_idx
on public.import_conflicts (status, created_at desc);

create index if not exists import_conflicts_batch_idx
on public.import_conflicts (batch_id, entity_key);
