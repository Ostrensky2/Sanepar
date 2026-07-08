alter table public.field_diary_entries
add column if not exists field_team_name text,
add column if not exists field_team_members text[] not null default '{}',
add column if not exists photos jsonb not null default '[]'::jsonb;

create index if not exists field_diary_entries_campaign_day_idx
on public.field_diary_entries (campaign_name, entry_date desc, campaign_day);
