# Conexão Yva'e → Tape (leitura dos dados de campo)

Atualizado em 28/11/2026. Permite que o Tape copie, para o contrato Yva´E, os dados de campo lançados aqui: pontos, campanhas, planejamento, registros do diário, amostras, parâmetros e medições, ações pontuais, fotos e documentos de campo. É **somente leitura**: nada do Yva'e é alterado pelo Tape. **Publicada e ligada em produção em 27/11/2026** (versão 2.1.5; cliente `tape-tec-br`, com retorno em `https://tape.tec.br/api/yvae/callback`). A primeira leitura de dados reais pelo Tape foi a prévia de 28/11/2026, que não grava nada; ela mostrou dois defeitos da projeção dos pontos, corrigidos na 2.1.6.

## O que foi acrescentado

| Arquivo | Papel |
|---|---|
| `supabase/migrations/20261127120000_tape_integration.sql` | Tabelas da conexão no esquema `private` (clientes, pedidos, códigos, concessões, tokens só em hash, retratos, hashes de arquivos, auditoria) e funções `tape_*`, executáveis só pelo `service_role`. Concede `integrations.delegate` a Admin e ATGC. Não toca dados de negócio nem as outras tabelas do esquema `private`. |
| `supabase/snippets/desfazer-conexao-tape.sql` | Roteiro de recuperação: remove só o que a migração criou. |
| `src/lib/integrations/tape/export.ts` | Projeção pura dos dados de campo para o protocolo `yvae-tape/3`. Lista fechada de campos; resultados de laboratório, índices de risco, contas e permissões não saem. |
| `src/lib/integrations/tape/handler.ts` | A API: consentimento, troca do código (PKCE), renovação rotativa, revogação, retrato, páginas e arquivos. |
| `src/app/api/integrations/tape/[...path]/route.ts` | Rota da API. |
| `src/app/integrations/tape/consent/page.tsx` | Tela em que a pessoa autoriza, recusa ou encerra a conexão, com a sessão normal do Yva'e. |
| `src/lib/access-control.ts` | Nova permissão “Autorizar a leitura dos dados de campo pelo Tape”. |

## Como funciona

1. O servidor do Tape, identificado como cliente registrado, abre um pedido e recebe o endereço da tela de consentimento.
2. A pessoa entra no Yva'e com a própria conta, vê o que será lido e autoriza. Só quem tem `data.view` e `integrations.delegate` consegue.
3. O Tape troca o código de uso único por um token de 5 minutos e um de renovação. A concessão dura no máximo 8 horas.
4. O Tape pede um retrato: todas as tabelas de campo são lidas numa única consulta (`tape_field_export`), o resultado é congelado e servido página a página, com identificador estável, versão e resumo de cada item.
5. Os arquivos (buckets `photos` e `documents`) saem só com tamanho e hash conferidos contra o retrato. Arquivo acima do limite (20 MB para foto, 50 MB para documento) é marcado como grande demais sem ser lido. Os demais são lidos um por vez em cada chamada; o hash é calculado em pedaços e o mesmo conteúdo conferido segue na resposta, sem outra cópia em memória.

A cada chamada a API revalida o token, a concessão, o cliente e a permissão **atual** de quem autorizou. A pessoa encerra a conexão quando quiser, em `/integrations/tape/consent`.

## Para ligar (feito em produção em 27/11/2026; vale para outro ambiente)

1. Aplicar a migração.
2. Definir `TAPE_INTEGRATION_ENABLED=true` e `TAPE_INTEGRATION_SECRET` (32 caracteres ou mais, aleatório). `APP_ORIGIN` já existe. Sem a primeira variável a API responde como desligada.
3. Registrar o cliente do Tape, por SQL:

```sql
select public.tape_client_register(
  '<clientId>', '<sha256 do segredo, em hexadecimal>',
  array['https://<endereço do Tape>/api/yvae/callback'],
  '<scopeId>', '<sourceProjectId>', '<id do contrato no Tape>', '<id do contrato no Tape>', true);
```

Para desligar: `update private.tape_clients set active = false` (as concessões em uso param na chamada seguinte) ou retirar a variável. Para remover tudo o que a migração criou, e só isso: `supabase/snippets/desfazer-conexao-tape.sql` (não é migração e não roda sozinho).

## Auditoria

`private.tape_audit` registra consentimentos, concessões emitidas, renovações, revogações (com o motivo), retratos criados e prontos, e recusas de acesso.

## Regras que valem registrar

- Ponto: a origem não tem cadastro mestre. A identidade exportada é o código SIA normalizado (a mesma regra de unicidade do diário: “SIA-0048”, “sia 48” e “48” são o mesmo ponto); sem código, o nome do local. O nome sai da coluna `point` da planilha de campanha quando ela traz um nome; nas planilhas reais essa coluna guarda o horário da coleta (lido do Excel como `1899-12-30T11:10:00.000Z`) ou fica vazia, e horário não é aceito como nome: nesse caso o nome vem do corpo hídrico (`waterBody`) e, na falta dele, do local digitado no diário. Com mais de um nome para o mesmo ponto, vale o mais recente e os demais seguem em `nameVariants`; nome que varia não põe a identidade em dúvida. Município que varia, sim: o ponto sai marcado como pendente.
- Planejamento: só a planilha vigente de cada campanha; as anteriores são contadas.
- Documento de campo: sai como de campo o documento anexado a um registro de campo (ação pontual) e o das categorias Plano de trabalho e Mapas quando ligado a uma campanha ou a um ponto. Resultados e Laudos ficam de fora, mesmo ligados a campanha ou ponto, e o arquivo nem é lido. A categoria Relatórios, sozinha, não comprova relatório de atividade de campo: sem o anexo a um registro de campo, o documento sai como indeterminado, com o motivo, e fica pendente no Tape. O título do arquivo nunca entra na decisão.
- Quem lançou o registro sai como autor do lançamento, com a ressalva de que não indica executor nem coletor.

## Verificação

`npx vitest run src/lib/integrations` (15 testes da projeção). O percurso completo e os critérios de aceite rodam pelo repositório do Tape (`scripts/yvae-e2e/`, ver `docs/YVAE_IMPORTACAO.md` de lá).
