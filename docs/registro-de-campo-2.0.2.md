# Registro de campo mais seguro — versão 2.0.2

Data: 01/11/2026. Referência de leitura: IAGen (`G:\Aplicativos\CSC\web`), sem nenhuma alteração nele.

**Estado desta revisão:** consultas de produção realizadas em modo somente leitura no projeto `uoptbbmfgfiuhbmicofp`. As duas migrations da versão 2.0.2 ainda não foram aplicadas. Os resultados posteriores à migração descritos abaixo são esperados e precisam ser confirmados depois da execução.

## O que mudou

1. **Fechamento do banco para quem não fez login.** A migration `20261101110000_close_anon_access.sql` remove políticas abertas (`anon`, `public` ou `using (true)`), liga o RLS nas tabelas de `public`, tira os privilégios de `anon` em tabelas, views, sequências e funções, deixa os buckets privados e recria as políticas por categoria de acesso listadas neste relatório. Objetos pertencentes a extensões ficam fora da varredura de relações e funções. Os privilégios padrão alterados são os do papel executor (`postgres` nesta produção), no escopo explicado abaixo. A conferência final **desfaz a migration** se encontrar políticas abertas, privilégios de tabela ou execução de funções para `anon`, buckets públicos ou tabelas sem RLS. No app, o servidor passa a exigir uma chave secreta (`SUPABASE_SECRET_KEY` ou `SUPABASE_SERVICE_ROLE_KEY`); a chave publicável fica só para o login.
   - Nenhuma tela dependia de acesso anônimo: o navegador não lê nem grava tabelas diretamente. Tudo passa pelas rotas de API, que conferem a permissão (`requireApiSession`). Fotos e documentos são entregues por link assinado do servidor, e os envios usam autorização de envio assinada, que não depende de política de `anon`.
2. **Coordenadas como número conferido.** `field_diary_entries.latitude/longitude` passam de texto para `numeric(9,6)`. Aceita vírgula ou ponto; latitude de -90 a 90, longitude de -180 a 180, sempre em par. O banco recusa o que não confere (restrições `_coordinates_pair_ck`, `_latitude_ck`, `_longitude_ck`). As mesmas regras, com mensagens em português, valem no formulário (`form.tsx`), na API (`/api/field-diary`), na resolução de conflitos, na planilha de campo (`campaigns.ts`) e na conversão para o Diário (`field-spreadsheet-to-diary.ts`). Na importação, a linha com coordenada inválida entra sem a coordenada e aparece no aviso com o número da linha.
3. **Situação do ponto**, com os códigos do IAGen (`execution_status`): Planejado, Realizado, Não realizado, Realocado e Bloqueado. Realocado exige motivo (`relocation_reason`, até 500 caracteres), no formulário, na API, na importação e no banco. A situação aparece no formulário, no detalhe do registro, no cartão e no balão do mapa e numa legenda com a contagem por situação. Os pontos continuam pretos (regra 13) e a linha original → efetiva não mudou.
4. **Vocabulário único** com o IAGen (`src/lib/field-diary-vocabulary.ts`): os termos do IAGen vêm primeiro e foram mantidos os termos próprios do Sanepar, entre eles “Coleta parcial”, “Coleta não realizada”, “Ponto inacessível” e “Atraso operacional”. A equivalência abaixo é aplicada na migration, na importação, na API e na resolução de conflitos. Termo sem equivalente é mantido como está.
5. Os modelos de planilha (`public/template-*.xlsx`) foram atualizados com as listas novas e as colunas “Situação do ponto” e “Motivo da realocação”. As duas colunas são opcionais: planilhas antigas continuam sendo aceitas.

A regra “um ponto (SIA) + uma data = um registro” e os estados de governança (importado, em revisão, consolidado, corrigido) não mudaram.

## Acesso ao banco: diagnóstico e efeito esperado

