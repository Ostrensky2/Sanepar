-- Consumo estritamente único para cookies de purpose (invite/recovery).
-- Pode ser aplicada antes do cutover 20260815091000: não depende de seus objetos.
-- O backend valida o cookie HMAC user-bound e envia somente o SHA-256/HMAC
-- hexadecimal, já composto sobre purpose + JTI aleatório, e a expiração assinada.

create table if not exists public.auth_purpose_consumptions (
  purpose_jti_hash bytea primary key,
  expires_at timestamptz not null,
  consumed_at timestamptz not null default transaction_timestamp(),
  constraint auth_purpose_consumptions_hash_length
    check (octet_length(purpose_jti_hash) = 32),
  constraint auth_purpose_consumptions_finite_expiry
    check (expires_at > '-infinity'::timestamptz and expires_at < 'infinity'::timestamptz)
);

create index if not exists auth_purpose_consumptions_expires_at_idx
  on public.auth_purpose_consumptions (expires_at);

alter table public.auth_purpose_consumptions enable row level security;
alter table public.auth_purpose_consumptions force row level security;

revoke all on table public.auth_purpose_consumptions
  from public, anon, authenticated, service_role;

create or replace function public.consume_auth_purpose_once(
  p_purpose_jti_hash text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_consumed boolean;
begin
  if p_purpose_jti_hash is null
     or p_purpose_jti_hash !~ '^[0-9a-f]{64}$'
     or p_expires_at is null
     or p_expires_at = '-infinity'::timestamptz
     or p_expires_at = 'infinity'::timestamptz then
    raise exception 'invalid auth purpose consumption input' using errcode = '22023';
  end if;

  -- Token já expirado falha fechado; expiração acima do TTL assinado é inválida.
  if p_expires_at <= v_now then
    return false;
  end if;
  if p_expires_at > v_now + interval '600 seconds' then
    raise exception 'auth purpose expiry exceeds maximum ttl' using errcode = '22023';
  end if;

  -- Cada consumo remove no máximo 64 marcadores expirados. A chave primária
  -- serializa colisões: exatamente uma transação insere; replay retorna false.
  with expired as (
    select marker.ctid
    from public.auth_purpose_consumptions as marker
    where marker.expires_at <= v_now
    order by marker.expires_at, marker.ctid
    limit 64
    for update skip locked
  ), cleaned as (
    delete from public.auth_purpose_consumptions as marker
    using expired
    where marker.ctid = expired.ctid
  ), inserted as (
    insert into public.auth_purpose_consumptions (
      purpose_jti_hash,
      expires_at,
      consumed_at
    )
    select decode(p_purpose_jti_hash, 'hex'), p_expires_at, v_now
    where p_expires_at > clock_timestamp()
    on conflict (purpose_jti_hash) do nothing
    returning true
  )
  select coalesce((select true from inserted), false)
  into v_consumed;

  return v_consumed;
end
$function$;

revoke all on function public.consume_auth_purpose_once(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.consume_auth_purpose_once(text, timestamptz)
  to service_role;
