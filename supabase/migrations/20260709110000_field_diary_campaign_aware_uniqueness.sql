-- Corrige o unique index para permitir que campanhas diferentes visitem
-- os mesmos pontos nas mesmas datas (coletas sazonais).
-- O índice antigo usava (entry_date, point_key) sem considerar campaign_name,
-- o que impedia a importação de novas campanhas nos mesmos pontos.

-- Remove o unique index antigo
drop index if exists public.field_diary_entries_point_date_unique_idx;

-- Cria o novo unique index incluindo campaign_name
create unique index field_diary_entries_point_date_unique_idx
on public.field_diary_entries (
  campaign_name,
  entry_date,
  public.normalize_field_diary_point_key(coalesce(nullif(sia, ''), location_name))
)
where public.normalize_field_diary_point_key(coalesce(nullif(sia, ''), location_name)) is not null;