As consultas de `scripts/db-checks/anon-access-readonly.sql` foram verificadas em produção, em modo somente leitura, em 01/11/2026. Este é o estado anterior à aplicação das duas migrations:

| Verificação | Resultado em produção |
|---|---:|
| Políticas que alcançam `anon`/`PUBLIC` ou liberam tudo com `true` | 39 |
| Tabelas/views de `public` com privilégios de `anon` | 10 |
| Funções de `public` executáveis por `anon` | 6 |
| Tabelas de `public` sem RLS | 1 |
| Buckets públicos | 0 |

Os números anteriores, obtidos em banco local reconstruído, não representavam a produção. A tabela sem RLS identificada é `field_diary_change_log`.

**Resultado esperado após aplicar e conferir:** zero achados nas cinco consultas de diagnóstico. Este resultado ainda não foi medido após a migração. As seguintes políticas são criadas pelas duas migrations para `authenticated`, condicionadas às permissões do perfil:

| Tabela | Políticas criadas (papel `authenticated`) |
|---|---|
| app_activity_logs | `yvae_activity_log_select` (settings.activity) |
| app_documents | `yvae_documents_select/insert/update/delete` |
| campaign_imports | `yvae_campaign_imports_select/insert/update/delete` |
| campaign_management | `yvae_campaign_management_select/insert/update/delete` |
| field_diary_change_log | `yvae_field_diary_change_log_select` (data.view) |
| field_diary_coordinate_migration_log | `yvae_field_diary_coordinate_log_select` (data.view) |
| field_diary_entries | `yvae_field_diary_select/insert/update/delete` |
| import_conflicts | `yvae_import_conflicts_select/insert/update/delete` |
| lab_risk_results | `yvae_lab_risk_results_select/insert/update/delete` |
| point_actions | `yvae_point_actions_select/insert/update/delete` |
| storage.objects | `yvae_storage_select/insert/update/delete_secured` |

As funções de permissão necessárias existem na produção consultada. `auth_users`, `security_audit_log` e `support_requests` não recebem políticas para `authenticated` nesta versão; seu acesso pelo app permanece nas rotas do servidor com chave secreta e verificação de sessão/permissão. As políticas dessas três tabelas apresentadas no relatório anterior pertencem ao cutover de autenticação, que não será aplicado nesta publicação.

### Privilégios de objetos futuros

As alterações de privilégios padrão valem para objetos criados pelo papel que executa a migration, `postgres` nesta produção. Para tabelas e sequências, são removidas as concessões a `anon`/`PUBLIC` no schema `public`. Para funções, é removido também o `EXECUTE` global padrão de `PUBLIC`, porque a revogação apenas por schema não elimina esse privilégio global. Os grants explícitos existentes para `authenticated` e `service_role` são preservados. Essa regra segue a [documentação oficial do PostgreSQL sobre `ALTER DEFAULT PRIVILEGES`](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html).

Defaults de outros criadores, incluindo `supabase_admin`, não são alterados. Portanto, esta migration não garante os privilégios de objetos futuros criados por esses outros papéis.

## Prévia de conversão das coordenadas

A consulta somente leitura de `scripts/db-checks/field-diary-coordinates-readonly.sql` foi realizada em produção antes da aplicação:

| Verificação | Resultado em produção |
|---|---:|
| Registros de campo | 231 |
| Registros com latitude e longitude preenchidas | 153 |
| Registros sem par preenchido | 78 |
| Registros cujas coordenadas serão anuladas segundo a prévia | 0 |

Nos dados lidos, nenhum registro foi identificado para anulação das coordenadas. A migration adquire o lock da tabela antes de montar os planos de conversão e vocabulário, impedindo gravações concorrentes entre a classificação e a aplicação. Se não conseguir o lock no prazo configurado, a transação falha sem aplicar as alterações.

Se houver coordenadas inválidas no momento da execução:

