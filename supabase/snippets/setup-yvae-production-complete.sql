-- Bootstrap completo do Yvae em um projeto Supabase novo.
-- Pode ser executado no SQL Editor do Supabase.

create table if not exists public.campaign_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  row_count integer not null default 0,
  point_count integer not null default 0,
  original_point_count integer not null default 0,
  effective_point_count integer not null default 0,
  missing_fields text[] not null default '{}',
  points jsonb not null,
  created_at timestamptz not null default now(),
  campaign_key text
);

create table if not exists public.point_actions (
  id text primary key,
  event_name text not null,
  objectives text not null,
  document jsonb,
  created_at_label text not null,
  points jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_documents (
  id text primary key,
  title text not null,
  dropbox_url text,
  original_url text,
  campaign text not null,
  point text not null,
  date_label text not null,
  type text not null,
  status text not null,
  source text not null default 'link',
  original_name text,
  mime_type text,
  size_bytes bigint,
  storage_bucket text,
  storage_path text,
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_management (
  id text primary key,
  management jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.lab_risk_results (
  id uuid primary key default gen_random_uuid(),
  file_name text not null default '',
  row_count integer not null default 0,
  risk_row_count integer not null default 0,
  points jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.auth_users (
  id text primary key,
  name text not null,
  email text not null unique,
  institution text not null,
  role text not null,
  status text not null,
  password text not null,
  must_change_password boolean not null default true,
  created_at_label text not null,
  last_access text not null default 'Nunca',
  updated_at timestamptz not null default now()
);

create table if not exists public.support_requests (
  id text primary key,
  title text not null,
  requester text not null,
  institution text not null,
  type text not null,
  priority text not null,
  description text not null,
  response text not null default '',
  response_updated_at timestamptz,
  status text not null,
  notified boolean not null default false,
  notified_at timestamptz,
  created_at_label text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.field_diary_entries (
  id text primary key,
  campaign_id text,
  campaign_name text not null,
  campaign_day integer not null,
  entry_date date not null,
  field_team_name text,
  field_team_members text[] not null default '{}',
  collection_time text,
  location_name text not null,
  sia text,
  samples_replicas_edna text,
  zooplankton_id text,
  latitude text,
  longitude text,
  municipality text not null,
  activities text[] not null default '{}',
  water_visual_conditions text[] not null default '{}',
  has_occurrence boolean not null default false,
  occurrence_type text,
  occurrence_description text,
  requires_follow_up text not null default 'Não',
  follow_up_notes text,
  weather_conditions text,
  point_accessibility text,
  daily_summary text not null,
  status text not null,
  created_by text,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  photos jsonb not null default '[]'::jsonb
);

create index if not exists campaign_imports_created_at_idx on public.campaign_imports (created_at desc);
create index if not exists campaign_imports_campaign_key_idx on public.campaign_imports (campaign_key, created_at desc);
create index if not exists point_actions_updated_at_idx on public.point_actions (updated_at desc);
create index if not exists app_documents_updated_at_idx on public.app_documents (updated_at desc);
create index if not exists app_documents_storage_idx on public.app_documents (storage_bucket, storage_path)
where storage_bucket is not null and storage_path is not null;
create index if not exists lab_risk_results_created_at_idx on public.lab_risk_results (created_at desc);
create index if not exists auth_users_name_idx on public.auth_users (name asc);
create index if not exists support_requests_updated_at_idx on public.support_requests (updated_at desc);
create index if not exists field_diary_entries_entry_date_idx on public.field_diary_entries (entry_date desc, updated_at desc);
create index if not exists field_diary_entries_campaign_day_idx on public.field_diary_entries (campaign_name, entry_date desc, campaign_day);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'campaign_imports',
    'point_actions',
    'app_documents',
    'campaign_management',
    'lab_risk_results',
    'auth_users',
    'support_requests',
    'field_diary_entries'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_select_all', table_name);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', table_name || '_select_all', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_insert_all', table_name);
    execute format('create policy %I on public.%I for insert to anon, authenticated with check (true)', table_name || '_insert_all', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_update_all', table_name);
    execute format('create policy %I on public.%I for update to anon, authenticated using (true) with check (true)', table_name || '_update_all', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_delete_all', table_name);
    execute format('create policy %I on public.%I for delete to anon, authenticated using (true)', table_name || '_delete_all', table_name);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'documents',
    'documents',
    false,
    52428800,
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ]
  ),
  (
    'photos',
    'photos',
    false,
    20971520,
    array[
      'image/png',
      'image/jpeg',
      'image/jpg'
    ]
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "yvae_storage_select_documents" on storage.objects;
create policy "yvae_storage_select_documents"
on storage.objects
for select
to anon, authenticated
using (bucket_id in ('documents', 'photos'));

drop policy if exists "yvae_storage_insert_documents" on storage.objects;
create policy "yvae_storage_insert_documents"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id in ('documents', 'photos'));

drop policy if exists "yvae_storage_update_documents" on storage.objects;
create policy "yvae_storage_update_documents"
on storage.objects
for update
to anon, authenticated
using (bucket_id in ('documents', 'photos'))
with check (bucket_id in ('documents', 'photos'));

drop policy if exists "yvae_storage_delete_documents" on storage.objects;
create policy "yvae_storage_delete_documents"
on storage.objects
for delete
to anon, authenticated
using (bucket_id in ('documents', 'photos'));
