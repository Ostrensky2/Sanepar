-- Fundação aditiva para Supabase Auth. Não remove políticas nem bloqueia o fluxo legado.
-- O cutover de RLS fica em migration separada e falha fechado até 11/11 vínculos.

begin;

create extension if not exists pgcrypto with schema extensions;

alter table public.auth_users
  add column if not exists auth_user_id uuid,
  add column if not exists auth_linked_at timestamptz,
  add column if not exists legacy_auth_disabled_at timestamptz;

-- Perfis novos no Supabase Auth não precisam de credencial na tabela funcional.
-- Valores históricos existentes são preservados integralmente.
alter table public.auth_users alter column password drop not null;

create unique index if not exists auth_users_auth_user_id_uidx
  on public.auth_users (auth_user_id)
  where auth_user_id is not null;

create unique index if not exists auth_users_email_normalized_uidx
  on public.auth_users (lower(btrim(email)));

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.auth_users'::regclass
      and conname = 'auth_users_auth_user_id_fkey'
  ) then
    alter table public.auth_users
      add constraint auth_users_auth_user_id_fkey
      foreign key (auth_user_id)
      references auth.users (id)
      on delete restrict
      not valid;
  end if;
end
$migration$;

alter table public.auth_users
  validate constraint auth_users_auth_user_id_fkey;

-- A janela progressiva precisa ler o hash legado somente pelo backend com
-- service_role. PostgreSQL não possui DENY por coluna: um grant SELECT na
-- tabela prevaleceria sobre qualquer revoke da coluna, portanto removemos o
-- grant de tabela e devolvemos explicitamente apenas as colunas não secretas.
revoke select on table public.auth_users from public, anon, authenticated;
revoke select (password) on table public.auth_users from public, anon, authenticated;
grant select (
  id,
  name,
  email,
  institution,
  role,
  status,
  must_change_password,
  created_at_label,
  last_access,
  updated_at,
  auth_user_id,
  auth_linked_at,
  legacy_auth_disabled_at
) on table public.auth_users to anon, authenticated;
grant select on table public.auth_users to service_role;

create table if not exists public.app_role_permissions (
  role_name text not null,
  permission text not null,
  created_at timestamptz not null default now(),
  primary key (role_name, permission),
  constraint app_role_permissions_role_name_check
    check (role_name in ('Admin', 'Sanepar', 'Tecpar', 'UFPR', 'ATGC')),
  constraint app_role_permissions_permission_check
    check (permission ~ '^[a-z][a-z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$')
);

