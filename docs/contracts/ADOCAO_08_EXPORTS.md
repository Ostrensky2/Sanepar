# Adoção 0.8 — contrato da exportação por campanha

Pai de implementação: `2327c803bc050d035c1ff0ea041a85801116140e`.
Fonte única E8/TypeScript: `FONTE-OFICIAL-08-SINAL-DOCUMENTADO-v2.json`, SHA-256
`5667da69789821f2744812e516282e54fdb73008e8cdb80051801931af455308`.
Versão `0.8`, política `sinal-documentado/1`, schema `agregados-home-export/1`.
As fontes anteriores de 225 estimativas estão supersedidas e não são fallback.
Não houve recálculo nesta camada. O hash do JSON canônico incorporado é
`9382ada8ea0cc5169d8541a6cf671b5834eecae298a837c11f49ea37fcbb2e4a`.

## Fonte e autorização

`GET /api/results/aggregate-export` requer `data.view`, com `private, no-store`.
CSV é o padrão; `format=json` e `format=xlsx` são opcionais. `group` admite exclusivamente
`C1`, `C2`, `C3`; ausente retorna as três campanhas, cada uma à parte. As campanhas são
independentes: não há linha, grupo ou média juntando campanhas (`group=total` devolve 422). Outros parâmetros e
duplicações são rejeitados. Não aceita seleção nominal, ponto, táxon ou local.

Cada grupo contém apenas `geral08`, `ambiental`, `operacional`, `saude` com
`observados`, `numericos`, `nulos`, `minimo`, `media`, `maximo`, `colunas`, `faixas`.
Os números são copiados da fonte congelada,
sem arredondar ou derivar estatísticas dos bins. Classes: [0,.05), [.05,.15),
[.15,.35), [.35,.70), [.70,1]. O grupo `total` do arquivo-fonte serve só para
conferir a integridade da fonte; nunca é exibido nem exportado.
Nenhuma nota de edição anterior entra nesta exportação.
O JSON é importado exclusivamente por módulo `server-only`, fora de `public`.
`results08HomeDistribution()` e o CSV/JSON/XLSX usam a mesma função `results08Aggregate()`.
O XLSX é um attachment real: aba `Por campanha 0.8` com observados, numéricos,
nulos, mínimo, média e máximo; aba `Fonte` com versão, política, schema e SHA-256.
A nota por SIA sai na planilha unificada e no CSV de leitura, não aqui. Null é célula vazia e zero permanece número.
MIME Office Open XML, edição, escopo e hash da fonte constam dos headers;
falha técnica retorna 503 JSON, nunca um arquivo histórico ou uma planilha vazia.
A Home recebe `n` como alias de `numericos`, nunca de `observados`.
C2 geral e saúde: 75 numéricos de 76 observados; nas demais séries e campanhas, todos
numéricos. Cada série conserva seu denominador.
Os nulos não entram nos 40 bins, cinco faixas, médias ou extremos; se não houver
numéricos, estatísticas são null (célula vazia no CSV), bins são zero. Zero
documentado continua numérico, sem significar ausência biológica.
CSV `bin_01` a `bin_40` corresponde aos intervalos de largura 0,025, limite
inferior inclusivo, último intervalo incluindo 1. As cinco faixas não substituem
os 40 bins. Contagens oficiais, bins, faixas e estatísticas são validados antes
da entrega; não são reconstruídos de estimativas antigas.

## Inventário de superfícies preservadas

| Caminho | Formato | Condição nesta adoção |
| --- | --- | --- |
| `/api/results/aggregate-export` | CSV/JSON/XLSX | estatísticas 0.8 por campanha, leitura autorizada |
| `/api/results/capture-index` | CSV leitura/auditoria, JSON/views | notas 0.8 por campanha + SIA; ver `INDICE_CAPTACAO_0.8_POR_PONTO.md` |
| `modules/results/report-export.ts` | XLSX/PDF/HTML impressão | relatórios do catálogo de impactos e da bibliografia; não trazem notas do índice |
| `/api/imports/results/template` | XLSX fonte completa | planilha do laboratório como recebida, para arquivo; não é fonte de notas do índice |
| `/api/imports/results`, `/preview`, staging/preparação | entrada e publicação | ingestão da planilha do laboratório: organismos, leituras, literatura e situação dos conjuntos. As abas do índice anterior não são lidas, recalculadas, conferidas nem guardadas; a consulta não devolve notas de publicações antigas |
| modelos de Campo/SIA e exportação Biolog | XLSX | outros domínios, fora da adoção de índice |

A nota por campanha e ponto, os três estados e os perfis de risco estão em
`INDICE_CAPTACAO_0.8_POR_PONTO.md`. Sem novas permissões e sem mudança de banco, RLS ou nuvem.
