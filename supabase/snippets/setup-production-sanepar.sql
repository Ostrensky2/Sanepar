create table if not exists public.campaign_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  row_count integer not null default 0,
  point_count integer not null default 0,
  original_point_count integer not null default 0,
  effective_point_count integer not null default 0,
  missing_fields text[] not null default '{}',
  points jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.campaign_imports enable row level security;

drop policy if exists "campaign_imports_select_all" on public.campaign_imports;
create policy "campaign_imports_select_all"
on public.campaign_imports
for select
to anon, authenticated
using (true);

drop policy if exists "campaign_imports_insert_all" on public.campaign_imports;
create policy "campaign_imports_insert_all"
on public.campaign_imports
for insert
to anon, authenticated
with check (true);

create index if not exists campaign_imports_created_at_idx
on public.campaign_imports (created_at desc);

create table if not exists public.point_actions (
  id text primary key,
  event_name text not null,
  objectives text not null,
  document jsonb,
  created_at_label text not null,
  points jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.point_actions enable row level security;

drop policy if exists "point_actions_select_all" on public.point_actions;
create policy "point_actions_select_all"
on public.point_actions
for select
to anon, authenticated
using (true);

drop policy if exists "point_actions_insert_all" on public.point_actions;
create policy "point_actions_insert_all"
on public.point_actions
for insert
to anon, authenticated
with check (true);

drop policy if exists "point_actions_update_all" on public.point_actions;
create policy "point_actions_update_all"
on public.point_actions
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "point_actions_delete_all" on public.point_actions;
create policy "point_actions_delete_all"
on public.point_actions
for delete
to anon, authenticated
using (true);

create index if not exists point_actions_updated_at_idx
on public.point_actions (updated_at desc);

insert into public.point_actions (
  id,
  event_name,
  objectives,
  document,
  created_at_label,
  points,
  updated_at
)
values (
  'acao-pontual-coleta-mosquito-fantasma',
  'Coleta de mosquito-fantasma',
  'Amostrar larvas de Chaoboridae no Reservatório Passaúna para identificar a espécie causadora do surto, avaliar os riscos operacionais à captação e tratamento da SANEPAR e validar as sequências de DNA obtidas por metabarcoding como padrão-ouro para futuras detecções.',
  null,
  '06/05/2026',
  '[
    {
      "id": "ponto-reservatorio-passauna-mosquito-fantasma",
      "waterBody": "Reservatório do Passaúna",
      "dates": "30/03/2026",
      "municipality": "Curitiba",
      "effectiveLat": -25.47817,
      "effectiveLon": -49.38035,
      "results": "A coleta no Reservatório Passaúna resultou apenas em exúvias de pupas, inviabilizando a identificação em nível de espécie pelo especialista da UFSC; a campanha será repetida para captura de adultos, que permitirão a identificação taxonômica refinada e a validação molecular das sequências de metabarcoding.",
      "photos": []
    }
  ]'::jsonb,
  now()
)
on conflict (id) do update set
  event_name = excluded.event_name,
  objectives = excluded.objectives,
  document = excluded.document,
  created_at_label = excluded.created_at_label,
  points = excluded.points,
  updated_at = now();
