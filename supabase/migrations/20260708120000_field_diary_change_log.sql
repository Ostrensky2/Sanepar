-- Histórico de alterações do Diário de Campo (regra de governança 9): guarda,
-- por campo, o valor anterior, o novo, a origem (planilha/app), quem alterou e
-- quando. Alimentado pela importação e pela edição manual.

create table if not exists public.field_diary_change_log (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid,
  campaign_name text,
  field_name text not null,
  old_value text,
  new_value text,
  origin text not null,
  changed_by text,
  changed_at timestamptz not null default now()
);

create index if not exists field_diary_change_log_entry_idx
  on public.field_diary_change_log (entry_id, changed_at desc);

create index if not exists field_diary_change_log_campaign_idx
  on public.field_diary_change_log (campaign_name, changed_at desc);
