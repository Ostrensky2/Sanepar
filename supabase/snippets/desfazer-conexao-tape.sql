-- Desfaz a migração 20261127120000_tape_integration.sql (conexão Yva'e → Tape).
-- NÃO é uma migração e não roda sozinho: só para recuperação, por quem administra o banco.
-- Remove apenas objetos da conexão: as funções public.tape_*, as dez tabelas
-- private.tape_* (com concessões, retratos e auditoria da conexão) e a permissão
-- integrations.delegate. Não toca dados de negócio nem as outras tabelas do esquema private.
--
-- Para só desligar, sem remover nada, prefira:
--   update private.tape_clients set active = false;
-- ou retire a variável TAPE_INTEGRATION_ENABLED do aplicativo.
--
-- Antes de remover, guarde a auditoria se ela interessar:
--   select * from private.tape_audit order by id;

begin;

drop function if exists public.tape_access(text);
drop function if exists public.tape_audit_add(text, text, text, uuid, jsonb);
drop function if exists public.tape_client_read(text);
drop function if exists public.tape_client_register(text, text, text[], text, text, text, text, boolean);
drop function if exists public.tape_code_actor(text);
drop function if exists public.tape_consent(text, uuid, boolean, text);
drop function if exists public.tape_exchange_code(text, text, text, text, text, text, text);
drop function if exists public.tape_field_export();
drop function if exists public.tape_grant_read(text, text);
drop function if exists public.tape_grants_for_actor(uuid);
drop function if exists public.tape_refresh(text, text, text, text, text);
drop function if exists public.tape_request_create(text, text, text, text, text);
drop function if exists public.tape_request_read(text);
drop function if exists public.tape_revoke(text, text, uuid, text);
drop function if exists public.tape_snapshot_create(text, text, text);
drop function if exists public.tape_snapshot_finalize(text, text, jsonb, jsonb);
drop function if exists public.tape_snapshot_object(text, text, text);
drop function if exists public.tape_snapshot_object_done(text, text, text, text, text, text);
drop function if exists public.tape_snapshot_objects_init(text, text, jsonb);
drop function if exists public.tape_snapshot_objects_pending(text, text, integer);
drop function if exists public.tape_snapshot_page(text, text, integer, integer);
drop function if exists public.tape_snapshot_read(text, text, boolean);
-- Depende do tipo da tabela de clientes: sai antes dela.
drop function if exists public.tape_client_binding(private.tape_clients);

-- Dos filhos para os pais.
drop table if exists private.tape_snapshot_items;
drop table if exists private.tape_snapshot_objects;
drop table if exists private.tape_snapshots;
drop table if exists private.tape_tokens;
drop table if exists private.tape_grants;
drop table if exists private.tape_codes;
drop table if exists private.tape_requests;
drop table if exists private.tape_clients;
drop table if exists private.tape_object_hashes;
drop table if exists private.tape_audit;

delete from public.app_role_permissions where permission = 'integrations.delegate';

commit;
