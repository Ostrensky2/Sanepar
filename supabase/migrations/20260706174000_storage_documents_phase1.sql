-- Fase 1 da migração de links externos para Supabase Storage.
-- Mantém links antigos funcionando e habilita novos documentos por upload.

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

alter table public.app_documents
  alter column dropbox_url drop not null,
  add column if not exists original_url text,
  add column if not exists original_name text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists storage_bucket text,
  add column if not exists storage_path text;

update public.app_documents
set original_url = dropbox_url
where original_url is null
  and dropbox_url is not null;

create index if not exists app_documents_storage_idx
on public.app_documents (storage_bucket, storage_path)
where storage_bucket is not null and storage_path is not null;
