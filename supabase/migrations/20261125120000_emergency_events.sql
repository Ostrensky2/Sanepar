-- Eventos emergenciais (Central de dados › Eventos emergenciais).
--
-- Uma linha por evento: problema comunicado fora da rotina das campanhas
-- (entupimento de filtros, cheiro ou gosto, floração…). As idas da equipe ao local
-- ficam na coluna `visits` (lista jsonb): um evento pode ter várias idas, cada uma
-- com data, objetivo, atividades feitas e observações.
-- As listas de atividades e de problemas ficam no aplicativo
-- (src/lib/emergency-events.ts), para poderem crescer sem nova migration; aqui o
-- banco só garante tamanhos coerentes. As datas das idas (nunca antes da data do
-- evento) são conferidas pelo aplicativo, no servidor.
--
-- Só acrescenta: nenhuma tabela existente muda. Idempotente.

create table if not exists public.emergency_events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  reported_date date not null,
  visits jsonb not null default '[]'::jsonb,
  main_problem text not null,
  main_problem_other text,
  sia text,
  location text,
  description text not null,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint emergency_events_name_ck
    check (char_length(btrim(name)) between 1 and 160),
  constraint emergency_events_visits_ck
    check (jsonb_typeof(visits) = 'array' and jsonb_array_length(visits) <= 50),
  constraint emergency_events_main_problem_ck
    check (char_length(main_problem) between 1 and 40),
  constraint emergency_events_main_problem_other_ck
    check (main_problem_other is null or char_length(main_problem_other) <= 160),
  constraint emergency_events_sia_ck
    check (sia is null or char_length(sia) <= 40),
  constraint emergency_events_location_ck
    check (location is null or char_length(location) <= 200),
  constraint emergency_events_description_ck
    check (char_length(btrim(description)) between 1 and 8000)
);

create index if not exists emergency_events_reported_date_idx
  on public.emergency_events (reported_date desc);

comment on table public.emergency_events is
  'Eventos emergenciais: problemas comunicados fora da rotina das campanhas, com o problema principal e cada ida da equipe ao local.';
comment on column public.emergency_events.reported_date is
  'Data do evento, como foi informada à equipe.';
comment on column public.emergency_events.visits is
  'Idas ao local: lista de {id, date AAAA-MM-DD, objective, activities [códigos de src/lib/emergency-events.ts], activityOther, notes}. Vazia enquanto ninguém foi.';
comment on column public.emergency_events.main_problem is
  'Código do problema principal (lista em src/lib/emergency-events.ts).';

-- Mesma regra de acesso do resto do banco (20261101110000_close_anon_access):
-- RLS ligado, nada para quem não fez login, e políticas por permissão para quem fez.
alter table public.emergency_events enable row level security;
revoke all on table public.emergency_events from anon, public;

do $service_role$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.emergency_events to service_role;
  end if;
end
$service_role$;

do $authenticated_policies$
begin
  if to_regprocedure('public.has_current_permission(text)') is null
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice 'has_current_permission ausente: os eventos emergenciais ficam só com acesso do servidor (service_role).';
    return;
  end if;

  revoke all on table public.emergency_events from authenticated;
  grant select, insert, update, delete on public.emergency_events to authenticated;

  drop policy if exists yvae_emergency_events_select on public.emergency_events;
  create policy yvae_emergency_events_select on public.emergency_events
    for select to authenticated using (public.has_current_permission('data.view'));

  drop policy if exists yvae_emergency_events_insert on public.emergency_events;
  create policy yvae_emergency_events_insert on public.emergency_events
    for insert to authenticated with check (public.has_current_permission('data.import'));

  drop policy if exists yvae_emergency_events_update on public.emergency_events;
  create policy yvae_emergency_events_update on public.emergency_events
    for update to authenticated
    using (public.has_current_permission('data.import'))
    with check (public.has_current_permission('data.import'));

  drop policy if exists yvae_emergency_events_delete on public.emergency_events;
  create policy yvae_emergency_events_delete on public.emergency_events
    for delete to authenticated using (public.has_current_permission('data.delete'));
end
$authenticated_policies$;

-- A API passa a enxergar a tabela nova na hora.
notify pgrst, 'reload schema';
