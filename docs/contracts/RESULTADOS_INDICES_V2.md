# Contrato do módulo de Resultados por índices

## Identificadores

- Contrato do aplicativo: `yvae-results/2.0`.
- Cálculo: `SANEPAR-INDICE-0.3`.
- Catálogo bibliográfico: `SANEPAR-RISCOS-0.3`.
- Tolerância absoluta de auditoria: `1e-9`.

Essas versões são independentes. O contrato não possui classes qualitativas de risco.

## Interface pública inicial

O ponto de entrada é `src/modules/results/index.ts`:

- `parseResultsWorkbookV2(buffer, fileName)` abre e valida o arquivo oficial;
- `buildResultsWorkbookExportModelV2(buffer, campaignCodes)` entrega as sete abas como modelo serializável já recortado para uma ou mais campanhas;
- `calculateWeightedSignal(rows)` calcula `Q` e o componente transformado;
- `calculateComponentIndex(signal, alpha)` aplica a transformação logarítmica;
- `calculateAggregates(components)` calcula domínios, limites e índice geral;
- `competitionRanks(rows, value)` atribui posição somente a resultados completos;
- tipos e constantes do contrato são reexportados pelo mesmo arquivo.

O leitor normaliza em memória os prefixos OOXML `x:` e `ns1:` emitidos no arquivo oficial. O arquivo de origem não é regravado. Partes decorativas de tabela são ignoradas; células, fórmulas e caches continuam disponíveis.

O modelo de exportação contém valores calculados, não fórmulas com referências obsoletas. Catálogo, evidências, critérios e método permanecem no modelo. A fronteira de apresentação pode gravá-lo em XLSX e validar a reimportação pelo mesmo leitor sem reimplementar o saneamento ou o filtro científico.

## Regras científicas implementadas

Cada ponto é identificado por `campanha + SIA`. O código SIA é preservado literalmente; `SIA-3051037` e `SIA-1037` são chaves diferentes. Um componente acrescenta o conjunto à chave.

Os três conjuntos são Bactérias, Cianobactérias e COI. Os domínios são ambiental, operacional e saúde humana. Reads de organismos sem score continuam no denominador. Ausência de score permanece `null`, nunca zero.

O componente usa `alpha = 100`. Os conjuntos entram por média quadrática em cada domínio; os três domínios entram por média aritmética no índice geral. Para `k < 3`, valores agregados são `null` e somente os limites são emitidos. Para `k = 0`, os limites teóricos são 0–1. Ranking inclui apenas `k = 3` e usa posição competitiva.

`Aprovado` e `Disponível; qualidade não informada` são elegíveis quando os três componentes do conjunto são numéricos. O segundo estado continua provisório. Inconclusivo, falha confirmada, não realizado, ausência de registros ou estado desconhecido não entram na síntese.

## Auditoria do XLSX

As sete abas são obrigatórias e exclusivas. Cabeçalhos são resolvidos por nome e devem ser únicos. O leitor reconstrói componentes a partir dos registros moleculares, reads e catálogo, depois compara caches, componentes, limites, contagens e ranking com tolerância `1e-9`. Cache ausente é reconstruído com aviso; cache divergente ou erro de fórmula bloqueia a leitura.

O retorno separa completude do resultado, situação analítica dos conjuntos e futuras informações de publicação. Resultados parciais permanecem resultados válidos, mas não recebem valor pontual, classe ou posição.

## Publicação por escopo de campanhas

Uma publicação v2 substitui somente as campanhas explicitamente presentes no lote validado. Ela nunca representa um snapshot global de todas as campanhas:

- um lote contendo apenas C3 substitui integralmente C3 e preserva as publicações vigentes de C1, C2 e demais campanhas;
- um lote C1+C2+C3 substitui integralmente essas três campanhas e preserva C4 e quaisquer outras ausentes;
- a substituição é integral dentro de cada campanha selecionada: pontos omitidos não sobrevivem por merge;
- todas as campanhas selecionadas são validadas antes da troca atômica; qualquer falha preserva integralmente o conjunto vigente;
- a troca cria histórico rastreável e não apaga publicações anteriores;
- repetir a mesma identidade de conteúdo e versões é replay idempotente, não nova publicação.

`planCampaignPublicationScope` produz as listas `add`, `replace`, `unchanged` e `preserve` para prévia e persistência. `unchanged` identifica replay dentro do escopo selecionado; `preserve` contém exclusivamente campanhas vigentes fora desse escopo. O alias temporário `replay` mantém compatibilidade durante a integração. `replaceCampaignsByScope` materializa a visão ativa sem mesclar pontos dentro das campanhas selecionadas. Estado de publicação, completude molecular e situação analítica continuam conceitos separados.
