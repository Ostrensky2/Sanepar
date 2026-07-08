-- Corrige casos legados em que o SIA foi salvo como "770" em vez de "SIA-0770".

create or replace function public.normalize_field_diary_point_key(value text)
returns text
language sql
immutable
as $$
  with normalized as (
    select lower(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g')) as point_key
  )
  select case
    when point_key ~ '^(sia[\s-]*[0-9]+|[0-9]+)$'
      then 'sia-' || lpad(regexp_replace(point_key, '\D', '', 'g'), 4, '0')
    else nullif(point_key, '')
  end
  from normalized;
$$;

drop index if exists public.field_diary_entries_point_date_unique_idx;

with scored as (
  select
    id,
    entry_date,
    public.normalize_field_diary_point_key(coalesce(nullif(sia, ''), location_name)) as point_key,
    (
      case when nullif(btrim(location_name), '') is not null then 1 else 0 end +
      case when nullif(btrim(sia), '') is not null then 1 else 0 end +
      case when nullif(btrim(collection_time), '') is not null then 1 else 0 end +
      case when nullif(btrim(samples_replicas_edna), '') is not null then 1 else 0 end +
      case when nullif(btrim(zooplankton_id), '') is not null then 1 else 0 end +
      case when nullif(btrim(latitude), '') is not null then 1 else 0 end +
      case when nullif(btrim(longitude), '') is not null then 1 else 0 end +
      case when nullif(btrim(municipality), '') is not null then 1 else 0 end +
      case when nullif(btrim(daily_summary), '') is not null then 1 else 0 end +
      cardinality(coalesce(activities, '{}')) +
      cardinality(coalesce(water_visual_conditions, '{}')) +
      coalesce(jsonb_array_length(photos), 0)
    ) as completeness_score,
    updated_at,
    created_at
  from public.field_diary_entries
),
ranked as (
  select
    *,
    first_value(id) over (
      partition by entry_date, point_key
      order by completeness_score desc, updated_at desc, created_at asc, id asc
    ) as keeper_id,
    row_number() over (
      partition by entry_date, point_key
      order by completeness_score desc, updated_at desc, created_at asc, id asc
    ) as rn
  from scored
  where point_key is not null and point_key <> ''
),
merged as (
  select
    keeper_id,
    array(
      select distinct item
      from ranked r
      join public.field_diary_entries e on e.id = r.id
      cross join unnest(coalesce(e.activities, '{}')) item
      where r.keeper_id = ranked.keeper_id
        and nullif(btrim(item), '') is not null
      order by item
    ) as activities,
    array(
      select distinct item
      from ranked r
      join public.field_diary_entries e on e.id = r.id
      cross join unnest(coalesce(e.water_visual_conditions, '{}')) item
      where r.keeper_id = ranked.keeper_id
        and nullif(btrim(item), '') is not null
      order by item
    ) as water_visual_conditions,
    bool_or(e.has_occurrence) as has_occurrence,
    min(e.created_at) as created_at,
    max(e.updated_at) as updated_at
  from ranked
  join public.field_diary_entries e on e.id = ranked.id
  group by keeper_id
  having count(*) > 1
)
update public.field_diary_entries target
set
  activities = merged.activities,
  water_visual_conditions = merged.water_visual_conditions,
  has_occurrence = merged.has_occurrence,
  created_at = merged.created_at,
  updated_at = merged.updated_at
from merged
where target.id = merged.keeper_id;

with scored as (
  select
    id,
    entry_date,
    public.normalize_field_diary_point_key(coalesce(nullif(sia, ''), location_name)) as point_key,
    (
      case when nullif(btrim(location_name), '') is not null then 1 else 0 end +
      case when nullif(btrim(sia), '') is not null then 1 else 0 end +
      case when nullif(btrim(collection_time), '') is not null then 1 else 0 end +
      case when nullif(btrim(samples_replicas_edna), '') is not null then 1 else 0 end +
      case when nullif(btrim(zooplankton_id), '') is not null then 1 else 0 end +
      case when nullif(btrim(latitude), '') is not null then 1 else 0 end +
      case when nullif(btrim(longitude), '') is not null then 1 else 0 end +
      case when nullif(btrim(municipality), '') is not null then 1 else 0 end +
      case when nullif(btrim(daily_summary), '') is not null then 1 else 0 end +
      cardinality(coalesce(activities, '{}')) +
      cardinality(coalesce(water_visual_conditions, '{}')) +
      coalesce(jsonb_array_length(photos), 0)
    ) as completeness_score,
    updated_at,
    created_at
  from public.field_diary_entries
),
ranked as (
  select
    *,
    row_number() over (
      partition by entry_date, point_key
      order by completeness_score desc, updated_at desc, created_at asc, id asc
    ) as rn
  from scored
  where point_key is not null and point_key <> ''
)
delete from public.field_diary_entries target
using ranked
where target.id = ranked.id
  and ranked.rn > 1;

create unique index field_diary_entries_point_date_unique_idx
on public.field_diary_entries (
  entry_date,
  public.normalize_field_diary_point_key(coalesce(nullif(sia, ''), location_name))
)
where public.normalize_field_diary_point_key(coalesce(nullif(sia, ''), location_name)) is not null;
