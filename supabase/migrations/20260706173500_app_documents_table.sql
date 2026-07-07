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

alter table public.app_documents enable row level security;

drop policy if exists "app_documents_select_all" on public.app_documents;
create policy "app_documents_select_all"
on public.app_documents
for select
to anon, authenticated
using (true);

drop policy if exists "app_documents_insert_all" on public.app_documents;
create policy "app_documents_insert_all"
on public.app_documents
for insert
to anon, authenticated
with check (true);

drop policy if exists "app_documents_update_all" on public.app_documents;
create policy "app_documents_update_all"
on public.app_documents
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "app_documents_delete_all" on public.app_documents;
create policy "app_documents_delete_all"
on public.app_documents
for delete
to anon, authenticated
using (true);

create index if not exists app_documents_updated_at_idx
on public.app_documents (updated_at desc);

create index if not exists app_documents_storage_idx
on public.app_documents (storage_bucket, storage_path)
where storage_bucket is not null and storage_path is not null;
