-- Registro de campo: amostras do ponto (fase 2 do padrão de coleta,
-- docs/padrao-coleta-de-campo.md, seções 3 e 4).
--
-- Uma linha por amostra coletada num registro de campo. Só acrescenta uma tabela:
-- nada muda em field_diary_entries, e os campos de texto antigos ("Amostras e
-- Réplicas (eDNA)", "ID Zooplâncton") continuam valendo.
--
--   sample_code   código da etiqueta, {PROJETO}-{DDMMAA}-{PONTO}-{TIPO}{SEQ}
--                 (ex.: YVA-071126-0136-AG1). Único em todo o banco.
--   sample_type   water, soil, air, tissue, plankton
--   sequence      1, 2, 3… para o mesmo tipo, no mesmo ponto e dia
--   depth_m       profundidade em metros (0 = superfície)
--   quantity      volume ou massa, na unidade de quantity_unit
--
-- O servidor do app é quem grava (service_role). Um registro de campo com amostras
-- não pode ser apagado sem que as amostras sejam tratadas antes (on delete restrict).

create table if not exists public.field_diary_samples (
  id uuid primary key default gen_random_uuid(),
  entry_id text not null references public.field_diary_entries (id) on delete restrict,
  sample_code text not null,
  project_code text not null,
  sample_type text not null,
  sequence integer not null,
  depth_m numeric(7,2),
  quantity numeric(12,3),
  quantity_unit text not null,
  specification text,
  conservation text not null,
  packaging text,
  box_position text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint field_diary_samples_code_unique unique (sample_code),
  constraint field_diary_samples_code_format_ck
    check (sample_code ~ '^[A-Z]{3}-[0-9]{6}-[A-Z0-9]{1,8}-(AG|SO|AR|TE|PL)[0-9]{1,3}$'),
  constraint field_diary_samples_project_code_ck
    check (project_code ~ '^[A-Z]{3}$' and left(sample_code, 4) = project_code || '-'),
  constraint field_diary_samples_type_ck
    check (sample_type in ('water', 'soil', 'air', 'tissue', 'plankton')),
  constraint field_diary_samples_sequence_ck
    check (sequence between 1 and 999),
  constraint field_diary_samples_depth_ck
    check (depth_m is null or (depth_m >= 0 and depth_m <= 11000)),
  constraint field_diary_samples_quantity_ck
    check (quantity is null or quantity >= 0),
  constraint field_diary_samples_conservation_ck
    check (conservation in (
      'FILTRO_CONGELADO',
      'FILTRO_EM_ALCOOL_COM_REFRIGERACAO',
      'FILTRO_EM_ALCOOL_SEM_REFRIGERACAO',
      'AMOSTRA_BRUTA_RESFRIADA',
      'AMOSTRA_BRUTA_CONGELADA',
      'OUTRO'
    ))
);

create index if not exists field_diary_samples_entry_idx
  on public.field_diary_samples (entry_id, sample_type, sequence);

comment on table public.field_diary_samples is
  'Amostras coletadas em cada registro de campo (padrão de coleta, versão 1).';
comment on column public.field_diary_samples.sample_code is
  'Código da etiqueta: {PROJETO}-{DDMMAA}-{PONTO}-{TIPO}{SEQUÊNCIA}. Único.';
comment on column public.field_diary_samples.depth_m is
  'Profundidade de coleta em metros. 0 = superfície.';
comment on column public.field_diary_samples.quantity is
  'Volume ou massa da amostra, na unidade de quantity_unit.';

-- Mesma regra de acesso do resto do banco (20261101110000_close_anon_access):
-- RLS ligado, nada para quem não fez login, e políticas por permissão para quem fez.
alter table public.field_diary_samples enable row level security;
revoke all on table public.field_diary_samples from anon, public;

do $service_role$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.field_diary_samples to service_role;
  end if;
end
$service_role$;

do $authenticated_policies$
begin
  if to_regprocedure('public.has_current_permission(text)') is null
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice 'has_current_permission ausente: field_diary_samples fica só com acesso do servidor (service_role).';
    return;
  end if;

  grant select, insert, update, delete on public.field_diary_samples to authenticated;

  drop policy if exists yvae_field_diary_samples_select on public.field_diary_samples;
  create policy yvae_field_diary_samples_select on public.field_diary_samples
    for select to authenticated using (public.has_current_permission('data.view'));

  drop policy if exists yvae_field_diary_samples_insert on public.field_diary_samples;
  create policy yvae_field_diary_samples_insert on public.field_diary_samples
    for insert to authenticated with check (public.has_current_permission('data.import'));

  drop policy if exists yvae_field_diary_samples_update on public.field_diary_samples;
  create policy yvae_field_diary_samples_update on public.field_diary_samples
    for update to authenticated
    using (public.has_current_permission('data.import'))
    with check (public.has_current_permission('data.import'));

  -- Tirar uma amostra lançada por engano é editar o registro de campo, por isso
  -- pede a mesma permissão de gravar (e não a de apagar registros).
  drop policy if exists yvae_field_diary_samples_delete on public.field_diary_samples;
  create policy yvae_field_diary_samples_delete on public.field_diary_samples
    for delete to authenticated using (public.has_current_permission('data.import'));
end
$authenticated_policies$;

-- A API passa a enxergar a tabela nova na hora.
notify pgrst, 'reload schema';