insert into public.app_role_permissions (role_name, permission)
values
  ('Admin', 'nav.home'),
  ('Admin', 'nav.campaigns'),
  ('Admin', 'nav.results'),
  ('Admin', 'nav.data'),
  ('Admin', 'nav.documents'),
  ('Admin', 'nav.requests'),
  ('Admin', 'nav.settings'),
  ('Admin', 'nav.help'),
  ('Admin', 'dashboard.view'),
  ('Admin', 'campaigns.view'),
  ('Admin', 'data.view'),
  ('Admin', 'data.import'),
  ('Admin', 'data.delete'),
  ('Admin', 'documents.view'),
  ('Admin', 'documents.manage'),
  ('Admin', 'settings.manage'),
  ('Admin', 'backups.manage'),
  ('Admin', 'users.manage'),
  ('Admin', 'permissions.manage'),
  ('Admin', 'settings.buildSync'),
  ('Admin', 'settings.activity'),
  ('Admin', 'settings.rules'),
  ('Admin', 'settings.diagnostics'),
  ('Sanepar', 'nav.home'),
  ('Sanepar', 'nav.campaigns'),
  ('Sanepar', 'nav.results'),
  ('Sanepar', 'nav.data'),
  ('Sanepar', 'nav.documents'),
  ('Sanepar', 'nav.requests'),
  ('Sanepar', 'nav.settings'),
  ('Sanepar', 'nav.help'),
  ('Sanepar', 'dashboard.view'),
  ('Sanepar', 'campaigns.view'),
  ('Sanepar', 'data.view'),
  ('Sanepar', 'documents.view'),
  ('Sanepar', 'users.manage'),
  ('Tecpar', 'nav.home'),
  ('Tecpar', 'nav.campaigns'),
  ('Tecpar', 'nav.results'),
  ('Tecpar', 'nav.data'),
  ('Tecpar', 'nav.documents'),
  ('Tecpar', 'nav.requests'),
  ('Tecpar', 'nav.settings'),
  ('Tecpar', 'nav.help'),
  ('Tecpar', 'dashboard.view'),
  ('Tecpar', 'campaigns.view'),
  ('Tecpar', 'data.view'),
  ('Tecpar', 'documents.view'),
  ('Tecpar', 'users.manage'),
  ('UFPR', 'nav.home'),
  ('UFPR', 'nav.campaigns'),
  ('UFPR', 'nav.results'),
  ('UFPR', 'nav.data'),
  ('UFPR', 'nav.documents'),
  ('UFPR', 'nav.requests'),
  ('UFPR', 'nav.help'),
  ('UFPR', 'dashboard.view'),
  ('UFPR', 'campaigns.view'),
  ('UFPR', 'data.view'),
  ('UFPR', 'data.import'),
  ('UFPR', 'documents.view'),
  ('UFPR', 'documents.manage'),
  ('ATGC', 'nav.home'),
  ('ATGC', 'nav.campaigns'),
  ('ATGC', 'nav.results'),
  ('ATGC', 'nav.data'),
  ('ATGC', 'nav.documents'),
  ('ATGC', 'nav.requests'),
  ('ATGC', 'nav.settings'),
  ('ATGC', 'nav.help'),
  ('ATGC', 'dashboard.view'),
  ('ATGC', 'campaigns.view'),
  ('ATGC', 'data.view'),
  ('ATGC', 'data.import'),
  ('ATGC', 'documents.view'),
  ('ATGC', 'documents.manage'),
  ('ATGC', 'users.manage')
on conflict (role_name, permission) do nothing;

alter table public.app_role_permissions enable row level security;
alter table public.app_role_permissions force row level security;
revoke all on table public.app_role_permissions from public, anon, authenticated;
grant select, insert, update, delete on table public.app_role_permissions to service_role;

create or replace function public.current_auth_profile_id()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select profile.id
  from public.auth_users as profile
  where profile.auth_user_id = (select auth.uid())
    and lower(btrim(profile.status)) = 'ativo'
  limit 1
$function$;

create or replace function public.current_auth_role()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select profile.role
  from public.auth_users as profile
  where profile.auth_user_id = (select auth.uid())
    and lower(btrim(profile.status)) = 'ativo'
  limit 1
$function$;

create or replace function public.is_current_auth_profile_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.auth_users as profile
    where profile.auth_user_id = (select auth.uid())
      and lower(btrim(profile.status)) = 'ativo'
  )
$function$;

create or replace function public.has_current_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.auth_users as profile
    join public.app_role_permissions as permission
      on permission.role_name = profile.role
    where profile.auth_user_id = (select auth.uid())
      and lower(btrim(profile.status)) = 'ativo'
      and permission.permission = p_permission
  )
$function$;

revoke all on function public.current_auth_profile_id() from public;
revoke all on function public.current_auth_role() from public;
revoke all on function public.is_current_auth_profile_active() from public;
revoke all on function public.has_current_permission(text) from public;
grant execute on function public.current_auth_profile_id() to authenticated, service_role;
grant execute on function public.current_auth_role() to authenticated, service_role;
grant execute on function public.is_current_auth_profile_active() to authenticated, service_role;
grant execute on function public.has_current_permission(text) to authenticated, service_role;

