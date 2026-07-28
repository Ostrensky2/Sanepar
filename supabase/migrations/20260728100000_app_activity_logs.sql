-- Tabela para centralização de logs de atividade dos membros no Supabase.

create table if not exists public.app_activity_logs (
  id text primary key,
  user_id text not null,
  name text not null,
  email text not null,
  role text not null,
  kind text not null,
  target text not null,
  detail text,
  created_at timestamptz not null default now()
);

alter table public.app_activity_logs enable row level security;

drop policy if exists "app_activity_logs_select_all" on public.app_activity_logs;
create policy "app_activity_logs_select_all"
on public.app_activity_logs
for select
to anon, authenticated
using (true);

drop policy if exists "app_activity_logs_insert_all" on public.app_activity_logs;
create policy "app_activity_logs_insert_all"
on public.app_activity_logs
for insert
to anon, authenticated
with check (true);

create index if not exists app_activity_logs_created_at_idx
on public.app_activity_logs (created_at desc);

create index if not exists app_activity_logs_user_id_idx
on public.app_activity_logs (user_id);
