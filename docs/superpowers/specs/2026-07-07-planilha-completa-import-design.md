# Planilha de Campo completa — import aditivo, diário automático e fotos por link

**Data:** 2026-07-07
**Status:** Aprovado (conteúdo) — aguardando revisão do documento

## 1. Objetivo

Transformar a **Planilha de Campo** (`template-planilha-de-campo.xlsx`, aba `Campanhas`) na
"planilha completa": um único upload deve

1. gerar os pontos/mapas e a análise de campanha (comportamento atual);
2. **também** criar/atualizar os registros do **Diário de Campo** a partir das mesmas linhas;
3. baixar as **fotos** referenciadas por link (Google Drive de arquivo / Dropbox), convertê-las em
   **PNG** e anexá-las aos pontos e registros — deixando de guardar apenas o link;
4. oferecer **dropdowns** (validação de dados) em todos os campos de valor fixo do template.

A gravação segue a regra-mãe: **importação aditiva, sem apagar e sem sobrescrever
automaticamente**, com rastreabilidade de conflitos até a decisão do usuário.

## 2. Estado atual (resumo do levantamento)

- Existem duas planilhas independentes que não conversam:
  - `template-planilha-de-campo.xlsx` (aba `Campanhas`, 19 col) → `lib/imports/campaigns.ts` →
    `CampaignMapPoint[]` → mapas/análise.
  - `template-diario-de-campo.xlsx` (aba `Registros`, 18 col) → `api/field-diary/import` →
    `FieldDiaryEntry[]`.
- O import do Diário **descarta** campos que o modelo `FieldDiaryEntry` já suporta e que a planilha
  de campo já carrega: `collectionTime`, `samplesReplicasEdna`, `zooplanktonId`,
  `weatherConditions`, `pointAccessibility`, `photos`.
- **Nenhum** template tem dropdown (validação de dados); a aba `Valores válidos` existe solta.
- Fotos: `lib/imports/campaigns.ts` apenas guarda o link (`photoUrl = dropbox || drive`). O pipeline
  real de "baixar → PNG → Storage" **já existe** em `scripts/migrate-campaign-photos-to-storage.mjs`
  (usa `sharp`, bucket `photos`), porém isolado num script e só normaliza link do Dropbox
  (`toDownloadUrl` seta `dl=1`; não trata Google Drive).

## 3. Decisões do usuário

- **Sem limitação de origem**: uma planilha pode misturar campanhas; a campanha é identificada pela
  coluna "Campanha" de cada linha. (Relaxa a regra antiga "C1 só planilha, C2+ só diário" **para a
  entrada de dados**; o sourcing de renderização de mapas permanece inalterado.)
- **Fotos**: por enquanto **link de arquivo** apenas (Drive `/file/d/{id}`, preferencialmente
  compartilhado como "qualquer pessoa com o link"; Dropbox mantém comportamento flexível existente).
  Link de **pasta** do Drive fica para fase futura (exige API/credencial Google).
- **Múltiplas fotos por ponto**: múltiplos links separados por `;` na mesma célula (colunas Drive e
  Dropbox). Escolhido por não travar quantidade e não alterar a estrutura do template.
- **Conflitos**: modelo de **área de pendências** (resolver depois). Ao fim do upload, mostrar resumo
  + botão "Resolver agora".

## 4. Escopo

### 4.1 Template (`scripts/generate-field-spreadsheet-template.mjs`)

Novas colunas na aba `Campanhas` (para alimentar o Diário na mesma linha):
`Hora de coleta`, `Responsável`, `Atividades realizadas (;)`, `Houve ocorrência? (Sim/Não)`,
`Tipo de ocorrência`, `Descrição da ocorrência`, `Exige acompanhamento?`,
`Pendência / Encaminhamento`, `Resumo do dia`, `Status`.
Mantidas: Amostras e Réplicas, ID Zooplâncton, Condições Climáticas, Acessibilidade, Aspecto da água,
Drive, Dropbox.

Dropdowns (data validation `type: list`, `allowBlank`, `formulae` apontando para intervalos da aba
`Valores válidos`) em: **Campanha, Acessibilidade, Aspecto da água, Condições climáticas, Status,
Houve ocorrência (Sim/Não), Exige acompanhamento**. A aba `Valores válidos` ganha as colunas de
`Status`, `Sim/Não` e `Acompanhamento` necessárias.

O exemplo do template (hoje com link de **pasta** do Drive) é trocado por link de **arquivo**.

### 4.2 Módulo de fotos (`web/src/lib/imports/photo-fetch.ts`)

Extrair o pipeline do script de migração para uma função reutilizável:

```
fetchAndStorePhotoAsPng(sourceUrl, { supabase, storagePathBuilder }) → { storageUrl, originalUrl }
```

