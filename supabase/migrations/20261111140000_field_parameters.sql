-- Registro de campo: parâmetros medidos em campo (fase 3 do padrão de coleta,
-- docs/padrao-coleta-de-campo.md, seção 5).
--
-- Duas tabelas novas. Nada muda em field_diary_entries nem em field_diary_samples.
--
--   field_parameters           catálogo: os oito parâmetros do padrão e os que a
--                              equipe criar pelo botão "+ Parâmetro".
--   field_parameter_readings   medições de um registro de campo: valor numérico
--                              com unidade, profundidade, hora e equipamento.
--
-- A medição é do ponto (do registro de campo) numa profundidade. Ela vale para as
-- amostras do mesmo registro e da mesma profundidade; medição sem profundidade
-- (temperatura do ar) vale para todas.
--
-- O servidor do app é quem grava (service_role). Parâmetro em uso e registro com
-- medição não podem ser apagados (on delete restrict): parâmetro errado é
-- desativado, não apagado.

create table if not exists public.field_parameters (
  id text primary key,
  label text not null,
  unit text not null default '',
  min_value numeric,
  max_value numeric,
  applies_to text[] not null,
  uses_depth boolean not null default true,
  biolog_column text,
  is_base boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 1000,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint field_parameters_id_ck
    check (id ~ '^[a-z][a-z0-9_]{1,39}$'),
  constraint field_parameters_label_ck
    check (label = btrim(label) and char_length(label) between 1 and 60),
  constraint field_parameters_unit_ck
    check (char_length(unit) <= 20),
  constraint field_parameters_min_ck
    check (min_value is null or abs(min_value) <= 1000000000),
  constraint field_parameters_max_ck
    check (max_value is null or abs(max_value) <= 1000000000),
  constraint field_parameters_range_ck
    check (min_value is null or max_value is null or max_value > min_value),
  constraint field_parameters_applies_ck
    check (
      cardinality(applies_to) >= 1
      and applies_to <@ array['water', 'soil', 'air', 'tissue', 'plankton']::text[]
    )
);

-- Dois parâmetros não podem ter o mesmo nome (sem diferenciar maiúsculas).
create unique index if not exists field_parameters_label_unique
  on public.field_parameters (lower(label));

comment on table public.field_parameters is
  'Catálogo de parâmetros medidos em campo (padrão de coleta, versão 1).';
comment on column public.field_parameters.min_value is
  'Início da faixa esperada. Fora da faixa o app avisa, sem impedir o registro.';
comment on column public.field_parameters.applies_to is
  'Tipos de amostra em que o parâmetro é medido: water, soil, air, tissue, plankton.';
comment on column public.field_parameters.uses_depth is
  'false = não é medido numa profundidade (temperatura do ar, disco de Secchi).';
comment on column public.field_parameters.biolog_column is
  'Coluna fixa da planilha que o Biolog já importa, quando existe.';
comment on column public.field_parameters.is_base is
  'true = parâmetro do padrão de coleta; o app só deixa desativar.';

-- Os oito parâmetros do padrão. Mesma lista de baseFieldParameters em
-- src/lib/field-standard.ts (um teste confere as duas).
insert into public.field_parameters
  (id, label, unit, min_value, max_value, applies_to, uses_depth, biolog_column, is_base, sort_order)
values
  ('air_temperature', 'Temperatura do ar', '°C', -20, 60, array['water','soil','air','tissue','plankton'], false, 'Temp Ar (°C)', true, 10),
  ('water_temperature', 'Temperatura da água', '°C', -2, 40, array['water','plankton'], true, 'Temp Água (°C)', true, 20),
  ('ph', 'pH', '', 0, 14, array['water','plankton','soil'], true, 'pH', true, 30),
  ('conductivity', 'Condutividade', 'µS/cm', 0, 100000, array['water','plankton'], true, null, true, 40),
  ('salinity', 'Salinidade', 'ups', 0, 50, array['water','plankton'], true, 'Salinidade (ups)', true, 50),
  ('dissolved_oxygen', 'Oxigênio dissolvido', 'mg/L', 0, 20, array['water','plankton'], true, 'Oxigênio Dissolvido', true, 60),
  ('secchi_transparency', 'Transparência (Secchi)', 'm', 0, 50, array['water','plankton'], false, 'Transparência', true, 70),
  ('turbidity', 'Turbidez', 'NTU', 0, 4000, array['water','plankton'], true, 'Turbidez', true, 80)
on conflict (id) do nothing;