- o texto original será guardado em `public.field_diary_coordinate_migration_log`, com campanha, data, SIA e motivo;
- as coordenadas anuladas entrarão no histórico do registro (`field_diary_change_log`, origem “migração 2.0.2”);
- quando só um dos dois valores falhar, o par inteiro ficará em branco, porque o banco exige o par completo; o texto dos dois será guardado.

Motivos possíveis: “latitude não é número”, “longitude não é número”, “fora da faixa” e “par incompleto”. No teste local, os casos `abc`, latitude sem longitude e latitude `-95` viraram nulo e ficaram guardados. Os casos `-25.4284`, `-25,5` e `  -49,1 ` (vírgula e espaços) foram convertidos. Valores com mais de 6 casas decimais são arredondados para 6 casas, cerca de 10 cm no terreno.

Depois do `db push`, para ver o que foi guardado:

```sql
select * from public.field_diary_coordinate_migration_log order by campaign_name, entry_date;
```

## Tabela de equivalência do vocabulário

| Lista | Termo antigo | Termo novo |
|---|---|---|
| Atividades | Coleta realizada | Coleta de eDNA (e também Coleta de zooplâncton quando há ID de zooplâncton) |
| Atividades | Vistoria visual | Reconhecimento do ponto |
| Atividades | Medição em campo | Medição de parâmetros |
| Condição da água | Aparentemente normal | Água clara |
| Condição da água | Turbidez visual elevada | Água turva |
| Condição da água | Espuma | Presença de espuma |
| Clima | Sol | Céu limpo |
| Clima | Sol entre nuvens | Parcialmente nublado |
| Clima | Nublado Pós Chuva | Nublado |
| Clima | Chuvoso | Chuva fraca |
| Clima | Garoando | Chuva fraca |
| Clima | Nublado / Neblina | Neblina |
| Acesso ao ponto | Fácil | Acesso normal |
| Acesso ao ponto | Moderado | Acesso moderado |
| Acesso ao ponto | Difícil | Acesso difícil |
| Acesso ao ponto | Inacessível | Acesso bloqueado |
| Ocorrência | Problema de acesso ao ponto | Acesso impedido |
| Ocorrência | Problema com equipamento | Falha de equipamento |
| Ocorrência | Condição climática adversa | Condição climática |
| Ocorrência | Outro | Outra |

A comparação ignora maiúsculas e acentos. Cada lista traz primeiro os termos do IAGen, na mesma grafia, e depois os termos que só o Sanepar usa:

- Atividades: Deslocamento entre pontos, Contato com equipe local, Coleta não realizada e Outra atividade.
- Condição da água: Alteração de cor, Material flutuante, Presença aparente de floração, Resíduos, Peixes ou organismos mortos, Nível de água visualmente baixo e Outra condição.
- Clima: Tempestade, Neblina e Não informado.
- Acesso ao ponto: Acesso moderado.
- Ocorrência: Ponto inacessível, Coleta parcial, Coleta não realizada, Atraso operacional e Demanda recebida em campo.

## Situação dos registros antigos

Os registros que já existem recebem a situação deduzida do que foi anotado, na mesma ordem no banco e no app:

1. **Não realizado**, se a atividade ou a ocorrência é “Coleta não realizada”.
2. **Realizado**, se há atividade, hora de coleta, amostras ou ID de zooplâncton.
3. **Bloqueado**, se a ocorrência é “Ponto inacessível” ou o acesso está como inacessível ou bloqueado.
4. **Planejado** nos demais casos.

“Realocado” nunca é deduzido, porque exige motivo escrito por alguém.

Essa inicialização de `execution_status` é uma inferência para preencher a coluna nova e não gera uma entrada individual no histórico por registro. O histórico da migration registra as coordenadas anuladas e as substituições de vocabulário.

## Ponto de atenção: Campanha 1 consolidada

A regra “Campanha 1 já está consolidada, não se mexe nela” convive com o pedido de aplicar a equivalência na migration. A migration troca os termos e converte as coordenadas também nos registros consolidados, mas **não muda o estado de governança** (continua “consolidado”) e grava cada troca no histórico do registro. Se preferir deixar a Campanha 1 com os termos antigos, é uma linha na migration, e isso precisa ser decidido antes do `db push`.

