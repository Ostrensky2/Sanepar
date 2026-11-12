-- Amostras do ponto: preservante e código com a hora (retorno de campo de 12/11/2026).
--
-- 1. preservative: preservante da amostra, texto livre (Longmire, álcool, sílica,
--    RNAlater…). Vazio = não informado. Até 120 caracteres, como os outros textos
--    da amostra.
--
-- 2. Código da etiqueta, a partir da versão 2.0.7:
--      {PROJETO}-{PONTO}-{DDMMAA}-{HHMM}-{TIPO}{SEQ}   ex.: YVA-0136-071126-0905-AG1
--    O formato anterior, sem a hora ({PROJETO}-{DDMMAA}-{PONTO}-{TIPO}{SEQ}, ex.:
--    YVA-071126-0136-AG1), continua aceito: amostras já gravadas ficam com o código
--    que têm, porque ele pode já estar numa etiqueta.
--
-- Só acrescenta: nenhuma linha é alterada.

alter table public.field_diary_samples
  add column if not exists preservative text;

alter table public.field_diary_samples
  drop constraint if exists field_diary_samples_preservative_ck;

alter table public.field_diary_samples
  add constraint field_diary_samples_preservative_ck
  check (preservative is null or char_length(preservative) <= 120);

comment on column public.field_diary_samples.preservative is
  'Preservante da amostra (texto livre: Longmire, álcool, sílica…). Vazio = não informado.';

alter table public.field_diary_samples
  drop constraint if exists field_diary_samples_code_format_ck;

alter table public.field_diary_samples
  add constraint field_diary_samples_code_format_ck
  check (
    sample_code ~ '^[A-Z]{3}-[A-Z0-9]{1,8}-[0-9]{6}-[0-9]{4}-(AG|SO|AR|TE|PL)[0-9]{1,3}$'
    or sample_code ~ '^[A-Z]{3}-[0-9]{6}-[A-Z0-9]{1,8}-(AG|SO|AR|TE|PL)[0-9]{1,3}$'
  );

comment on column public.field_diary_samples.sample_code is
  'Código da etiqueta: {PROJETO}-{PONTO}-{DDMMAA}-{HHMM}-{TIPO}{SEQUÊNCIA} (desde 13/11/2026; antes, {PROJETO}-{DDMMAA}-{PONTO}-{TIPO}{SEQUÊNCIA}). Único.';

-- O PostgREST passa a enxergar a coluna nova sem esperar.
notify pgrst, 'reload schema';
