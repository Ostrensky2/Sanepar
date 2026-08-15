-- Fixture sintética local. Não contém contas, e-mails ou hashes reais.
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$roles$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $function$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$function$;

create table auth.users (
  id uuid primary key,
  email text,
  deleted_at timestamptz,
  banned_until timestamptz
);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  name text not null
);
alter table storage.objects enable row level security;

create table public.auth_users (
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

create table public.campaign_imports (id uuid primary key default gen_random_uuid());
create table public.campaign_management (id text primary key);
create table public.lab_risk_results (id uuid primary key default gen_random_uuid());
create table public.point_actions (id text primary key);
create table public.field_diary_entries (id text primary key);
create table public.field_diary_change_log (id uuid primary key default gen_random_uuid());
create table public.app_documents (id text primary key);
create table public.import_conflicts (id uuid primary key default gen_random_uuid());
create table public.support_requests (
  id text primary key,
  updated_at timestamptz not null default now()
);

do $policies$
declare
  v_table text;
begin
  foreach v_table in array array[
    'auth_users', 'campaign_imports', 'campaign_management', 'lab_risk_results',
    'point_actions', 'field_diary_entries', 'field_diary_change_log',
    'app_documents', 'import_conflicts', 'support_requests'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', v_table);
    execute format('create policy %I on public.%I for all to anon, authenticated using (true) with check (true)', v_table || '_all', v_table);
  end loop;
end
$policies$;
