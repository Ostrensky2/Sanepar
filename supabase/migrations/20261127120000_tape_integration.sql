-- Conexão Yva'e → Tapê: exportação autorizada de dados de campo (somente leitura).
--
-- O Tapê nunca recebe senha nem sessão do Yva'e. Um usuário com a permissão
-- "integrations.delegate" autoriza, na própria tela do Yva'e, uma concessão de
-- até 8 horas para um cliente previamente registrado. O servidor do Tapê troca
-- o código de uso único (PKCE) por um par de tokens de curta duração e lê um
-- retrato consistente dos dados de campo, página a página.
--
-- Todo o estado fica no esquema "private" (fora do PostgREST). O servidor do
-- Yva'e fala com ele só por funções SECURITY DEFINER liberadas para service_role.
-- Nenhum dado de negócio do Yva'e é alterado por esta migração.

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists private.tape_clients (
  client_id text primary key check (client_id ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  secret_sha256 text not null check (secret_sha256 ~ '^[a-f0-9]{64}$'),
  callbacks text[] not null check (cardinality(callbacks) between 1 and 5),
  scope_id text not null check (char_length(scope_id) between 1 and 120),
  source_project_id text not null check (char_length(source_project_id) between 1 and 120),
  destination_project_id text not null check (char_length(destination_project_id) between 1 and 120),
  destination_contract_id text not null check (char_length(destination_contract_id) between 1 and 120),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.tape_requests (
  id_sha256 text primary key check (id_sha256 ~ '^[a-f0-9]{64}$'),
  client_id text not null references private.tape_clients (client_id) on delete cascade,
  callback text not null,
  state text not null,
  challenge text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists private.tape_codes (
  code_sha256 text primary key check (code_sha256 ~ '^[a-f0-9]{64}$'),
  client_id text not null references private.tape_clients (client_id) on delete cascade,
  callback text not null,
  challenge text not null,
  actor_id uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists private.tape_grants (
  id text primary key,
  client_id text not null references private.tape_clients (client_id) on delete cascade,
  actor_id uuid not null,
  scope text not null check (scope = 'field:read'),
  binding jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_reason text
);

create index if not exists tape_grants_actor_idx on private.tape_grants (actor_id, created_at desc);

create table if not exists private.tape_tokens (
  token_sha256 text primary key check (token_sha256 ~ '^[a-f0-9]{64}$'),
  grant_id text not null references private.tape_grants (id) on delete cascade,
  kind text not null check (kind in ('access', 'refresh')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

create index if not exists tape_tokens_grant_idx on private.tape_tokens (grant_id, kind);

create table if not exists private.tape_snapshots (
  id text primary key,
  grant_id text not null references private.tape_grants (id) on delete cascade,
  idempotency_key text not null,
  state text not null default 'preparing' check (state in ('preparing', 'ready')),
  source jsonb not null,
  envelope jsonb,
  item_count integer not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint tape_snapshots_request_unique unique (grant_id, idempotency_key)
);

create table if not exists private.tape_snapshot_items (
  snapshot_id text not null references private.tape_snapshots (id) on delete cascade,
  seq integer not null,
  item jsonb not null,
  primary key (snapshot_id, seq)
);

create table if not exists private.tape_snapshot_objects (
  snapshot_id text not null references private.tape_snapshots (id) on delete cascade,
  opaque_id text not null,
  bucket text not null,
  path text not null,
  version text not null,
  size bigint,
  mime text,
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  state text not null default 'pending'
    check (state in ('pending', 'ready', 'missing', 'too_large', 'changed', 'unsupported')),
  reason text,
  primary key (snapshot_id, opaque_id)
);

-- Hash já calculado de um objeto do Storage numa versão (eTag) conhecida.
create table if not exists private.tape_object_hashes (
  bucket text not null,
  path text not null,
  version text not null,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  size bigint not null,
  hashed_at timestamptz not null default now(),
  primary key (bucket, path, version)
);

create table if not exists private.tape_audit (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  event text not null,
  client_id text,
  grant_id text,
  actor_id uuid,
  detail jsonb not null default '{}'::jsonb
);

create index if not exists tape_audit_at_idx on private.tape_audit (at desc);

alter table private.tape_clients enable row level security;
alter table private.tape_requests enable row level security;
alter table private.tape_codes enable row level security;
alter table private.tape_grants enable row level security;
alter table private.tape_tokens enable row level security;
alter table private.tape_snapshots enable row level security;
alter table private.tape_snapshot_items enable row level security;
alter table private.tape_snapshot_objects enable row level security;
alter table private.tape_object_hashes enable row level security;
alter table private.tape_audit enable row level security;

-- Só as tabelas desta conexão: as outras tabelas do esquema private não são tocadas.
revoke all on
  private.tape_clients,
  private.tape_requests,
  private.tape_codes,
  private.tape_grants,
  private.tape_tokens,
  private.tape_snapshots,
  private.tape_snapshot_items,
  private.tape_snapshot_objects,
  private.tape_object_hashes,
  private.tape_audit
from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Auditoria e cliente
-- ---------------------------------------------------------------------------

create or replace function public.tape_audit_add(
  p_event text, p_client_id text, p_grant_id text, p_actor_id uuid, p_detail jsonb
) returns void
language sql security definer set search_path = ''
as $$
  insert into private.tape_audit (event, client_id, grant_id, actor_id, detail)
  values (p_event, p_client_id, p_grant_id, p_actor_id, coalesce(p_detail, '{}'::jsonb));
$$;

create or replace function public.tape_client_binding(c private.tape_clients) returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'scopeId', c.scope_id,
    'sourceProjectId', c.source_project_id,
    'destinationProjectId', c.destination_project_id,
    'destinationContractId', c.destination_contract_id,
    'callbacks', to_jsonb(c.callbacks)
  );
$$;

-- Registro de cliente: ação administrativa explícita (script/SQL), nunca pela API.
create or replace function public.tape_client_register(
  p_client_id text, p_secret_sha256 text, p_callbacks text[], p_scope_id text,
  p_source_project_id text, p_destination_project_id text, p_destination_contract_id text,
  p_active boolean
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.tape_clients as c (
    client_id, secret_sha256, callbacks, scope_id, source_project_id,
    destination_project_id, destination_contract_id, active
  ) values (
    p_client_id, p_secret_sha256, p_callbacks, p_scope_id, p_source_project_id,
    p_destination_project_id, p_destination_contract_id, p_active
  )
  on conflict (client_id) do update set
    secret_sha256 = excluded.secret_sha256,
    callbacks = excluded.callbacks,
    scope_id = excluded.scope_id,
    source_project_id = excluded.source_project_id,
    destination_project_id = excluded.destination_project_id,
    destination_contract_id = excluded.destination_contract_id,
    active = excluded.active,
    updated_at = now();
  perform public.tape_audit_add('client_registered', p_client_id, null, null,
    jsonb_build_object('active', p_active, 'callbacks', to_jsonb(p_callbacks)));
end;
$$;

create or replace function public.tape_client_read(p_client_id text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'clientId', c.client_id, 'secretSha256', c.secret_sha256, 'active', c.active,
    'binding', public.tape_client_binding(c)
  )
  from private.tape_clients c where c.client_id = p_client_id;
$$;

-- ---------------------------------------------------------------------------
-- Pedido, consentimento, troca do código e renovação
-- ---------------------------------------------------------------------------

create or replace function public.tape_request_create(
  p_id_sha256 text, p_client_id text, p_callback text, p_state text, p_challenge text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from private.tape_clients c
    where c.client_id = p_client_id and c.active and p_callback = any (c.callbacks)
  ) then
    return jsonb_build_object('error', 'client_not_registered');
  end if;
  delete from private.tape_requests where expires_at < now() - interval '1 day';
  delete from private.tape_codes where expires_at < now() - interval '1 day';
  insert into private.tape_requests (id_sha256, client_id, callback, state, challenge, expires_at)
  values (p_id_sha256, p_client_id, p_callback, p_state, p_challenge, now() + interval '10 minutes');
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.tape_request_read(p_id_sha256 text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'clientId', r.client_id, 'callback', r.callback, 'expiresAt', r.expires_at,
    'binding', public.tape_client_binding(c)
  )
  from private.tape_requests r
  join private.tape_clients c on c.client_id = r.client_id
  where r.id_sha256 = p_id_sha256 and r.used_at is null and r.expires_at > now()
    and c.active and r.callback = any (c.callbacks);
$$;

-- Decisão do usuário: o pedido é consumido uma única vez, aprovando ou recusando.
create or replace function public.tape_consent(
  p_id_sha256 text, p_actor_id uuid, p_approve boolean, p_code_sha256 text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  r private.tape_requests;
begin
  update private.tape_requests set used_at = now()
  where id_sha256 = p_id_sha256 and used_at is null and expires_at > now()
  returning * into r;
  if not found then
    return jsonb_build_object('error', 'invalid_request');
  end if;
  if not exists (
    select 1 from private.tape_clients c
    where c.client_id = r.client_id and c.active and r.callback = any (c.callbacks)
  ) then
    return jsonb_build_object('error', 'client_not_registered');
  end if;
  if p_approve then
    insert into private.tape_codes (code_sha256, client_id, callback, challenge, actor_id, expires_at)
    values (p_code_sha256, r.client_id, r.callback, r.challenge, p_actor_id, now() + interval '60 seconds');
  end if;
  perform public.tape_audit_add(
    case when p_approve then 'consent_approved' else 'consent_denied' end,
    r.client_id, null, p_actor_id, '{}'::jsonb);
  return jsonb_build_object('callback', r.callback, 'state', r.state, 'approved', p_approve);
end;
$$;

create or replace function public.tape_code_actor(p_code_sha256 text) returns uuid
language sql stable security definer set search_path = ''
as $$
  select actor_id from private.tape_codes
  where code_sha256 = p_code_sha256 and used_at is null and expires_at > now();
$$;

create or replace function public.tape_exchange_code(
  p_code_sha256 text, p_client_id text, p_callback text, p_challenge text,
  p_grant_id text, p_access_sha256 text, p_refresh_sha256 text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  c private.tape_codes;
  cl private.tape_clients;
  v_grant_expires timestamptz := now() + interval '8 hours';
  v_access_expires timestamptz := now() + interval '5 minutes';
begin
  -- O código é consumido mesmo quando a troca falha: uso único de verdade.
  update private.tape_codes set used_at = now()
  where code_sha256 = p_code_sha256 and used_at is null
  returning * into c;
  if not found or c.expires_at <= now() or c.client_id <> p_client_id
     or c.callback <> p_callback or c.challenge <> p_challenge then
    return jsonb_build_object('error', 'invalid_grant');
  end if;
  select * into cl from private.tape_clients
  where client_id = p_client_id and active and p_callback = any (callbacks);
  if not found then
    return jsonb_build_object('error', 'client_not_registered');
  end if;
  insert into private.tape_grants (id, client_id, actor_id, scope, binding, expires_at)
  values (p_grant_id, p_client_id, c.actor_id, 'field:read', public.tape_client_binding(cl), v_grant_expires);
  insert into private.tape_tokens (token_sha256, grant_id, kind, expires_at) values
    (p_access_sha256, p_grant_id, 'access', v_access_expires),
    (p_refresh_sha256, p_grant_id, 'refresh', v_grant_expires);
  perform public.tape_audit_add('grant_issued', p_client_id, p_grant_id, c.actor_id, '{}'::jsonb);
  return jsonb_build_object(
    'grantId', p_grant_id, 'actorId', c.actor_id, 'scopeId', cl.scope_id,
    'expiresIn', 300, 'grantExpiresAt', v_grant_expires);
end;
$$;

create or replace function public.tape_grant_read(p_grant_id text, p_client_id text) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'grantId', g.id, 'clientId', g.client_id, 'actorId', g.actor_id,
    'expiresAt', g.expires_at, 'revoked', g.revoked_at is not null)
  from private.tape_grants g where g.id = p_grant_id and g.client_id = p_client_id;
$$;

-- Renovação rotativa. A linha da concessão é travada: duas renovações
-- simultâneas ficam em fila, e o reuso de um refresh já consumido revoga tudo.
create or replace function public.tape_refresh(
  p_refresh_sha256 text, p_client_id text, p_grant_id text,
  p_access_sha256 text, p_new_refresh_sha256 text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  g private.tape_grants;
  t private.tape_tokens;
  cl private.tape_clients;
  v_access_expires timestamptz;
begin
  select * into g from private.tape_grants
  where id = p_grant_id and client_id = p_client_id for update;
  if not found then
    return jsonb_build_object('error', 'invalid_grant');
  end if;
  select * into t from private.tape_tokens
  where token_sha256 = p_refresh_sha256 and grant_id = p_grant_id and kind = 'refresh';
  if not found then
    return jsonb_build_object('error', 'invalid_grant');
  end if;
  if g.revoked_at is not null or g.expires_at <= now() then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if t.used_at is not null then
    update private.tape_grants set revoked_at = now(), revoked_reason = 'refresh_replay' where id = g.id;
    perform public.tape_audit_add('refresh_replay', p_client_id, g.id, g.actor_id, '{}'::jsonb);
    return jsonb_build_object('error', 'refresh_replay');
  end if;
  select * into cl from private.tape_clients where client_id = p_client_id and active;
  if not found or public.tape_client_binding(cl) <> g.binding then
    return jsonb_build_object('error', 'forbidden');
  end if;
  v_access_expires := least(now() + interval '5 minutes', g.expires_at);
  update private.tape_tokens set used_at = now() where token_sha256 = p_refresh_sha256;
  insert into private.tape_tokens (token_sha256, grant_id, kind, expires_at) values
    (p_access_sha256, g.id, 'access', v_access_expires),
    (p_new_refresh_sha256, g.id, 'refresh', g.expires_at);
  delete from private.tape_tokens
  where grant_id = g.id and kind = 'access' and expires_at < now() - interval '10 minutes';
  perform public.tape_audit_add('token_refreshed', p_client_id, g.id, g.actor_id, '{}'::jsonb);
  return jsonb_build_object(
    'grantId', g.id, 'actorId', g.actor_id, 'scopeId', cl.scope_id,
    'expiresIn', greatest(1, floor(extract(epoch from (v_access_expires - now())))::int),
    'grantExpiresAt', g.expires_at);
end;
$$;

-- Validação do token de acesso a cada chamada: token, concessão, cliente e vínculo.
create or replace function public.tape_access(p_access_sha256 text) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  t private.tape_tokens;
  g private.tape_grants;
  cl private.tape_clients;
begin
  select * into t from private.tape_tokens
  where token_sha256 = p_access_sha256 and kind = 'access' and expires_at > now();
  if not found then
    return jsonb_build_object('error', 'invalid_token');
  end if;
  select * into g from private.tape_grants where id = t.grant_id;
  if not found or g.revoked_at is not null or g.expires_at <= now() then
    return jsonb_build_object('error', 'forbidden');
  end if;
  select * into cl from private.tape_clients where client_id = g.client_id and active;
  if not found or public.tape_client_binding(cl) <> g.binding then
    return jsonb_build_object('error', 'forbidden');
  end if;
  return jsonb_build_object(
    'grantId', g.id, 'clientId', g.client_id, 'actorId', g.actor_id,
    'tokenExpiresAt', t.expires_at, 'grantExpiresAt', g.expires_at, 'binding', g.binding);
end;
$$;

create or replace function public.tape_revoke(
  p_grant_id text, p_client_id text, p_actor_id uuid, p_reason text
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  g private.tape_grants;
begin
  select * into g from private.tape_grants
  where id = p_grant_id
    and (p_client_id is null or client_id = p_client_id)
    and (p_actor_id is null or actor_id = p_actor_id)
  for update;
  if not found then
    return false;
  end if;
  if g.revoked_at is null then
    update private.tape_grants set revoked_at = now(), revoked_reason = p_reason where id = g.id;
    perform public.tape_audit_add('grant_revoked', g.client_id, g.id, g.actor_id,
      jsonb_build_object('reason', p_reason));
  end if;
  return true;
end;
$$;

create or replace function public.tape_grants_for_actor(p_actor_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'grantId', g.id, 'clientId', g.client_id, 'createdAt', g.created_at,
    'expiresAt', g.expires_at, 'revokedAt', g.revoked_at,
    'active', g.revoked_at is null and g.expires_at > now()
  ) order by g.created_at desc), '[]'::jsonb)
  from private.tape_grants g
  where g.actor_id = p_actor_id and g.created_at > now() - interval '30 days';
$$;

-- ---------------------------------------------------------------------------
-- Retrato dos dados de campo
-- ---------------------------------------------------------------------------

-- Uma única instrução SQL: todas as tabelas são lidas na mesma visão do banco.
-- Só dados de campo. Resultados de laboratório, índices de risco, contas e
-- permissões não entram.
create or replace function public.tape_field_export() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'entries', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.id) from (
        select id, campaign_id, campaign_name, campaign_day, entry_date, collection_time,
               collection_started_at, location_name, sia, samples_replicas_edna, zooplankton_id,
               latitude, longitude, coordinate_source, gps_accuracy_m, municipality, activities,
               water_visual_conditions, has_occurrence, occurrence_type, occurrence_description,
               requires_follow_up, follow_up_notes, weather_conditions, point_accessibility,
               daily_summary, status, governance_status, execution_status, relocation_reason,
               collection_order, missing_in_import, field_team_name, field_team_members, photos,
               created_by_name, created_at, updated_at
        from public.field_diary_entries
      ) e), '[]'::jsonb),
    'samples', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.id) from (
        select id, entry_id, sample_code, project_code, sample_type, sequence, depth_m, quantity,
               quantity_unit, specification, conservation, packaging, preservative, box_position, updated_at
        from public.field_diary_samples
      ) s), '[]'::jsonb),
    'parameters', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.id) from (
        select id, label, unit, min_value, max_value, applies_to, uses_depth, is_base, active,
               updated_at
        from public.field_parameters
      ) p), '[]'::jsonb),
    'readings', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.id) from (
        select id, entry_id, parameter_id, value, unit, depth_m, measured_time, equipment,
               updated_at
        from public.field_parameter_readings
      ) r), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(to_jsonb(d) order by d.id) from (
        select id, title, campaign, point, date_label, type, status, source, original_name,
               mime_type, size_bytes, storage_bucket, storage_path, updated_at
        from public.app_documents
      ) d), '[]'::jsonb),
    'campaignImports', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.campaign_key) from (
        select distinct on (campaign_key) id, campaign_key, file_name, row_count, points, created_at
        from public.campaign_imports
        where campaign_key is not null and file_name not like '\_\_%' escape '\'
        order by campaign_key, created_at desc, id desc
      ) i), '[]'::jsonb),
    'campaignImportRevisions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'campaignKey', campaign_key, 'createdAt', created_at, 'rowCount', row_count
      ) order by campaign_key, created_at, id)
      from public.campaign_imports
      where campaign_key is not null and file_name not like '\_\_%' escape '\'), '[]'::jsonb),
    'campaignManagement', coalesce((
      select management from public.campaign_management where id = 'singleton'), '{}'::jsonb),
    'pointActions', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.id) from (
        select id, event_name, objectives, created_at_label, points, document, updated_at
        from public.point_actions
      ) a), '[]'::jsonb),
    'storageObjects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bucket', o.bucket_id, 'path', o.name,
        'size', (o.metadata ->> 'size')::bigint,
        'mime', o.metadata ->> 'mimetype',
        'version', coalesce(o.metadata ->> 'eTag', o.version, o.updated_at::text)
      ) order by o.bucket_id, o.name)
      from storage.objects o where o.bucket_id in ('photos', 'documents')), '[]'::jsonb)
  );
