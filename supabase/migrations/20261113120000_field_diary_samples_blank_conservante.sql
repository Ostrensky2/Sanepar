-- Amostras do ponto: branco e conservante (retorno de campo de 13/11/2026, versão 2.0.9).
--
-- 1. sample_type aceita 'blank': o branco (controle negativo, água ultrapura) do
--    ponto. Tem código próprio, BR, para não virar mais uma réplica de água
--    (ex.: YVA-0136-131126-0905-BR1).
--
-- 2. conservation aceita as opções que a equipe usa: ALCOOL_COM_CONGELAMENTO,
--    ALCOOL_SEM_CONGELAMENTO, LONGMIRE e SILICA (OUTRO já existia). As opções
--    antigas continuam aceitas, porque há amostras gravadas com elas.
--
-- 3. O código da etiqueta aceita BR, nos dois formatos (com e sem a hora).
--
-- 4. preservative passa a ser "qual conservante" quando a opção é OUTRO. A coluna
--    não muda; só o comentário.
--
-- Só acrescenta: nenhuma linha é alterada.

alter table public.field_diary_samples
  drop constraint if exists field_diary_samples_type_ck;

alter table public.field_diary_samples
  add constraint field_diary_samples_type_ck
  check (sample_type in ('water', 'blank', 'soil', 'air', 'tissue', 'plankton'));

alter table public.field_diary_samples
  drop constraint if exists field_diary_samples_conservation_ck;

alter table public.field_diary_samples
  add constraint field_diary_samples_conservation_ck
  check (conservation in (
    'ALCOOL_COM_CONGELAMENTO',
    'ALCOOL_SEM_CONGELAMENTO',
    'LONGMIRE',
    'SILICA',
    'OUTRO',
    'FILTRO_CONGELADO',
    'FILTRO_EM_ALCOOL_COM_REFRIGERACAO',
    'FILTRO_EM_ALCOOL_SEM_REFRIGERACAO',
    'AMOSTRA_BRUTA_RESFRIADA',
    'AMOSTRA_BRUTA_CONGELADA'
  ));

alter table public.field_diary_samples
  drop constraint if exists field_diary_samples_code_format_ck;

alter table public.field_diary_samples
  add constraint field_diary_samples_code_format_ck
  check (
    sample_code ~ '^[A-Z]{3}-[A-Z0-9]{1,8}-[0-9]{6}-[0-9]{4}-(AG|BR|SO|AR|TE|PL)[0-9]{1,3}$'
    or sample_code ~ '^[A-Z]{3}-[0-9]{6}-[A-Z0-9]{1,8}-(AG|BR|SO|AR|TE|PL)[0-9]{1,3}$'
  );

comment on column public.field_diary_samples.sample_type is
  'Tipo da amostra: water, blank (branco, controle negativo), soil, air, tissue, plankton.';

comment on column public.field_diary_samples.conservation is
  'Conservante: ALCOOL_COM_CONGELAMENTO, ALCOOL_SEM_CONGELAMENTO, LONGMIRE, SILICA ou OUTRO (desde 13/11/2026). As opções anteriores (FILTRO_..., AMOSTRA_BRUTA_...) ficam nas amostras gravadas antes.';

comment on column public.field_diary_samples.preservative is
  'Qual conservante, quando conservation = OUTRO (texto livre). Nas amostras gravadas até 13/11/2026, o preservante informado à parte.';

-- O PostgREST passa a enxergar as regras novas sem esperar.
notify pgrst, 'reload schema';
