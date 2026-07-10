-- Consolida importacoes da segunda campanha que foram salvas com o nome curto "2".
-- Quando a linha canonica ja existe, remove apenas a duplicata equivalente por ponto/data.

delete from public.field_diary_entries legacy
using public.field_diary_entries canonical
where legacy.campaign_name = '2'
  and canonical.campaign_name = '2ª Campanha - Outono 2026'
  and legacy.entry_date = canonical.entry_date
  and public.normalize_field_diary_point_key(
    coalesce(nullif(legacy.sia, ''), legacy.location_name)
  ) is not distinct from public.normalize_field_diary_point_key(
    coalesce(nullif(canonical.sia, ''), canonical.location_name)
  );

update public.field_diary_entries
set
  campaign_id = 'campanha-2-outono-2026',
  campaign_name = '2ª Campanha - Outono 2026',
  updated_at = now()
where campaign_name = '2'
   or campaign_name = '2ª Campanha - Outono 2026'
   or campaign_id = 'campanha-2-outono-2026';
