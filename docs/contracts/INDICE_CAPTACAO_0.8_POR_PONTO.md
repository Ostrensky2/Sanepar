# Índice de captação 0.8 — nota por campanha e ponto (SIA)

Todo o aplicativo usa a metodologia 0.8. Não existe consulta, tela, planilha ou
exportação de outra edição: pedir `version=0.7` às rotas devolve 422.

## Fonte das notas

- `src/lib/capture-index/pontos-0.8.json`: uma linha por campanha + SIA, com
  `geral`, `ambiental`, `operacional` e `saude` (número de 0 a 1 ou `null`).
- Gerado por `scripts/indice-08/gerar_pontos_08.py`, que usa a adjudicação
  congelada (`audit/COMP-08-23`) e o núcleo `src/lib/results-08-core.ts`.
  O script só grava se os agregados reconstruídos das notas individuais forem
  idênticos, campo a campo, a `src/lib/results-08-aggregate.json` (C1, C2, C3 e
  total; geral e três categorias; contagens, mínimo, média, máximo, 40 intervalos
  e 5 faixas).
- `src/lib/capture-index/indice-captacao.json` fornece apenas leituras, fichas e
  alertas de cada observação. Suas notas antigas são substituídas na carga do
  módulo (`src/lib/capture-index/index.ts`) e nunca são exibidas ou exportadas.
- A chave é sempre campanha + SIA. Cada campanha é ordenada, resumida e
  calculada só com as suas próprias observações.

Lote atual: C1 73 observações e 73 notas gerais; C2 76 e 75; C3 76 e 76. Esses
totais são conferência, não regra de código.

## Nota de cada categoria

Cada organismo com ficha contribui com a massa
`q = (reads ÷ reads válidos do marcador − base do grupo) × gravidade ÷ 3 × aplicabilidade`.
Gravidade vai de 1 a 3; aplicabilidade é 1, 0,5, 0,1 ou 0; a base só existe para os grupos
que somam em conjunto (diatomáceas e assinatura de esgoto). Em cada marcador utilizável soma-se
`q` e aplica-se a curva `ln(1 + 100·Q) ÷ ln(101)`. A nota da categoria é a do marcador de maior
nota. Ocorrência com menos de 10 reads ou menos de 0,01% da biblioteca vira alerta e não pontua.

## Índice geral

`max(M, maxᵢ[pᵢ + (1 − pᵢ)(Bᵢ + Cᵢ) ÷ 2])`. M é a maior das três notas (o piso). Cada categoria
positiva é testada como primária; B e C são as notas de reforço das outras duas, contando só
consequência distinta, com evidência aplicável e admitida pela adjudicação, e a maior massa de
cada classe repetida. Sem reforço elegível, o geral é o piso. Não é média nem média quadrática.

## Campanhas independentes

Tudo é por campanha: nota, ordenação, média, mediana, P90 e faixas. Não existe total, média ou
exportação juntando campanhas. Onde as campanhas aparecem lado a lado, é só para consulta.

## Três estados que não se confundem

| Estado | Quando | Tela | Planilha |
| --- | --- | --- | --- |
| Nota calculada | há nota, inclusive zero | número (`0,00` para zero) | número (`0` para zero) |
| Sem estimativa | há biblioteca, mas a nota não pode ser afirmada | “Sem estimativa” | célula vazia + estado “Sem estimativa” |
| Sem medição | nenhuma biblioteca utilizável | “Sem medição” | célula vazia + estado “Sem medição” |

Erro técnico (consulta falhou, sem sessão, parâmetro inválido) é resposta de
erro da rota e mensagem de falha na tela; nunca vira nota, zero ou estado.

Caso real: C2 · SIA 257 tem só o COI utilizável. Sem o 16S, a categoria de saúde
não pode ser afirmada, e o índice geral também não. Ambiental e operacional têm nota.

## Superfícies

| Superfície | Origem |
| --- | --- |
| Mapa, painel do ponto, tabela e ranking da campanha | `GET /api/results/capture-index/campaigns` |
| Ficha por ponto, visão por campanha e rede | `GET /api/results/capture-index?format=views&campaign=N&sia=S` |
| Consulta por SIA e planilha unificada (aba “Resultados finais”) | `GET /api/results/capture-index?campaign=N` |
| CSV de leitura e de auditoria | `GET /api/results/capture-index?format=csv|audit` |
| Agregados da Home e exportação agregada | `GET /api/results/aggregate-export` |

Todas exigem `data.view`, respondem `private, no-store` e `X-Results-Version: 0.8`.

## Perfis de risco biológico da captação

`src/lib/capture-index/risk-profiles.ts` associa a cada campanha + SIA dois perfis:

- operacional: nota da categoria “Riscos operacionais” e os tipos de efeito com
  contribuição documentada (gosto e odor, obstrução por diatomáceas, incrustação
  biológica, larvas de quironomídeos);
- sanitário: nota da categoria “Perigo potencial à saúde, na captação” e os tipos
  de efeito com contribuição documentada (potencial de cianotoxinas, assinatura fecal).

O perfil usa somente fichas do catálogo de efeitos presentes naquela amostra.
Nada é inferido de outra campanha, de outro ponto ou do nome do táxon. É associação
documentada; o efeito não foi medido. Aparece no painel do ponto, na ficha, no CSV
de leitura e nas colunas X e Y da aba “Resultados finais”.

## Verificação

`npx vitest run src/lib/capture-index src/lib/imports src/lib/__tests__/adocao-editorial.test.ts`
confere as 225 observações nas rotas, os três estados, a planilha reaberta e os
perfis. A conferência em navegador (selecionar o mesmo SIA em C1, C2 e C3, comparar
painel, mapa, ficha, tabela e o XLSX baixado pelo botão) está registrada em
`audit/ADOCAO-08/E2E-POR-PONTO`.