create table if not exists public.auth_rate_limit_buckets (
  scope text not null,
  subject_hash text not null,
  window_started_at timestamptz not null,
  hit_count integer not null,
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope, subject_hash),
  constraint auth_rate_limit_buckets_scope_check
    check (scope ~ '^[a-z0-9][a-z0-9:_-]{0,63}$'),
  constraint auth_rate_limit_buckets_subject_hash_check
    check (subject_hash ~ '^[0-9a-f]{64}$'),
  constraint auth_rate_limit_buckets_hit_count_check
    check (hit_count > 0)
);

create index if not exists auth_rate_limit_buckets_expiry_idx
  on public.auth_rate_limit_buckets (updated_at);

alter table public.auth_rate_limit_buckets enable row level security;
alter table public.auth_rate_limit_buckets force row level security;
revoke all on table public.auth_rate_limit_buckets from public, anon, authenticated;
grant select, insert, update, delete on table public.auth_rate_limit_buckets to service_role;

create or replace function public.consume_auth_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer default 0
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_bucket public.auth_rate_limit_buckets%rowtype;
  v_block_until timestamptz;
  v_allowed boolean;
  v_remaining integer;
  v_retry integer;
begin
  if p_scope is null or p_scope !~ '^[a-z0-9][a-z0-9:_-]{0,63}$' then
    raise exception 'invalid rate-limit scope' using errcode = '22023';
  end if;
  if p_subject_hash is null or p_subject_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid rate-limit subject' using errcode = '22023';
  end if;
  if p_limit not between 1 and 10000
     or p_window_seconds not between 1 and 86400
     or p_block_seconds not between 0 and 604800 then
    raise exception 'invalid rate-limit bounds' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_scope || ':' || p_subject_hash, 0)
  );

  select bucket.*
  into v_bucket
  from public.auth_rate_limit_buckets as bucket
  where bucket.scope = p_scope
    and bucket.subject_hash = p_subject_hash
  for update;

  if not found then
    insert into public.auth_rate_limit_buckets (
      scope, subject_hash, window_started_at, hit_count, blocked_until, updated_at
    ) values (
      p_scope, p_subject_hash, v_now, 1, null, v_now
    );
    v_allowed := true;
    v_remaining := p_limit - 1;
    v_retry := 0;
  elsif v_bucket.blocked_until is not null and v_bucket.blocked_until > v_now then
    update public.auth_rate_limit_buckets
    set hit_count = hit_count + 1,
        updated_at = v_now
    where scope = p_scope and subject_hash = p_subject_hash;
    v_allowed := false;
    v_remaining := 0;
    v_retry := greatest(1, ceil(extract(epoch from (v_bucket.blocked_until - v_now)))::integer);
  elsif v_bucket.window_started_at + pg_catalog.make_interval(secs => p_window_seconds) <= v_now then
    update public.auth_rate_limit_buckets
    set window_started_at = v_now,
        hit_count = 1,
        blocked_until = null,
        updated_at = v_now
    where scope = p_scope and subject_hash = p_subject_hash;
    v_allowed := true;
    v_remaining := p_limit - 1;
    v_retry := 0;
  elsif v_bucket.hit_count >= p_limit then
    v_block_until := case
      when p_block_seconds > 0
        then v_now + pg_catalog.make_interval(secs => p_block_seconds)
      else v_bucket.window_started_at + pg_catalog.make_interval(secs => p_window_seconds)
    end;
    update public.auth_rate_limit_buckets
    set hit_count = hit_count + 1,
        blocked_until = v_block_until,
        updated_at = v_now
    where scope = p_scope and subject_hash = p_subject_hash;
    v_allowed := false;
    v_remaining := 0;
    v_retry := greatest(1, ceil(extract(epoch from (v_block_until - v_now)))::integer);
  else
    update public.auth_rate_limit_buckets
    set hit_count = hit_count + 1,
        updated_at = v_now
    where scope = p_scope and subject_hash = p_subject_hash;
    v_allowed := true;
    v_remaining := p_limit - (v_bucket.hit_count + 1);
    v_retry := 0;
  end if;

  return query select v_allowed, v_remaining, v_retry;