$$;

create or replace function public.tape_snapshot_create(
  p_id text, p_grant_id text, p_idempotency_key text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.tape_snapshots;
  g private.tape_grants;
  v_replayed boolean := true;
begin
  select * into g from private.tape_grants where id = p_grant_id for update;
  if not found or g.revoked_at is not null or g.expires_at <= now() then
    return jsonb_build_object('error', 'forbidden');
  end if;
  select * into s from private.tape_snapshots
  where grant_id = p_grant_id and idempotency_key = p_idempotency_key;
  if not found then
    delete from private.tape_snapshots where expires_at < now() - interval '1 day';
    insert into private.tape_snapshots (id, grant_id, idempotency_key, source, expires_at)
    values (p_id, p_grant_id, p_idempotency_key, public.tape_field_export(), g.expires_at)
    returning * into s;
    v_replayed := false;
    perform public.tape_audit_add('snapshot_created', g.client_id, g.id, g.actor_id,
      jsonb_build_object('snapshotId', s.id));
  elsif s.expires_at <= now() then
    return jsonb_build_object('error', 'snapshot_expired');
  end if;
  return jsonb_build_object(
    'snapshotId', s.id, 'state', s.state, 'expiresAt', s.expires_at,
    'createdAt', s.created_at, 'replayed', v_replayed);
end;
$$;

create or replace function public.tape_snapshot_read(p_id text, p_grant_id text, p_with_source boolean)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'snapshotId', s.id, 'state', s.state, 'expiresAt', s.expires_at, 'createdAt', s.created_at,
    'expired', s.expires_at <= now(), 'itemCount', s.item_count,
    'source', case when p_with_source then s.source else null end,
    'objects', case when p_with_source then coalesce((
      select jsonb_agg(jsonb_build_object(
        'opaqueId', o.opaque_id, 'bucket', o.bucket, 'path', o.path, 'version', o.version,
        'size', o.size, 'mime', o.mime, 'sha256', o.sha256, 'state', o.state, 'reason', o.reason
      ) order by o.opaque_id)
      from private.tape_snapshot_objects o where o.snapshot_id = s.id), '[]'::jsonb) else null end,
    'objectsTotal', (select count(*) from private.tape_snapshot_objects o where o.snapshot_id = s.id),
    'objectsPending', (select count(*) from private.tape_snapshot_objects o
                       where o.snapshot_id = s.id and o.state = 'pending')
  )
  from private.tape_snapshots s where s.id = p_id and s.grant_id = p_grant_id;