## Conferências

### Verificações informadas no pacote original (`5f5bd33`)

- Testes novos (24, todos passando): coordenada inválida recusada, par incompleto recusado, realocado sem motivo recusado, texto antigo convertido em número e equivalência do vocabulário. Estão em `src/lib/__tests__/field-record-rules.test.ts`, `src/app/api/field-diary/route.test.ts` e `src/lib/imports/__tests__/campaign-sheet-field-rules.test.ts`.
- Teste das migrations em Postgres 16 (`supabase/tests/field_record_hardening.sql`): passou, inclusive aplicando as duas migrations duas vezes. Também entrou em `scripts/auth-hardening/run-local-tests.ps1`.
- `npm test`: 484 passam e 5 falham. As 5 falhas já existiam antes desta mudança e falham igual no código anterior: prévia de resultados, contrato do repositório de documentos, contrato tipográfico, plano “próximo deploy 2.0.0” e exportação de relatório.
- `npm run lint`: sem problemas nos arquivos deste trabalho. Os únicos 2 erros são de `inspect_sheet.js`, um script avulso da raiz que já existia e que não foi alterado.
- `npm run typecheck` e `npm run build`: passaram.

### Verificações desta revisão

- Consultas somente leitura de produção realizadas; contagens de acesso e de coordenadas registradas acima. As migrations 2.0.2 ainda não foram aplicadas.
- Schema conferido: coordenadas ainda em texto, sem defaults incompatíveis; 231 IDs compatíveis com o histórico UUID; sem triggers de usuário nem views dependentes de `field_diary_entries` que impeçam a conversão.
- API corrigida para rejeitar uma situação desconhecida antes que a normalização descarte o valor. Os 24 testes originais e duas regressões de POST/PUT passaram: **26/26**. A checagem de tipos também passou, em ambiente mock e sem credenciais.
- Teste SQL ampliado para criar uma função e uma sequência após as migrations, recusar acesso de `anon` e confirmar a preservação dos grants de `authenticated` e `service_role`.
- Teste SQL ampliado para recusar motivo de realocação com 501 caracteres e aceitar o limite de 500. A suite passou em banco descartável PostgreSQL 18.6 via PGlite 0.5.14, com aplicação das duas migrations duas vezes e seis registros sintéticos. Isso valida o SQL localmente; a conferência de produção permanece uma etapa separada.

## Escopo da publicação e cutover pendente

Esta publicação deve aplicar somente `20261101110000_close_anon_access.sql` e `20261101120000_field_diary_coordinates_status_vocabulary.sql`. A migration antiga `20260815091000_supabase_auth_rls_cutover.sql` continua pendente e fora do escopo: depende de 11/11 perfis vinculados e de seus próprios controles operacionais. Ela não deve ser executada nem marcada como aplicada para liberar o envio das duas migrations novas.

O histórico remoto consultado antes da publicação contém 22 migrations aplicadas. O cutover antigo foi movido, com conteúdo integralmente preservado, para `supabase/pending/20260815091000_supabase_auth_rls_cutover.sql`. Assim, permanece fora da fila automática de `db push`; o teste isolado de autenticação continua usando esse arquivo em suas próprias fixtures. A mudança de diretório não altera o banco nem marca a migration como aplicada.

A publicação pela conexão de APIs gera novos identificadores de migration no servidor. Os dois arquivos desta versão serão sincronizados com os identificadores efetivamente registrados antes da publicação do código, sem editar ou fabricar linhas no histórico de migrations. O commit de publicação terá o pacote `5f5bd33f64aa745ad8d417147f288801f094fdcb` como origem documentada e incluirá as correções desta revisão.

## Fora do escopo desta versão

GPS do celular, fila offline, EXIF das fotos e rota de barco.