create table if not exists public.field_parameter_readings (
  id uuid primary key default gen_random_uuid(),
  entry_id text not null references public.field_diary_entries (id) on delete restrict,
  parameter_id text not null references public.field_parameters (id) on delete restrict,
  value numeric not null,
  unit text not null default '',
  depth_m numeric(7,2),
  measured_time text,
  equipment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint field_parameter_readings_value_ck
    check (abs(value) <= 1000000000),
  constraint field_parameter_readings_unit_ck
    check (char_length(unit) <= 20),
  constraint field_parameter_readings_depth_ck
    check (depth_m is null or (depth_m >= 0 and depth_m <= 11000)),
  constraint field_parameter_readings_time_ck
    check (measured_time is null or measured_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  constraint field_parameter_readings_equipment_ck
    check (equipment is null or char_length(equipment) <= 120)
);

-- Uma medição por parâmetro e profundidade em cada registro. Sem profundidade
-- conta como uma profundidade só.
create unique index if not exists field_parameter_readings_once_idx
  on public.field_parameter_readings (entry_id, parameter_id, coalesce(depth_m, -1));

create index if not exists field_parameter_readings_parameter_idx
  on public.field_parameter_readings (parameter_id);

comment on table public.field_parameter_readings is
  'Parâmetros medidos em cada registro de campo, por profundidade (padrão de coleta, versão 1).';
comment on column public.field_parameter_readings.unit is
  'Unidade do parâmetro no momento da medição.';
comment on column public.field_parameter_readings.depth_m is
  'Profundidade da medição em metros. 0 = superfície; vazio = parâmetro sem profundidade.';
comment on column public.field_parameter_readings.measured_time is
  'Hora da medição (HH:MM) no relógio de quem mediu, no dia do registro de campo.';

-- Mesma regra de acesso do resto do banco (20261101110000_close_anon_access):
-- RLS ligado, nada para quem não fez login, e políticas por permissão para quem fez.
alter table public.field_parameters enable row level security;
alter table public.field_parameter_readings enable row level security;
revoke all on table public.field_parameters from anon, public;
revoke all on table public.field_parameter_readings from anon, public;

do $service_role$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.field_parameters to service_role;
    grant select, insert, update, delete on public.field_parameter_readings to service_role;
  end if;
end
$service_role$;

do $authenticated_policies$
begin
  if to_regprocedure('public.has_current_permission(text)') is null
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice 'has_current_permission ausente: os parâmetros de campo ficam só com acesso do servidor (service_role).';
    return;
  end if;

  -- Catálogo: quem vê os dados lê; quem registra coleta cria e altera. Ninguém
  -- apaga parâmetro pelo app (ele é desativado).
  revoke all on table public.field_parameters from authenticated;
  grant select, insert, update on public.field_parameters to authenticated;

  drop policy if exists yvae_field_parameters_select on public.field_parameters;
  create policy yvae_field_parameters_select on public.field_parameters
    for select to authenticated using (public.has_current_permission('data.view'));

  drop policy if exists yvae_field_parameters_insert on public.field_parameters;
  create policy yvae_field_parameters_insert on public.field_parameters
    for insert to authenticated with check (public.has_current_permission('data.import'));

  drop policy if exists yvae_field_parameters_update on public.field_parameters;
  create policy yvae_field_parameters_update on public.field_parameters
    for update to authenticated
    using (public.has_current_permission('data.import'))
    with check (public.has_current_permission('data.import'));

  -- Medições: mesma regra das amostras do ponto.
  grant select, insert, update, delete on public.field_parameter_readings to authenticated;

  drop policy if exists yvae_field_parameter_readings_select on public.field_parameter_readings;
  create policy yvae_field_parameter_readings_select on public.field_parameter_readings
    for select to authenticated using (public.has_current_permission('data.view'));

  drop policy if exists yvae_field_parameter_readings_insert on public.field_parameter_readings;
  create policy yvae_field_parameter_readings_insert on public.field_parameter_readings
    for insert to authenticated with check (public.has_current_permission('data.import'));

  drop policy if exists yvae_field_parameter_readings_update on public.field_parameter_readings;
  create policy yvae_field_parameter_readings_update on public.field_parameter_readings
    for update to authenticated
    using (public.has_current_permission('data.import'))
    with check (public.has_current_permission('data.import'));

  -- Tirar uma medição lançada por engano é editar o registro de campo, por isso
  -- pede a mesma permissão de gravar (e não a de apagar registros).
  drop policy if exists yvae_field_parameter_readings_delete on public.field_parameter_readings;
  create policy yvae_field_parameter_readings_delete on public.field_parameter_readings
    for delete to authenticated using (public.has_current_permission('data.import'));
end
$authenticated_policies$;

-- A API passa a enxergar as tabelas novas na hora.
notify pgrst, 'reload schema';