$$;

-- Lista os objetos do retrato (uma vez) e aproveita hashes já calculados.
create or replace function public.tape_snapshot_objects_init(
  p_id text, p_grant_id text, p_objects jsonb
) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from private.tape_snapshots
    where id = p_id and grant_id = p_grant_id and state = 'preparing'
  ) then
    return;
  end if;
  insert into private.tape_snapshot_objects (snapshot_id, opaque_id, bucket, path, version, size, mime, state, reason)
  select p_id, o.opaque_id, o.bucket, o.path, o.version, o.size, o.mime, o.state, o.reason
  from jsonb_to_recordset(p_objects) as o (
    opaque_id text, bucket text, path text, version text, size bigint, mime text, state text, reason text)
  on conflict do nothing;
  update private.tape_snapshot_objects o
  set sha256 = h.sha256, state = 'ready'
  from private.tape_object_hashes h
  where o.snapshot_id = p_id and o.state = 'pending'
    and h.bucket = o.bucket and h.path = o.path and h.version = o.version and h.size = o.size;
end;
$$;

create or replace function public.tape_snapshot_objects_pending(
  p_id text, p_grant_id text, p_limit integer
) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (
    select o.opaque_id as "opaqueId", o.bucket, o.path, o.version, o.size, o.mime
    from private.tape_snapshot_objects o
    join private.tape_snapshots s on s.id = o.snapshot_id
    where o.snapshot_id = p_id and s.grant_id = p_grant_id and o.state = 'pending'
    order by o.opaque_id limit greatest(1, least(p_limit, 50))
  ) x;