end
$function$;

revoke all on function public.consume_auth_rate_limit(text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_auth_rate_limit(text, text, integer, integer, integer) to service_role;

create table if not exists public.security_audit_log (
  id bigint generated always as identity primary key,
  request_id uuid,
  actor_auth_user_id uuid references auth.users (id) on delete set null,
  actor_profile_id text references public.auth_users (id) on delete set null,
  event_type text not null,
  outcome text not null,
  target_type text not null,
  target_id_hash text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint security_audit_log_event_type_check
    check (event_type ~ '^[a-z0-9][a-z0-9._:-]{0,95}$'),
  constraint security_audit_log_outcome_check
    check (outcome in ('success', 'denied', 'failure')),
  constraint security_audit_log_target_type_check
    check (target_type ~ '^[a-z0-9][a-z0-9._:-]{0,63}$'),
  constraint security_audit_log_target_hash_check
    check (target_id_hash is null or target_id_hash ~ '^[0-9a-f]{64}$'),
  constraint security_audit_log_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint security_audit_log_metadata_size_check
    check (pg_column_size(metadata) <= 8192)
);

create index if not exists security_audit_log_occurred_at_idx
  on public.security_audit_log (occurred_at desc);
create index if not exists security_audit_log_actor_idx
  on public.security_audit_log (actor_auth_user_id, occurred_at desc);

alter table public.security_audit_log enable row level security;
alter table public.security_audit_log force row level security;
revoke all on table public.security_audit_log from public, anon, authenticated;
grant select, insert on table public.security_audit_log to service_role;
grant usage, select on sequence public.security_audit_log_id_seq to service_role;

create or replace function public.write_security_audit(
  p_event_type text,
  p_outcome text,
  p_target_type text,
  p_target_id_hash text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_request_id uuid default null
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_id bigint;
begin
  if p_event_type is null or p_event_type !~ '^[a-z0-9][a-z0-9._:-]{0,95}$'
     or p_outcome not in ('success', 'denied', 'failure')
     or p_target_type is null or p_target_type !~ '^[a-z0-9][a-z0-9._:-]{0,63}$'
     or (p_target_id_hash is not null and p_target_id_hash !~ '^[0-9a-f]{64}$') then
    raise exception 'invalid audit metadata' using errcode = '22023';
  end if;
  if p_metadata is null
     or jsonb_typeof(p_metadata) <> 'object'
     or pg_column_size(p_metadata) > 8192
     or p_metadata::text ~* '"(password|token|secret|authorization|cookie|email|ip)"\s*:' then
    raise exception 'sensitive or invalid audit payload' using errcode = '22023';
  end if;

  insert into public.security_audit_log (
    request_id,
    actor_auth_user_id,
    actor_profile_id,
    event_type,
    outcome,
    target_type,
    target_id_hash,
    metadata
  ) values (
    p_request_id,
    auth.uid(),
    public.current_auth_profile_id(),
    p_event_type,
    p_outcome,
    p_target_type,
    p_target_id_hash,
    p_metadata
  )
  returning id into v_id;

  return v_id;
end
$function$;

revoke all on function public.write_security_audit(text, text, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.write_security_audit(text, text, text, text, jsonb, uuid) to service_role;

create or replace function public.audit_auth_profile_security_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.role is distinct from new.role
     or old.status is distinct from new.status
     or old.auth_user_id is distinct from new.auth_user_id
     or old.legacy_auth_disabled_at is distinct from new.legacy_auth_disabled_at then
    insert into public.security_audit_log (
      actor_auth_user_id,
      actor_profile_id,
      event_type,
      outcome,
      target_type,
      target_id_hash,
      metadata
    ) values (
      auth.uid(),
      public.current_auth_profile_id(),
      'auth.profile.security_changed',
      'success',
      'auth_profile',
      encode(extensions.digest(new.id, 'sha256'), 'hex'),
      jsonb_build_object(
        'role_before', old.role,
        'role_after', new.role,
        'status_before', old.status,
        'status_after', new.status,
        'auth_link_changed', old.auth_user_id is distinct from new.auth_user_id,
        'legacy_auth_disabled_changed', old.legacy_auth_disabled_at is distinct from new.legacy_auth_disabled_at
      )
    );
  end if;
  return new;
end
$function$;

drop trigger if exists auth_users_security_audit_trigger on public.auth_users;
create trigger auth_users_security_audit_trigger
after update of role, status, auth_user_id, legacy_auth_disabled_at
on public.auth_users
for each row
execute function public.audit_auth_profile_security_change();

-- Finaliza uma migração progressiva individual em uma única instrução
-- condicional. A senha/hash histórico é preservada, mas deixa de ser elegível
-- para autenticação no mesmo instante em que o perfil recebe auth_user_id.
create or replace function public.link_migrated_auth_user(
  p_profile_id text,
  p_auth_user_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_linked_id text;
  v_now timestamptz := transaction_timestamp();
begin
  if p_profile_id is null or btrim(p_profile_id) = '' or p_auth_user_id is null then
    raise exception 'invalid migrated auth link' using errcode = '22023';
  end if;

  update public.auth_users as profile
  set auth_user_id = p_auth_user_id,
      auth_linked_at = v_now,
      legacy_auth_disabled_at = v_now,
      updated_at = v_now
  from auth.users as auth_user
  where profile.id = p_profile_id
    and profile.auth_user_id is null
    and profile.legacy_auth_disabled_at is null
    and profile.password is not null
    and lower(btrim(profile.status)) = 'ativo'
    and auth_user.id = p_auth_user_id
    and lower(btrim(auth_user.email)) = lower(btrim(profile.email))
    and auth_user.deleted_at is null
    and (auth_user.banned_until is null or auth_user.banned_until <= v_now)
  returning profile.id into v_linked_id;

  return v_linked_id is not null;
end
$function$;

revoke all on function public.link_migrated_auth_user(text, uuid) from public, anon, authenticated;
grant execute on function public.link_migrated_auth_user(text, uuid) to service_role;

-- Compatibilidade com o log legado: conserva colunas e dados, adicionando ator UUID.
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

alter table public.app_activity_logs
  add column if not exists actor_auth_user_id uuid;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.app_activity_logs'::regclass
      and conname = 'app_activity_logs_actor_auth_user_id_fkey'
  ) then
    alter table public.app_activity_logs
      add constraint app_activity_logs_actor_auth_user_id_fkey
      foreign key (actor_auth_user_id)
      references auth.users (id)
      on delete set null
      not valid;
  end if;
end
$migration$;

alter table public.app_activity_logs
  validate constraint app_activity_logs_actor_auth_user_id_fkey;

create index if not exists app_activity_logs_actor_auth_user_id_idx
  on public.app_activity_logs (actor_auth_user_id, created_at desc);

alter table public.support_requests
  add column if not exists created_by_auth_user_id uuid;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.support_requests'::regclass
      and conname = 'support_requests_created_by_auth_user_id_fkey'
  ) then
    alter table public.support_requests
      add constraint support_requests_created_by_auth_user_id_fkey
      foreign key (created_by_auth_user_id)
      references auth.users (id)
      on delete set null
      not valid;
  end if;
end
$migration$;

alter table public.support_requests
  validate constraint support_requests_created_by_auth_user_id_fkey;

create index if not exists support_requests_created_by_auth_user_id_idx
  on public.support_requests (created_by_auth_user_id, updated_at desc);

commit;
