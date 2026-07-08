-- Governança de importação por campanha (regra do usuário 2026-07-07).
-- Cada registro do Diário de Campo ganha um estado de governança que decide se
-- uma nova planilha pode sobrescrevê-lo:
--   importado    -> preliminar; a planilha da campanha pode substituir
--   em_revisao   -> em análise; conflitos são reportados, não sobrescritos
--   consolidado  -> travado; planilha não sobrepõe automaticamente
--   corrigido    -> editado manualmente no app; tem prioridade sobre a planilha
-- Também guarda a ordem de coleta (ordem das linhas da planilha) e uma marca de
-- "ausente na última importação" (nunca apagamos automaticamente).

alter table public.field_diary_entries
  add column if not exists governance_status text not null default 'importado',
  add column if not exists collection_order integer,
  add column if not exists missing_in_import boolean not null default false;

alter table public.field_diary_entries
  drop constraint if exists field_diary_entries_governance_status_check;

alter table public.field_diary_entries
  add constraint field_diary_entries_governance_status_check
  check (governance_status in ('importado', 'em_revisao', 'consolidado', 'corrigido'));

-- Campanha 1 já está consolidada: nenhuma importação futura pode alterá-la.
update public.field_diary_entries
  set governance_status = 'consolidado'
  where governance_status = 'importado'
    and (campaign_id like 'campanha-1-%' or campaign_name ilike '1%campanha%');

-- Preserva a ordem de coleta existente (por campanha e dia) a partir da ordem de
-- criação, para os registros que ainda não têm collection_order.
with ordered as (
  select
    id,
    row_number() over (
      partition by campaign_id, campaign_day
      order by created_at, id
    ) as rn
  from public.field_diary_entries
)
update public.field_diary_entries e
  set collection_order = ordered.rn
  from ordered
  where ordered.id = e.id
    and e.collection_order is null;