- **Normalização de URL** (`toDownloadUrl`):
  - Dropbox: força `dl=1` (comportamento atual).
  - Google Drive **arquivo**: `/file/d/{id}/...` ou `?id={id}` → `https://drive.google.com/uc?export=download&id={id}`.
  - Google Drive **pasta** (`/drive/folders/{id}`): **rejeitado** com mensagem clara ("link de pasta
    não suportado; use link de arquivo").
- `sharp`: `rotate()` + `resize(inside, ≤1600)` + `png()`; valida `metadata.format`; limite de bytes.
- Upload no bucket `photos` (`upsert`), retorna URL interna `/api/documents/file?bucket=...&path=...`.
- Suporta **vários links por célula** separados por `;` → devolve lista de fotos.
- O script `migrate-campaign-photos-to-storage.mjs` passa a importar esse módulo (remove duplicação).

### 4.3 Import unificado e aditivo

Ao carregar a Planilha de Campo, além de produzir `CampaignMapPoint[]` (como hoje), o fluxo:

1. **Mapeia cada linha → `FieldDiaryPayload`** (campos: campaign, day, entryDate, collectionTime,
   createdByName, locationName←Manancial, sia←Cód. SIA, lat/lon efetiva (fallback original),
   municipality, activities(;), waterVisualConditions←Aspecto da água, weatherConditions←Condições
   Climáticas, pointAccessibility←Acessibilidade, samplesReplicasEdna←Amostras, zooplanktonId←ID
   Zooplâncton, hasOccurrence, occurrenceType/Description, requiresFollowUp←Exige acompanhamento,
   followUpNotes←Pendência, dailySummary←Resumo do dia, status, photos←links baixados).
2. **Baixa as fotos** via `photo-fetch` e anexa aos pontos e aos registros.
3. **Classifica** cada registro contra o que já existe (chave = campanha + SIA/ponto + dia/data):
   - **Novo** → grava.
   - **Idêntico** (todos os campos comparados iguais) → ignora.
   - **Preenchimento aditivo** (campo do app vazio, planilha traz valor) → aplica (não é conflito).
   - **Conflito** (campo do app **e** da planilha não-vazios e diferentes) → **não grava**; registra
     pendência por campo.
4. Retorna resumo: `{ novos, identicos, conflitos, fotos }` + lista de conflitos.

Comparação de campos usa normalização (trim, NFD, minúsculas; arrays comparados como conjuntos).

### 4.4 Persistência de conflitos

Nova tabela Supabase `import_conflicts` (com fallback de navegador, como os outros imports):

| coluna | descrição |
|---|---|
| id | uuid |
| batch_id | id do upload |
| entity_type | `ponto` \| `diario` |
| entity_key | chave (campanha+SIA+dia/data) |
| field_name | campo em conflito |
| app_value | valor atual no app |
| sheet_value | valor vindo da planilha |
| status | `pendente` \| `resolvido` |
| resolution | `app` \| `planilha` \| null |
| created_at / resolved_at / resolved_by | rastreabilidade |

Migração criada em `web/supabase/` seguindo o padrão existente.

### 4.5 UI

- **Resumo pós-upload** no `spreadsheet-repository.tsx` (view `campo`): X novos / Y idênticos / Z
  conflitos + botão **"Resolver agora"**.
- **Área de Pendências de conflito** (nova rota em `Entrada de Dados`): lista de conflitos agrupados
  por registro; comparação **campo a campo** (app × planilha); ação **individual** ("usar app" /
  "usar planilha") e **em lote** (aplicar a todos os selecionados / a todos de um campo). Reaproveita
  o padrão visual de `import-preview-form.tsx`.
- Item de navegação em `lib/navigation.ts` sob "Entrada de Dados".

## 5. Componentes e limites

- `lib/imports/photo-fetch.ts` — baixa+converte+armazena foto. Entrada: URL(s). Saída: fotos no
  Storage. Depende de `sharp` + Supabase Storage. Testável isolando `fetch`.
- `lib/imports/field-spreadsheet-to-diary.ts` — mapeia linha da planilha → `FieldDiaryPayload`. Puro,
  sem I/O. Totalmente testável.
- `lib/imports/conflict-detection.ts` — classifica (novo/idêntico/aditivo/conflito) dado um registro
  incoming e o existente. Puro. Totalmente testável.
- Endpoint de import (campo) — orquestra: parse → fotos → diário → classificação → grava novos/aditivos
  → persiste conflitos → resumo.
- `import_conflicts` (tabela) + UI de resolução — leem/gravam decisões.

## 6. Tratamento de erros

- Foto: falha de download / não-imagem / excede limite / **link de pasta** → registro entra **sem a
  foto**, com aviso no resumo (nunca aborta o upload inteiro).
- Diário sem chave mínima (sem SIA e sem coordenada) → linha ignorada (como hoje nos pontos).
- Supabase indisponível → fallback de navegador nos mesmos moldes dos imports atuais.
- Conflito nunca sobrescreve: em dúvida, preserva o valor do app e cria pendência.

## 7. Testes (vitest, já configurado)

- `photo-fetch`: normalização de URL (Drive arquivo → uc?export; Drive pasta → rejeita; Dropbox →
  dl=1); split por `;`.
- `field-spreadsheet-to-diary`: mapeamento de todas as colunas; arrays por `;`; datas BR/ISO.
- `conflict-detection`: novo / idêntico / preenchimento aditivo / conflito (por campo, incluindo
  arrays como conjuntos).
- Geração de template: asserção de que as colunas fixas têm `dataValidation.type === "list"`.

## 8. Fora de escopo (fases futuras)

- API do Google Drive para **link de pasta**.
- Deleção/remoção de registros via planilha.
- Alterar o sourcing de **renderização** de mapas por campanha.