$$;

create or replace function public.tape_snapshot_object_done(
  p_id text, p_grant_id text, p_opaque_id text, p_state text, p_sha256 text, p_reason text
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  o private.tape_snapshot_objects;
begin
  update private.tape_snapshot_objects x
  set state = p_state, sha256 = p_sha256, reason = p_reason
  from private.tape_snapshots s
  where x.snapshot_id = p_id and x.opaque_id = p_opaque_id and x.state = 'pending'
    and s.id = x.snapshot_id and s.grant_id = p_grant_id and s.state = 'preparing'
  returning x.* into o;
  if found and p_state = 'ready' then
    insert into private.tape_object_hashes (bucket, path, version, sha256, size)
    values (o.bucket, o.path, o.version, p_sha256, o.size)
    on conflict (bucket, path, version) do nothing;
  end if;
end;
$$;

-- Congela os itens já montados. Repetir a chamada não altera um retrato pronto.
create or replace function public.tape_snapshot_finalize(
  p_id text, p_grant_id text, p_envelope jsonb, p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  s private.tape_snapshots;
begin
  select * into s from private.tape_snapshots where id = p_id and grant_id = p_grant_id for update;
  if not found then
    return jsonb_build_object('error', 'snapshot_scope');
  end if;
  if s.state = 'preparing' then
    if exists (select 1 from private.tape_snapshot_objects where snapshot_id = p_id and state = 'pending') then
      return jsonb_build_object('error', 'snapshot_preparing');
    end if;
    insert into private.tape_snapshot_items (snapshot_id, seq, item)
    select p_id, (t.ordinality - 1)::int, t.value
    from jsonb_array_elements(p_items) with ordinality as t (value, ordinality);
    update private.tape_snapshots
    set state = 'ready', envelope = p_envelope, item_count = jsonb_array_length(p_items)
    where id = p_id;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.tape_snapshot_page(
  p_id text, p_grant_id text, p_offset integer, p_limit integer
) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'envelope', s.envelope, 'total', s.item_count, 'state', s.state,
    'expired', s.expires_at <= now(),
    'items', coalesce((
      select jsonb_agg(i.item order by i.seq)
      from private.tape_snapshot_items i
      where i.snapshot_id = s.id and i.seq >= p_offset and i.seq < p_offset + p_limit), '[]'::jsonb)
  )
  from private.tape_snapshots s where s.id = p_id and s.grant_id = p_grant_id;
$$;

create or replace function public.tape_snapshot_object(p_id text, p_grant_id text, p_opaque_id text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'opaqueId', o.opaque_id, 'bucket', o.bucket, 'path', o.path, 'version', o.version,
    'size', o.size, 'mime', o.mime, 'sha256', o.sha256, 'state', o.state,
    'snapshotState', s.state, 'expired', s.expires_at <= now())
  from private.tape_snapshot_objects o
  join private.tape_snapshots s on s.id = o.snapshot_id
  where o.snapshot_id = p_id and s.grant_id = p_grant_id and o.opaque_id = p_opaque_id;
$$;

-- ---------------------------------------------------------------------------
-- Permissões de execução e permissão de negócio
-- ---------------------------------------------------------------------------

do $grants$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'tape\_%' escape '\'
  loop
    execute format('revoke all on function %s from public', f.signature);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f.signature);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f.signature);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f.signature);
    end if;
  end loop;
end
$grants$;

-- Quem pode autorizar a leitura pelo Tapê: quem já lança os dados de campo.
insert into public.app_role_permissions (role_name, permission) values
  ('Admin', 'integrations.delegate'),
  ('ATGC', 'integrations.delegate')
on conflict (role_name, permission) do nothing;

notify pgrst, 'reload schema';
