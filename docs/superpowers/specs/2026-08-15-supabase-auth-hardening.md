# Supabase Auth hardening — contrato de implementação

Estado: candidato local; produção bloqueada até preflight E6 11/11, SMTP/DNS e gate E9. `CLOUD_DB_MUTATIONS=ZERO` nesta ordem.

## Decisões e fronteiras

- Supabase Auth é o único autenticador. Não existe senha provisória, lista de usuários, hash, cookie HMAC ou fallback em `localStorage` no bundle.
- O browser recebe somente a chave publicável. `SUPABASE_SECRET_KEY`/service role e `AUTH_RATE_LIMIT_PEPPER` são server-only.
- Toda API protegida chama `requireApiSession`: `auth.getUser()`, perfil por `auth_users.auth_user_id = auth.uid()`, `status='ativo'` e, quando aplicável, `has_current_permission(p_permission)`. Role/e-mail enviados pelo cliente ou claims antigos não autorizam.
- E6 fornece fundação aditiva (`auth_user_id`, permissões atuais, auditoria redigida e limiter) e cutover fail-closed/RLS. O cutover aborta se não houver 11/11 vínculos.

## Contratos HTTP

| Fluxo | Contrato | Resposta/controle |
|---|---|---|
| Login | `POST /api/auth-users/login {email,password}` | sessão SSR HttpOnly; 401 uniforme para credencial; 403 perfil ausente/inativo; 429 limite; sem hash |
| Sessão | `GET /api/auth-users/session` | `session`, `purpose=authenticated|invite|recovery`, `canSetPassword`; `no-store` |
| Logout | `DELETE /api/auth-users/session` | origin estrita e `signOut(global)` |
| Recuperação | `POST /api/auth-users/reset-password {email}` | sempre 202 uniforme; redirect fixo `/auth/callback?type=recovery&next=/definir-senha` |
| Callback | `GET /auth/callback` | troca PKCE; somente path relativo interno; purpose HttpOnly curto |
| Definir senha | `POST /api/auth-users/change-password {newPassword}` | somente sessão invite/recovery; atualiza Supabase, encerra sessão global e exige novo login |
| Gestão | `GET/PUT /api/auth-users` | `users.manage`; comandos `invite`, `resend-invite`, `update`, `delete`; nunca recebe/retorna senha |

Toda mutação cookie-auth exige `Origin === APP_ORIGIN`. O limiter chama `consume_auth_rate_limit` nas dimensões `<fluxo>:ip`, `:identifier` e `:pair`, com HMAC-SHA-256/pepper; todas devem permitir e qualquer erro nega. IP/e-mail claros não chegam ao banco nem aos logs.

## Configuração externa obrigatória

- `APP_ORIGIN` canônica e redirects Supabase allowlisted para `/auth/callback`.
- `NEXT_PUBLIC_SUPABASE_URL`, chave publicável, `SUPABASE_SECRET_KEY` (ou service role), `AUTH_RATE_LIMIT_PEPPER` e `AUTH_PURPOSE_SECRET` aleatórios e server-only com pelo menos 32 caracteres.
- SMTP do Supabase Auth, SPF/DKIM/DMARC e templates de convite/recuperação sem senha. Validar entrega e expiração antes do cutover.
- Política Supabase: JWT curto; refresh rotation/reuse protection; proteção de senha vazada/MFA conforme plano contratado.

## Sequência de migração sem lockout

1. Aplicar e testar somente a fundação E6 após backup; manter o código antigo publicado até o passo de vinculação.
2. Migrar credenciais na ordem A/B/C abaixo; convites/recuperação são fallback individual, nunca lote automático.
3. Confirmar 11/11, unicidade, perfis ativos/roles e entrega de e-mail; testar invite, recovery, reenvio e rollback com contas fixture.
4. Publicar código Supabase Auth e aplicar cutover E6 na mesma janela controlada. O preflight do cutover deve abortar se qualquer vínculo estiver ausente.
5. Revogar sessões após reset, inativação ou mudança de papel; verificar RLS horizontal/vertical, headers/CSP e ausência de senha/listas nos chunks.
6. Somente após E9: retirar coluna/hash legado em ordem posterior com backup e retenção definidos. Esta ordem não apaga hashes históricos.

## Evidência mínima do gate

- Unit/integration: login válido/inválido/inativo, perfil ausente, permissão atual, limiter 3D e falha fechada, recovery anti-enumeração, callback externo rejeitado, purpose, update apenas invite/recovery e logout global.
- SQL E6: 11/11 preflight, grants/RLS, acesso horizontal/vertical, rate limit concorrente e rollback.
- E2E Playwright: convite, recuperação, reenvio, login e inativação; Playwright não contém lógica de autenticação.
- Build publicado: busca estática por senha/lista/hash negativa; cookies/headers e redirects verificados; nenhuma PII/token em logs.

Risco residual atual: cloud tem 0/11 vínculos e políticas legadas amplas. Portanto o candidato local está **pronto para integração**, mas **não pronto para deploy/cutover**.

Evidência E6 isolada: foundation reaplicada duas vezes em PostgreSQL 17 (`PASS` de idempotência); cutover deliberado com 0/11 foi rejeitado e a transação não alterou perfis, `legacy_auth_disabled_at` ou política anterior (`CUTOVER_FAIL_CLOSED_PASS`).

## Decisão A/B/C para hashes existentes

- Formato observado no código: `scrypt$<salt hex 16 bytes>$<derived hex 64 bytes>`, Node `crypto.scrypt` com `N=16384`, `r=8`, `p=1` e `keylen=64`. A fixture sintética confirma verificação determinística; nenhum valor real foi usado ou impresso.
- **A — importação direta: rejeitada/fail-closed.** Um GoTrue `v2.195` isolado recusou o hash sintético nesse formato. A API `createUser(password_hash)` documenta bcrypt/Argon2; o suporte scrypt declarado pelo SDK é especificamente Firebase, com formato e parâmetros próprios. O schema interno `auth.users` não é alterado diretamente.
- **B — migração progressiva: selecionada.** Com `AUTH_LEGACY_MIGRATION_ENABLED=true` somente entre a foundation e a confirmação 11/11, um login Supabase inicialmente inválido procura exclusivamente perfil ativo e ainda não vinculado, verifica o hash custom server-side e cria a conta Auth com a senha apresentada para rehash GoTrue. O vínculo é concluído exclusivamente pela RPC atômica `link_migrated_auth_user`; retorno falso/erro apaga somente o Auth user recém-criado. Create/login sintético passou. A flag deve estar `false` antes do cutover.
- **C — redefinição individual:** somente para perfis que não concluírem B após janela definida ou cujo hash seja incompatível/corrompido, via recuperação/convite individual auditado. Não há redefinição geral.

Referências oficiais: Supabase `admin.createUser`, migração Auth0 (algoritmos importáveis), migração Firebase (scrypt específico e migração no primeiro login), password security e repositório GoTrue/Auth (não modificar schema interno).
