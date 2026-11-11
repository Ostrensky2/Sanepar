-- Registro de campo: captura automática do início da coleta (fase 1 do padrão de
-- coleta, docs/padrao-coleta-de-campo.md).
--
-- Só acrescenta colunas opcionais. Registros antigos e importados de planilha
-- continuam válidos, com as três colunas vazias.
--
--   coordinate_source      de onde veio a coordenada: 'gps' (medida pelo celular),
--                          'planned' (coordenada planejada do ponto, sem sinal de GPS)
--                          ou 'manual' (digitada)
--   gps_accuracy_m         precisão informada pelo aparelho, em metros
--   collection_started_at  momento em que a pessoa tocou em "Iniciar coleta"

alter table public.field_diary_entries
  add column if not exists coordinate_source text,
  add column if not exists gps_accuracy_m numeric(8,1),
  add column if not exists collection_started_at timestamptz;

alter table public.field_diary_entries
  drop constraint if exists field_diary_entries_coordinate_source_ck;

alter table public.field_diary_entries
  add constraint field_diary_entries_coordinate_source_ck
  check (coordinate_source is null or coordinate_source in ('gps', 'planned', 'manual'));

alter table public.field_diary_entries
  drop constraint if exists field_diary_entries_gps_accuracy_ck;

alter table public.field_diary_entries
  add constraint field_diary_entries_gps_accuracy_ck
  check (
    gps_accuracy_m is null
    or (coordinate_source = 'gps' and gps_accuracy_m >= 0 and gps_accuracy_m <= 100000)
  );

comment on column public.field_diary_entries.coordinate_source is
  'Origem da coordenada: gps (celular), planned (coordenada planejada do ponto) ou manual (digitada).';
comment on column public.field_diary_entries.gps_accuracy_m is
  'Precisão do GPS informada pelo aparelho, em metros. Só com coordinate_source = gps.';
comment on column public.field_diary_entries.collection_started_at is
  'Momento em que a coleta foi iniciada no aplicativo (relógio do aparelho).';

-- A API passa a enxergar as colunas novas na hora.
notify pgrst, 'reload schema';
