create table if not exists public.point_actions (
  id text primary key,
  event_name text not null,
  objectives text not null,
  document jsonb,
  created_at_label text not null,
  points jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.point_actions enable row level security;

drop policy if exists "point_actions_select_all" on public.point_actions;
create policy "point_actions_select_all"
on public.point_actions
for select
to anon, authenticated
using (true);

drop policy if exists "point_actions_insert_all" on public.point_actions;
create policy "point_actions_insert_all"
on public.point_actions
for insert
to anon, authenticated
with check (true);

drop policy if exists "point_actions_update_all" on public.point_actions;
create policy "point_actions_update_all"
on public.point_actions
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "point_actions_delete_all" on public.point_actions;
create policy "point_actions_delete_all"
on public.point_actions
for delete
to anon, authenticated
using (true);

create index if not exists point_actions_updated_at_idx
on public.point_actions (updated_at desc);
