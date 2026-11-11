-- Registro de campo: marca de exportação das amostras (fase 5 do padrão de coleta,
-- docs/padrao-coleta-de-campo.md, seções 3 e 8).
--
-- Quando a amostra sai na planilha do Biolog, o app grava em exported_at o momento.
-- Daí em diante o código da etiqueta não muda mais, mesmo que a data ou o ponto do
-- registro sejam corrigidos: é o código que já está no Biolog.
--
-- Só acrescenta uma coluna e uma trava. As amostras já gravadas ficam com
-- exported_at vazio (ainda não exportadas) e nada mais muda nelas.

alter table public.field_diary_samples
  add column if not exists exported_at timestamptz;

comment on column public.field_diary_samples.exported_at is
  'Quando a amostra saiu na planilha do Biolog. Preenchido, o código, o tipo e o número não mudam mais.';

-- A trava vale para qualquer caminho de gravação, não só para o app: amostra
-- exportada pode ter os outros dados corrigidos (profundidade, volume, conservação,
-- acondicionamento), mas não o que compõe o código.
create or replace function public.field_diary_samples_keep_exported_code()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.exported_at is not null
     and (new.sample_code, new.project_code, new.sample_type, new.sequence)
         is distinct from (old.sample_code, old.project_code, old.sample_type, old.sequence) then
    raise exception 'A amostra % já foi exportada: o código, o tipo e o número dela não mudam mais.', old.sample_code
      using errcode = '23514';
  end if;

  return new;
end
$function$;

revoke all on function public.field_diary_samples_keep_exported_code() from public, anon;

drop trigger if exists field_diary_samples_keep_exported_code on public.field_diary_samples;
create trigger field_diary_samples_keep_exported_code
  before update on public.field_diary_samples
  for each row execute function public.field_diary_samples_keep_exported_code();

-- A API passa a enxergar a coluna nova na hora.
notify pgrst, 'reload schema';
