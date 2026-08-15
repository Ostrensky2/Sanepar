-- Aplicar depois da foundation e antes do cutover.
insert into auth.users (id, email)
select
  format('00000000-0000-0000-0000-%s', lpad(n::text, 12, '0'))::uuid,
  format('fixture-%s@example.invalid', n)
from generate_series(1, 11) as n;

insert into public.auth_users (
  id, name, email, institution, role, status, password,
  must_change_password, created_at_label, last_access, updated_at,
  auth_user_id, auth_linked_at
)
select
  format('fixture-profile-%s', n),
  format('Fixture %s', n),
  format('fixture-%s@example.invalid', n),
  case
    when n = 1 then 'Admin'
    when n in (2, 3) then 'ATGC'
    when n in (4, 5) then 'UFPR'
    when n in (6, 7) then 'Sanepar'
    when n in (8, 9) then 'Tecpar'
    else 'UFPR'
  end,
  case
    when n = 1 then 'Admin'
    when n in (2, 3) then 'ATGC'
    when n in (4, 5) then 'UFPR'
    when n in (6, 7) then 'Sanepar'
    when n in (8, 9) then 'Tecpar'
    else 'UFPR'
  end,
  case when n = 11 then 'inativo' else 'ativo' end,
  format('fixture-legacy-hash-%s', n),
  false,
  'fixture',
  'fixture',
  now(),
  format('00000000-0000-0000-0000-%s', lpad(n::text, 12, '0'))::uuid,
  now()
from generate_series(1, 11) as n;
