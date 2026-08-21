# Metodologia reproduzível para ranking, score e classificação integrados

## 0. Controle, finalidade e estado do documento

| Campo | Valor | Estado |
| --- | --- | --- |
| Ordem | `CRIAR-METODOLOGIA-REPRODUZIVEL-RANKING-SCORE-CLASSIFICACAO-2026-08-21` | [A] |
| Escopo | Campanha 1; triagem molecular 16S/COI; ranking por ponto/amostra | [A] |
| Data desta consolidação | 2026-08-21 | [A] |
| Repositório inspecionado | `G:\Aplicativos\Sanepar\web`, HEAD `2857ec8` | [A] |
| Autor funcional | E8 — Resultados Moleculares, Risco e Dashboard | [A] |
| Estado operacional | especificação auditável; não altera os scores legados | [A] |

Este documento tem dois objetivos que não devem ser confundidos:

1. **Reproduzir fielmente a Campanha 1 legada**: importar os valores já
   publicados de score, classe e posição, verificar sua integridade e preservar
   sua linhagem. Esta reprodução é possível hoje.
2. **Permitir um recálculo científico futuro**: definir entradas, etapas,
   fórmulas parametrizadas, testes e registros necessários. Esse recálculo não
   pode ser chamado de oficial enquanto as lacunas [C] e decisões [D] deste
   documento não forem fechadas e versionadas.

> **Regra de não fabricação:** nenhum peso, limite, táxon prioritário, fator de
> normalização, regra de imputação ou desempate ausente nas fontes foi
> preenchido por conveniência. Placeholders são deliberados e bloqueiam o uso
> oficial do modelo recalculado.

### 0.1 Legenda epistemológica vinculante

| Código | Significado | Pode alimentar resultado oficial? |
| --- | --- | --- |
| **[A] Comprovado/documentado** | Presente em arquivo local identificado ou diretamente verificável nos dados. “Comprovado” aqui prova a existência/configuração local; não substitui validação científica externa. | Sim, dentro do escopo documentado. |
| **[B] Reconstruído/inferido** | Obtido por reconciliação dos dados ou por inferência compatível com todas as observações, com trilha explícita. | Só para reprodução/diagnóstico, nunca como parâmetro oficial sem promoção documentada para [A]. |
| **[C] Ausente necessário** | Informação necessária que não existe nas fontes inspecionadas. | Não. |
| **[D] Decisão científica a formalizar internamente** | Escolha metodológica que deve ser deliberada, aprovada e versionada antes do uso. | Não, até formalização. |

## 1. Resultado central da auditoria

### 1.1 O que existe

- [A] A planilha consolidada recuperada contém **21.351** registros
  taxonômicos, **73** amostras/pontos ranqueados, **60** municípios, **71**
  mananciais/corpos hídricos e **1.824** rótulos taxonômicos distintos.
- [A] O período observado é de **2026-02-10 a 2026-03-13**.
- [A] Existem resultados para `16S/Cianobactérias`, `16S/Bactérias` e
  `COI/COI`.
- [A] A aba `Ranking_score_pontos` contém posição, três dimensões de risco,
  classe integrada, score integrado, métricas moleculares, confiança,
  justificativa e recomendações para os **73** pontos.
- [A] Os scores legados variam de **0,206 a 0,855**, com mediana **0,550**.
- [A] O ranking legado tem posições contíguas de **1 a 73** e scores em ordem
  não crescente.
- [A] Há **zero fórmulas Excel** nas cinco abas da planilha consolidada; scores,
  classes, posições e métricas são valores estáticos.
- [A] O aplicativo lê, normaliza e exibe esses valores; não há função de cálculo
  do score integrado em `src/lib/imports/results.ts`,
  `src/lib/laboratory-risk.ts` ou `src/lib/dashboard-data.ts`.

### 1.2 O que não existe

- [C] Fórmula executável do score legado.
- [C] Pesos numéricos dos componentes.
- [C] Funções de normalização e seus parâmetros.
- [C] Lista integral e versionada de cianobactérias “prioritárias” usada no
  score legado.
- [C] Lista integral e versionada de bactérias de atenção
  sanitária/operacional usada no score legado.
- [C] Lista integral e versionada de COI “invasores” usada no score legado.
- [C] Codificação numérica de risco ambiental, operacional e sanitário.
- [C] Codificação de turbidez, clima, descrição e demais metadados no score.
- [C] Critério formal de confiança.
- [C] Regra de desempate.
- [C] Limites oficiais inclusivos/exclusivos das classes e critério operacional
  de `Crítico`.

**Conclusão:** o score legado é reproduzível **como artefato importado e
verificado**, mas ainda não é reproduzível **como cálculo independente**.

## 2. Fontes e cadeia de evidência

### 2.1 Fontes primárias locais

| ID | Fonte | Conteúdo relevante | SHA-256 | Estado |
| --- | --- | --- | --- | --- |
| F1 | `G:\Aplicativos\Sanepar\backups\cloud-to-local-20260821T095355Z\cloud\documents\migrated\documents\resultados\7c11ea786d6c-resultados-finais-da-primeira-campanha.xlsx` | `Banco_consolidado`, `Resumo`, `Dicionario_variaveis`, `Ranking_score_pontos`, `Metodologia_score` | `f0a1b154ded817afd7079555737394a29f65a3a88bb10bf68a1a3b591203ddaf` | [A] |
| F2 | `G:\Aplicativos\Sanepar\dashboard_campanha1\build_data.py` | transformação do banco para o painel, listas auxiliares e regras de alertas | `71a31c0fa200c06f621d29830474fa7d13bb374d3096b9c4a0af6be7419ab036` | [A] |
| F3 | `G:\Aplicativos\Sanepar\dashboard_campanha1\data.json` | modelo analítico derivado: pontos, táxons, heatmaps, grupos COI e alertas | `9800c418622a86dc3404841c158478f6656b1622d2dd2488cac9e607d814b4a6` | [A] |
| F4 | `G:\Aplicativos\Sanepar\dashboard_campanha1\ranking.json` | recorte cru das 73 linhas do ranking para consumo do app | `083994f6fe5555206814133a7abfcbc579d8be6d146192170350b2ac9653625f` | [A] |
| F5 | [`public/dashboards/Painel_eDNA_Campanha1_Sanepar.html`](../../public/dashboards/Painel_eDNA_Campanha1_Sanepar.html) | dataset embarcado, disclaimers, método apresentado e auditoria do painel | `2cd8d409391f5abde4ddd5d93acf6179bc24afac23ef0a6efd895934b27db9c4` | [A] |
| F6 | [`src/lib/imports/results.ts`](../../src/lib/imports/results.ts) | contrato de importação e leitura de valores do ranking | `2b518d797139096cf5c267a36ce01b9ec4c2edb2328d92c49b022357abf8ba51` | [A] |
| F7 | [`src/lib/laboratory-risk.ts`](../../src/lib/laboratory-risk.ts) | normalização de rótulos, associação a pontos e ordenação de apresentação | `ba3670ad022cf6b2cb515f8c43b5e311b0f99a3366bc36d6833c4ab2c2fdb19c` | [A] |
| F8 | [`src/lib/dashboard-data.ts`](../../src/lib/dashboard-data.ts) | leitura do HTML/JSON e conversão para o contrato do dashboard | `52084538ee8cf8862732b9bf28e77ba5f190adaec6a100a9183b13a74132b311` | [A] |
| F9 | [`src/lib/__tests__/results-dashboard-contract.test.ts`](../../src/lib/__tests__/results-dashboard-contract.test.ts) | cardinalidades e disclaimers protegidos por teste | `6169995bd51f1c80fb17479787da3523bffea8ad313643e2ab7c5cf795ae134b` | [A] |

### 2.2 Fontes citadas, mas ausentes

- [C] F1 declara como antecedente
  `analise_risco_sanepar_campanha1_COI_percentual.xlsx`; esse arquivo não foi
  encontrado no projeto inspecionado.
- [C] F2 aponta para
  `D:\Dropbox\Sanepar_única\Resultados\Campanha 1\Sequenciamento 1\Campanha1_banco_consolidado.xlsx`;
  o caminho não pertence ao corpus local atual. A cópia recuperada F1 é a fonte
  material disponível.
- [C] Não foi localizada bibliografia técnica versionada para as associações de
  toxina, gosto/odor, invasão, patogenicidade, biofilme ou risco sanitário.

## 3. Escopo científico e disclaimers obrigatórios

1. **Reads não equivalem a abundância, biomassa, densidade celular ou
   concentração.** [A]
2. **Percentuais de reads são relativos ao marcador e à amostra.** Não comparar
   diretamente percentuais ou contagens de 16S e COI como grandezas biológicas
   equivalentes. [A]
3. **eDNA/metabarcoding não confirma viabilidade, infectividade, toxina,
   floração, impacto operacional ou conformidade legal.** [A]
4. Ausência de detecção não prova ausência real do organismo. [A]
5. Associação taxonômica com toxina, gosto/odor, incrustação, doença ou
   bioacumulação é hipótese de triagem até existir referência técnica e
   confirmação por método apropriado. [A/C]
6. O score é prioridade molecular relativa à Campanha 1, não probabilidade de
   risco nem “percentual de risco”. [A]

Toda saída analítica deve separar:

- `DADO_OBSERVADO`;
- `INTERPRETAÇÃO`;
- `INFERÊNCIA`;
- `LIMITAÇÃO`;
- `RECOMENDAÇÃO`.

Quando não houver suporte rastreável, usar `NÃO CONFIRMADO`.

## 4. Unidade, universo e chaves

### 4.1 Universo observado

| Elemento | Definição | Valor da Campanha 1 | Estado |
| --- | --- | --- | --- |
| Campanha | campanha ordinária de verão de 2026 | `1` | [A] |
| Unidade do ranking | uma amostra/ponto de coleta/SIA | 73 unidades | [A] |
| Unidade molecular | uma linha `amostra × marcador × conjunto × táxon` com sinal retido | 21.351 linhas | [A] |
| Cobertura 16S/Bactérias | amostras com pelo menos um registro | 73 | [A] |
| Cobertura 16S/Cianobactérias | amostras com pelo menos um registro | 72 | [A] |
| Cobertura COI | amostras com pelo menos um registro | 41 | [A] |
| Municípios | valores distintos do campo `Município` | 60 | [A] |
| Mananciais/corpos hídricos | valores distintos do campo homônimo | 71 | [A] |

### 4.2 Chaves atuais e chaves recomendadas

- [A] Em F1, `Identificação da amostra` é única no ranking e mapeia uma única
  combinação de SIA, município, manancial, data e metadados.
- [A] Os 73 pontos têm 73 códigos SIA distintos na cópia recuperada.
- [A] O identificador `44` não aparece; os IDs observados são `1–43` e
  `45–74`. Portanto, **não renumerar** amostras.
- [A] A chave molecular sem duplicidade no corpus é:

```text
(campanha=1, identificação_da_amostra, marcador, conjunto_analisado, espécie)
```

- [D] Para múltiplas campanhas, a chave canônica deve ser formalizada como:

```text
(campaign_id, sample_id, marker_id, taxon_id, pipeline_run_id)
```

- [D] `point_id`/`sia_id` deve ser chave estrangeira estável; nome do ponto,
  município e manancial são atributos descritivos e não devem ser usados
  isoladamente como chave.
- [C] `pipeline_run_id`, versão da referência taxonômica, lote, réplica,
  controle, biblioteca e versão do classificador não existem no esquema atual.

## 5. Esquema mínimo de fontes

### 5.1 Tabela molecular mínima

| Campo | Tipo/unidade | Regra | Estado atual |
| --- | --- | --- | --- |
| `campaign_id` | identificador | obrigatório; não reutilizar | [D] ausente como coluna explícita; campanha 1 conhecida [A] |
| `sample_id` | identificador | obrigatório; texto/inteiro preservado | `Identificação da amostra` [A] |
| `point_id` / `sia_id` | identificador | obrigatório quando aplicável | `Cód. SIA` [A] |
| `sample_date` | data ISO | obrigatório | `Data` [A] |
| `marker_id` | categoria | catálogo versionado | `16S`, `COI` [A] |
| `analyzed_set` | categoria | catálogo versionado | `Cianobactérias`, `Bactérias`, `COI` [A] |
| `taxon_label_raw` | texto | preservar exatamente a saída original | `Espécie` [A] |
| `taxon_id` | identificador taxonômico | referência e versão obrigatórias | [C] |
| `reads` | inteiro não negativo | contagem após pipeline/QC | `Número de Reads` [A] |
| `pct_reads_marker_sample` | percentual 0–100 | denominador amostra+marcador/conjunto | `% Reads` [A/B] |
| `detected/censored/qc_status` | categoria | distinguir zero, ND, censura e falha | [C/D] |
| `pipeline_run_id` | identificador | rastrear lote e versão | [C] |

### 5.2 Tabela de ranking mínima

Os 24 campos atuais de F1 são [A]:

```text
Posição; Amostra; Ponto de coleta; Manancial/corpo hídrico; Município;
Campanha/Data; Turbidez; Condição climática; Principais organismos;
Principais drivers de risco; Risco ambiental; Risco operacional;
Risco sanitário; Classificação integrada; Score integrado; Ciano reads;
Ciano prioritárias %; Bact. sanitárias reads; Bact. sanitárias %;
COI invasores reads; Justificativa técnica; Nível de confiança;
Recomendações; COI invasores % calculado
```

Para recálculo auditável, acrescentar [D]:

```text
score_version; taxonomy_catalog_version; parameter_set_version;
input_snapshot_sha256; component_<id>_raw; component_<id>_normalized;          # [D]
component_<id>_available; weight_<id>; weighted_contribution_<id>;            # [C/D]
missingness_policy; class_rule_version; tie_break_rule_version;
calculated_at_utc; calculation_software_version
```

Todos os campos dessa extensão são requisitos de esquema [D]; seus valores e
versões concretos permanecem [C/D] até a formalização do modelo.

## 6. Validação, limpeza e deduplicação

### 6.1 Validações obrigatórias de entrada

1. Verificar extensão `.xlsx` ou `.xlsm`. [A: contrato atual]
2. Exigir as abas `Banco_consolidado` e `Ranking_score_pontos`. [A]
3. Exigir, na ordem, as 18 primeiras colunas moleculares descritas em
   `RESULT_EXPECTED_HEADERS`. [A]
4. Exigir `Classificação integrada` na coluna N da aba de ranking. [A]
5. Preservar o valor bruto e criar coluna normalizada separada; nunca sobrescrever
   o dado original. [D]
6. Validar tipos, domínio, unidade, faixa, completude e unicidade antes de
   agregar. [D]
7. Calcular e registrar SHA-256 do arquivo de entrada. [D]

### 6.2 Normalizações permitidas

- [A] O importador atual remove espaços externos e normaliza apenas cabeçalhos
  para comparação (minúsculas, remoção de acentos e pontuação).
- [D] Datas devem ser armazenadas em ISO `YYYY-MM-DD`; identificadores não devem
  sofrer coerção que remova zeros significativos.
- [D] Sinônimos de turbidez e clima devem ser mapeados por tabela explícita,
  preservando `valor_bruto` e `valor_normalizado`.
- [C] Essa tabela de sinônimos não existe. Há, por exemplo, `Sol` e `sol`, além
  de variantes `Nublado Pós Chuva` e `Nublado Pós-chuva`.
- [D] Nomes taxonômicos não devem ser “corrigidos” silenciosamente. Toda
  atualização deve informar referência taxonômica, versão, regra e resultado.

### 6.3 Deduplicação

Chave de controle da Campanha 1:

```text
K = (sample_id, marker_id, analyzed_set, taxon_label_raw)
```

- [A] Foram encontrados **0** grupos duplicados por `K` e **0** linhas
  integralmente duplicadas.
- [D] Em dados futuros, duplicatas não devem ser somadas automaticamente. A
  rotina deve primeiro distinguir réplica técnica/biológica, reprocessamento,
  duplicação de importação e fragmentação legítima do resultado.
- [C] Não existem campos de réplica ou lote que permitam essa distinção hoje.

## 7. Reads e normalização por marcador/amostra

### 7.1 Grandezas observadas

Para amostra `i`, marcador/conjunto `m` e táxon `t`:

```text
r[i,m,t] = Número de Reads observado                                      [A]
T[i,m]   = Σ_t r[i,m,t]                                                   [A/B]
p[i,m,t] = 100 × r[i,m,t] / T[i,m], quando T[i,m] > 0                    [A para COI; B para 16S]
```

- [A] A aba `Metodologia_score` documenta explicitamente a fórmula para `% COI`.
- [B] Para 16S/Cianobactérias e 16S/Bactérias, a mesma fórmula foi reconstruída
  porque os percentuais somam 100% por amostra/conjunto dentro de erro de ponto
  flutuante.
- [A] As somas percentuais ficam entre `99,9999999998934` e
  `100,00000000011` nos três conjuntos; isso é compatível com 100% e erro
  numérico, não com diferença biológica.
- [A] Totais de reads da Campanha 1:
  `Cianobactérias=102.652`, `Bactérias=1.224.700`, `COI=51.964`, total
  `1.379.316`.
- [A] Profundidades de marcadores diferentes não são diretamente comparáveis.

### 7.2 Normalização para subescores

Não há função de normalização documentada no score legado. Portanto:

```text
N_reads_m(x; parâmetros_m) = PLACEHOLDER_NORMALIZAÇÃO_READS_M             [C/D]
N_pct_m(x; parâmetros_m)   = PLACEHOLDER_NORMALIZAÇÃO_PERCENTUAL_M        [C/D]
```

Decisões pendentes [D]:

- usar transformação logarítmica, quantis robustos, máximo fixo ou referência
  externa para reads;
- calibrar dentro de campanha ou em referência histórica multicampanha;
- tratar profundidade de biblioteca, rarefação, composicionalidade e lote;
- limitar influência de outliers;
- impedir que ausência de COI reduza artificialmente o score.

Nenhuma dessas escolhas pode ser aplicada à Campanha 1 retroativamente sem criar
uma **nova versão** de score.

## 8. Catálogos e categorias taxonômicas

### 8.1 Regras gerais de inclusão, exclusão e versionamento

Cada catálogo deve conter no mínimo [D]:

```text
catalog_id; catalog_version; taxon_id; taxon_label; rank; accepted_name;
synonyms; category_id; inclusion_basis; evidence_reference; evidence_date;
marker_scope; include/exclude; reviewer; approved_at; valid_from; valid_to
```

Regras [D]:

1. inclusão só por entrada explícita e versionada;
2. exclusão explícita prevalece e registra justificativa;
3. correspondência por `taxon_id` é preferível à correspondência textual;
4. fallback por gênero só pode ocorrer quando o catálogo o declarar;
5. `sp.`, `cf.`, `aff.` e identificação acima de espécie mantêm incerteza;
6. mudanças de catálogo criam nova versão e não reescrevem resultados legados;
7. toda associação científica exige referência técnica identificável;
8. sem referência, a categoria é `NÃO CONFIRMADO` para interpretação de risco.

### 8.2 Listas auxiliares integrais disponíveis no gerador do dashboard

F2 extrai o primeiro token do rótulo taxonômico como gênero e faz igualdade
exata contra os dicionários abaixo. A **existência/configuração local** é [A]; a
**validade científica das associações**, sem bibliografia versionada, é [C].

#### Potencial associado a cianotoxinas (`TOX`) — configuração literal [A/C]

| Gênero configurado | Rótulo operacional local | Estado científico |
| --- | --- | --- |
| `Microcystis` | microcistina | [C] referência ausente |
| `Raphidiopsis` | cilindrospermopsina/saxitoxina | [C] |
| `Cylindrospermopsis` | cilindrospermopsina | [C] |
| `Dolichospermum` | anatoxina/microcistina | [C] |
| `Anabaena` | anatoxina/microcistina | [C] |
| `Cuspidothrix` | anatoxina-a | [C] |
| `Aphanizomenon` | saxitoxina/cilindrospermopsina | [C] |
| `Planktothrix` | microcistina | [C] |
| `Nostoc` | microcistina | [C] |
| `Nodularia` | nodularina | [C] |

Táxons observados selecionados por essa lista em F3 [A]:
`Cuspidothrix issatschenkoi`, `Dolichospermum brachiatum`,
`Raphidiopsis raciborskii`, `Microcystis aeruginosa`, `Aphanizomenon sp.` e
`Planktothrix agardhii`.

#### Potencial de gosto/odor (`ODOR`) — configuração literal [A/C]

| Gênero configurado | Rótulo operacional local | Estado científico |
| --- | --- | --- |
| `Odorella` | geosmina | [C] referência ausente |
| `Pseudanabaena` | 2-MIB/geosmina | [C] |
| `Phormidium` | geosmina/2-MIB | [C] |
| `Oscillatoria` | geosmina/2-MIB | [C] |
| `Anabaena` | geosmina | [C] |
| `Dolichospermum` | geosmina | [C] |
| `Lyngbya` | geosmina/2-MIB | [C] |
| `Aphanizomenon` | geosmina | [C] |

Táxons observados selecionados por essa lista em F3 [A]:
`Dolichospermum brachiatum`, `Pseudanabaena galeata`, `Odorella benthonica`,
`Oscillatoria kawamurae`, `Aphanizomenon sp.`, `Pseudanabaena catenata` e
`Phormidium irriguum`.

#### Exóticos/invasores auxiliares (`INV`) — configuração literal [A/C]

| Gênero configurado | Rótulo operacional local | Estado científico |
| --- | --- | --- |
| `Corbicula` | molusco invasor (incrustação/entupimento) | [C] referência ausente |
| `Craspedacusta` | cnidário invasor (água doce) | [C] |
| `Limnoperna` | mexilhão-dourado (incrustação severa) | [C] |
| `Dreissena` | mexilhão-zebra (incrustação) | [C] |

Táxons observados selecionados por essa lista em F3 [A]:
`Corbicula fluminea`, `Craspedacusta sowerbii` e `Corbicula leana`.

> **Não equivalência comprovada [A]:** a lista `INV` do dashboard não é igual à
> lista usada para `COI invasores reads` no ranking legado: há divergência em
> **9 de 73** pontos. Portanto, `INV` não pode ser usada para recalcular o score
> legado.

#### Agrupamento COI integral (`COI_GROUP`) — configuração literal [A]

| Grupo | Gêneros configurados |
| --- | --- |
| Copépodes | `Eucyclops`, `Thermocyclops`, `Mesocyclops`, `Acanthocyclops` |
| Cladóceros | `Bosmina`, `Daphnia`, `Simocephalus`, `Ceriodaphnia`, `Moina` |
| Moluscos (bivalves) | `Pisidium`, `Corbicula`, `Sphaerium`, `Eupera` |
| Oomicetos | `Pythium`, `Phytophthora`, `Phytopythium`, `Globisporangium`, `Pythiogeton`, `Protoachlya`, `Achlya`, `Saprolegnia` |
| Rotíferos | `Trichocerca`, `Lecane`, `Keratella`, `Brachionus`, `Polyarthra`, `Cephalodella` |
| Gastrótricos | `Chaetonotus`, `Ichthydium` |
| Anelídeos | `Dero`, `Pristina`, `Dasybranchus`, `Nais` |
| Platelmintos | `Stenostomum` |
| Insetos (dípteros) | `Chironomus`, `Polypedilum`, `Rheotanytarsus`, `Zavrelimyia`, `Parachironomus`, `Tanytarsus`, `Cricotopus` |
| Insetos (outros) | `Smicridea`, `Labiobaetis`, `Limoniscus`, `Aridaeus`, `Hippelates`, `Simulium` |
| Cnidários | `Craspedacusta` |
| Outros eucariotos | fallback para qualquer gênero não listado |

O dataset F3 mantém a tabela completa dos **173** táxons COI observados em
`coi_all`; F1 mantém a lista integral dos **1.824** rótulos observados no corpus.
Essas listas observacionais não são, por si, catálogos de risco.

### 8.3 Listas do score legado que permanecem ausentes

- [C] `LISTA_CIANO_PRIORITARIAS_SCORE`: a aba metodológica cita como exemplos
  `Microcystis`, `Raphidiopsis`, `Dolichospermum`, `Cuspidothrix`, `Anathece` e
  `Cyanobium`, mas usa “e outros táxons relevantes”; portanto a lista não é
  integral.
- [C] `LISTA_BACTERIAS_ATENCAO_SCORE`: não localizada. O painel cita apenas
  exemplos como `Prevotella` e `Pseudarcobacter`.
- [C] `LISTA_COI_INVASORES_SCORE`: não localizada e não coincide com `INV`.
- [C] critérios de inclusão/exclusão, referências, versão e data de vigência
  dessas três listas.

## 9. Variáveis ambientais, operacionais e sanitárias

### 9.1 Metadados disponíveis e proveniência

F1 documenta os metadados como importados da planilha-síntese da Campanha 1 [A]:

| Variável | Forma atual | Proveniência/observação | Uso no score |
| --- | --- | --- | --- |
| Data | data | planilha-síntese | [C] codificação ausente |
| Manancial/corpo hídrico | texto | planilha-síntese | [C] |
| Município | texto | planilha-síntese | contexto; peso não documentado [C] |
| Latitude/longitude original | decimal | separada de campo composto | contexto espacial; peso não documentado [C] |
| Latitude/longitude efetiva | decimal | separada de campo composto | contexto espacial; peso não documentado [C] |
| Acessibilidade do ponto | texto | planilha-síntese | [C] |
| Turbidez | categoria: baixa/média/alta | planilha-síntese; sem valor/unidade quantitativa | metodologia afirma uso [A], codificação/peso [C] |
| Descrição | texto livre | planilha-síntese | metodologia afirma uso quando disponível [A], extração/peso [C] |
| Condição climática | 16 grafias observadas | planilha-síntese; sem ontologia | metodologia afirma uso [A], codificação/peso [C] |

### 9.2 Variáveis ausentes necessárias para validação contextual

| Domínio | Variáveis/lacunas | Estado |
| --- | --- | --- |
| Físico-químico | turbidez quantitativa e série temporal, cor, pH, nutrientes | [C] |
| Potabilidade/sanitário | coliformes, `E. coli`, métodos confirmatórios, limites normativos | [C] |
| Cianobactérias | microscopia/contagem, clorofila-a, ficocianina | [C] |
| Toxinas/odor | microcistina, cilindrospermopsina, saxitoxina, anatoxina, geosmina, 2-MIB | [C] |
| Operação ETA | carreira/lavagem de filtros, coagulante, vazão, reclamações de gosto/odor | [C] |
| Sequenciamento/QC | profundidade bruta, reads pós-filtro, brancos, positivos, lote, réplica, LOD/LOQ, banco de referência | [C] |

Nenhuma variável ausente deve ser imputada como zero.

## 10. Censura, zero, não detectado e ausentes

### 10.1 Estado observado da Campanha 1

- [A] F1 retém linhas em que `Número de Reads` **ou** `% Reads` era diferente de
  zero absoluto.
- [A] Nas 21.351 linhas atuais, todos os reads e percentuais são positivos.
- [B] A tabela é esparsa: a ausência de uma linha representa “sem registro
  retido”, mas não permite distinguir não detecção, filtragem, falha de QC ou
  ausência de ensaio.
- [A] 72/73 amostras têm Cianobactérias; 73/73 têm Bactérias; 41/73 têm COI.
- [A] `COI invasores % calculado` está ausente em 32/73 pontos, exatamente o
  número de amostras sem cobertura COI no banco.
- [A] O dicionário afirma que `% Reads` de COI fica em branco, porém os 546
  registros COI de F1 têm percentuais preenchidos e somam 100% por amostra. O
  dicionário está desatualizado.

### 10.2 Política parametrizada para nova versão

| Situação | Valor molecular | Flag | Tratamento no score | Estado |
| --- | --- | --- | --- | --- |
| ensaio válido, denominador > 0, táxon não retido | `0` somente se a regra de retenção/QC provar ausência acima do limite | `ND` | regra a formalizar | [D] |
| ensaio não realizado ou falhou | `null` | `NA/QC_FAIL` | nunca converter em zero | [D] |
| abaixo de limite conhecido | valor/intervalo censurado | `LT_LOD` ou `LT_LOQ` | método específico a formalizar | [D] |
| denominador do marcador = 0 | percentual `null` | `NO_DENOMINATOR` | não calcular percentual | [D] |
| metadado ausente | `null` | `MISSING_METADATA` | regra de disponibilidade a formalizar | [D] |

Placeholders necessários:

```text
LOD_MARKER_<m>                  [C/D]
LOQ_MARKER_<m>                  [C/D]
MIN_READS_SAMPLE_<m>            [C/D]
MIN_READS_TAXON_<m>             [C/D]
QC_ACCEPTANCE_RULE_<m>          [C/D]
MISSING_COMPONENT_POLICY        [D]
```

## 11. Subescores, direção, escalas, fórmulas e pesos

### 11.1 Score legado — regra reproduzível vigente

```text
score_legacy_c1(i) = valor estático de “Score integrado” em F1/F4           [A]
class_legacy_c1(i) = valor estático de “Classificação integrada” em F1/F4   [A]
rank_legacy_c1(i)  = valor estático de “Posição” em F1/F4                   [A]
```

Esta é a única reprodução exata autorizada pelas evidências atuais.

### 11.2 Componentes declarados, mas não parametrizados

A aba `Metodologia_score` afirma que o score combina os elementos abaixo [A],
mas não fornece cálculo [C]:

| ID proposto | Componente declarado | Direção alegada | Escala atual | Peso |
| --- | --- | --- | --- | --- |
| `C_ENV_RISK` | risco ambiental | maior rótulo → maior prioridade [B] | rótulos `Baixo` a `Alto` [A]; codificação [C] | `W_ENV_RISK` [C/D] |
| `C_OP_RISK` | risco operacional | maior rótulo → maior prioridade [B] | rótulos [A]; codificação [C] | `W_OP_RISK` [C/D] |
| `C_SAN_RISK` | risco sanitário | maior rótulo → maior prioridade [B] | rótulos [A]; codificação [C] | `W_SAN_RISK` [C/D] |
| `C_CIANO_READS` | intensidade molecular ciano | maior → maior prioridade [A] | reads [A]; normalização [C] | `W_CIANO_READS` [C/D] |
| `C_CIANO_PRIORITY_PCT` | fração de ciano prioritária | maior → maior prioridade [A] | 0–100% [A]; lista [C] | `W_CIANO_PCT` [C/D] |
| `C_BACT_ATTENTION_READS` | reads bacterianos de atenção | maior → maior prioridade [A] | reads [A]; lista/normalização [C] | `W_BACT_READS` [C/D] |
| `C_BACT_ATTENTION_PCT` | fração bacteriana de atenção | maior → maior prioridade [A] | 0–100% [A]; lista [C] | `W_BACT_PCT` [C/D] |
| `C_COI_INV_READS` | reads COI invasores | maior → maior prioridade [A] | reads [A]; lista/normalização [C] | `W_COI_READS` [C/D] |
| `C_COI_INV_PCT` | fração COI invasora | maior → maior prioridade [A] | 0–100% quando COI existe [A] | `W_COI_PCT` [C/D] |
| `C_TURBIDITY` | turbidez | direção não documentada [C] | categórica [A] | `W_TURBIDITY` [C/D] |
| `C_CLIMATE` | condição climática | direção não documentada [C] | texto/categoria [A] | `W_CLIMATE` [C/D] |
| `C_DESCRIPTION` | descrição da amostra | direção/extrator não documentados [C] | texto livre [A] | `W_DESCRIPTION` [C/D] |
| `C_INFERENCE_QUALITY` | qualidade da inferência/confiança | direção e cálculo não documentados [C] | `Moderado`/`Baixo a moderado` [A] | `W_CONFIDENCE` [C/D] |

### 11.3 Fórmula auditável parametrizada para uma futura versão

A fórmula abaixo é **um contrato de implementação [D]**, não reconstrução do
score legado:

```text
x[i,k] = valor bruto do componente k
a[i,k] = 1 se o componente k está disponível e aprovado por QC; 0 caso contrário
z[i,k] = N_k(x[i,k]; PARAMS_N_k)                    # 0 ≤ z ≤ 1

numerador[i]   = Σ_k a[i,k] × W_k × z[i,k]
denominador[i] = Σ_k a[i,k] × W_k

score_candidate[i] = CLIP(
    TRANSFORM_FINAL(numerador[i] / denominador[i]; PARAMS_FINAL),
    0,
    1
)
```

Parâmetros obrigatórios e ainda não preenchidos:

| Parâmetro | Restrição | Estado |
| --- | --- | --- |
| `COMPONENT_SET_VERSION` | conjunto fechado de componentes | [C/D] |
| `W_k` para cada componente | `W_k ≥ 0`; ao menos um positivo; soma/escala documentada | [C/D] |
| `N_k` e `PARAMS_N_k` | monotonicidade, limites e referência explicitados | [C/D] |
| `MISSING_COMPONENT_POLICY` | renormalizar, penalizar ou bloquear; nunca implícito | [D] |
| `TRANSFORM_FINAL` | identidade ou transformação calibrada | [D] |
| `PARAMS_FINAL` | todos os parâmetros da transformação | [C/D] |
| `MIN_COMPONENT_COVERAGE` | cobertura mínima para emitir score | [C/D] |
| `CONFIDENCE_RULE` | regra independente do próprio score | [C/D] |

### 11.4 Restrições de implementação

- Não misturar reads brutos de marcadores distintos sem normalização específica.
- Não usar ausência de COI como evidência de ausência do organismo.
- Não duplicar informação: risco categórico derivado dos mesmos sinais não deve
  ser somado novamente sem análise de dupla contagem. [D]
- Não ajustar pesos para reproduzir visualmente o ranking legado sem protocolo
  de calibração e validação; isso seria sobreajuste. [D]
- Registrar contribuição por componente para cada ponto.
- Se qualquer `W_k`, `N_k`, lista ou limite estiver sem estado [A] numa versão
  candidata, o cálculo deve falhar fechado.

## 12. Limites, classificação e desempate

### 12.1 Distribuição legada comprovada

| Classe | n | Score mínimo observado | Score máximo observado | Estado |
| --- | ---: | ---: | ---: | --- |
| Baixo | 1 | 0,206 | 0,206 | [A] |
| Baixo a moderado | 22 | 0,332 | 0,498 | [A] |
| Moderado | 45 | 0,503 | 0,685 | [A] |
| Alto | 5 | 0,707 | 0,855 | [A] |
| Crítico | 0 | — | — | rótulo documentado; ativação ausente [A/C] |

### 12.2 Limites inferidos, não oficiais

As 73 observações são compatíveis com [B]:

```text
Baixo              se score < 0,30
Baixo a moderado   se 0,30 ≤ score < 0,50
Moderado           se 0,50 ≤ score < 0,70
Alto               se score ≥ 0,70
```

Esses cortes são apenas reconstrução plausível: não há observações exatamente
nos limites nem regra executável. Os limites oficiais continuam:

```text
THRESHOLD_LOW_TO_LOW_MODERATE       [C/D]
THRESHOLD_LOW_MODERATE_TO_MODERATE  [C/D]
THRESHOLD_MODERATE_TO_HIGH          [C/D]
THRESHOLD_HIGH_TO_CRITICAL          [C/D]
BOUNDARY_INCLUSIVITY_RULE           [C/D]
CRITICAL_CONFIRMATION_RULE          [C/D]
```

### 12.3 Ranking e desempate

- [A] O ranking legado está ordenado por score não crescente e usa a posição
  armazenada como autoridade.
- [A] Existem sete grupos de empate no score exibido a três casas:
  `0,650`, `0,598`, `0,510`, `0,492`, `0,491`, `0,456` e `0,424`.
- [C] Não há regra documentada que explique a ordem interna desses empates.
- [D] Uma nova versão deve formalizar, antes do cálculo:

```text
TIE_BREAK_1 = PLACEHOLDER                 # [C/D]
TIE_BREAK_2 = PLACEHOLDER                 # [C/D]
TIE_BREAK_3 = PLACEHOLDER                 # [C/D]
FINAL_STABLE_KEY = (campaign_id, sample_id) # [D]
```

Até lá, não reordenar empates legados; preservar `Posição` de F1/F4.

## 13. Regras auxiliares do dashboard que não pertencem ao score

F2 contém regras reproduzíveis de **apresentação/alerta**, não de cálculo do
score integrado:

| Regra | Valor | Estado |
| --- | --- | --- |
| top táxons por reads | 15 por conjunto | [A] |
| top táxons por frequência | 12 por conjunto | [A] |
| drill-down por ponto/marcador | 8 táxons | [A] |
| heatmap | 16 táxons × até 28 pontos de maior score | [A] |
| tag `tox` | reads em táxon da lista `TOX` > 0 | [A] |
| tag `odor` | reads em táxon da lista `ODOR` > 0 | [A] |
| tag `inv` | reads em táxon da lista `INV` > 0 | [A] |
| tag `mix` | pelo menos 2 das tags anteriores | [A] |
| alerta | classe Alto; ou sinal misto; ou `tox_reads ≥ 500`; ou `inv_reads > 0` | [A] |

Na Campanha 1, F3 contém 39 alertas [A]. O limiar `500` é configuração de
alerta [A], **não** parâmetro comprovado do score e **não** limite biológico.

## 14. Sensibilidade, calibração e validação

### 14.1 Antes de calibrar

Pré-condições [D]: fechar catálogos, componentes, normalizações, pesos, política
de ausentes, limites, regra de confiança, endpoint confirmatório e protocolo de
amostragem. Sem isso, não há modelo a validar.

### 14.2 Calibração

Plano parametrizado [D]:

1. congelar conjunto de desenvolvimento e conjunto de validação por campanha;
2. evitar vazamento do mesmo ponto/data entre conjuntos;
3. escolher endpoint independente (por exemplo, medição confirmatória), nunca a
   classe legada como única “verdade”;
4. estimar parâmetros apenas no desenvolvimento;
5. registrar espaço de busca e critério de seleção;
6. avaliar no conjunto de validação sem reajuste;
7. publicar incerteza e cobertura, não só ordem.

Placeholders:

```text
CALIBRATION_TARGET                [C/D]
DEVELOPMENT_CAMPAIGNS             [C/D]
VALIDATION_CAMPAIGNS              [C/D]
CALIBRATION_LOSS                  [C/D]
ACCEPTANCE_METRICS                [C/D]
ACCEPTANCE_LIMITS                 [C/D]
```

### 14.3 Análises de sensibilidade mínimas

Para cada conjunto formalizado de parâmetros [D]:

- leave-one-component-out;
- variação de cada peso no intervalo pré-especificado;
- variação dos limites de classe;
- cenários de dados ausentes por marcador;
- normalização alternativa pré-registrada;
- bootstrap por ponto/campanha quando a estrutura amostral permitir;
- estabilidade de top-N e correlação de postos;
- matriz de transição de classes;
- análise de influência/outliers;
- análise explícita de dupla contagem entre subescores e riscos categóricos.

Todos os intervalos, `N`, sementes e limites de aceitação são [C/D] até serem
preenchidos em um plano versionado.

### 14.4 Validações da Campanha 1 já executáveis

| Validação | Resultado | Estado |
| --- | --- | --- |
| cardinalidade molecular | 21.351 linhas | [A] |
| pontos do ranking | 73 | [A] |
| posições contíguas | PASS | [A] |
| scores não crescentes | PASS | [A] |
| duplicata `amostra×marcador×conjunto×táxon` | 0 | [A] |
| duplicata integral | 0 | [A] |
| reads ≤ 0 em linhas retidas | 0 | [A] |
| soma de `% reads` por amostra/conjunto | 100% dentro de erro numérico | [A/B] |
| consistência de metadados dentro da amostra | 0 conflitos nos 12 campos verificados | [A] |
| fórmulas Excel | 0 | [A] |
| score calculável a partir das fontes | FAIL — fórmula/pesos ausentes | [C] |

## 15. Auditoria, versionamento e reprodutibilidade

### 15.1 Manifesto obrigatório de cada execução futura

```yaml
run_id: <UUID>                                      # [D]
run_timestamp_utc: <ISO-8601>                       # [D]
campaign_id: <ID>                                   # [D]
input_files:
  - path: <path>                                    # [D]
    sha256: <hash>                                  # [D]
software:
  repository_commit: <git-sha>                     # [D]
  runtime: <version>                                # [D]
  calculation_module: <path@sha256>                # [D]
catalogs:
  taxonomy_reference: <id@version>                  # [C/D]
  ciano_priority: <id@version>                      # [C/D]
  bacteria_attention: <id@version>                  # [C/D]
  coi_invasive: <id@version>                        # [C/D]
parameters:
  component_set: <version>                          # [C/D]
  normalization_set: <version>                      # [C/D]
  weight_set: <version>                             # [C/D]
  class_rule: <version>                             # [C/D]
  missingness_rule: <version>                       # [C/D]
outputs:
  row_count: <integer>                              # [D]
  score_sha256: <hash>                              # [D]
  audit_log_sha256: <hash>                          # [D]
```

### 15.2 Versionamento semântico

- mudança apenas editorial: `PATCH` [D];
- mudança de lista, peso, normalização, limite, política de ausentes ou fórmula:
  `MAJOR` [D];
- inclusão retrocompatível de metadado/auditoria sem alterar resultados:
  `MINOR` [D].

O resultado deve carregar `score_version`; resultados de versões diferentes não
devem ser mesclados numa série sem rótulo explícito.

### 15.3 Artefatos mínimos

1. snapshot imutável dos dados brutos;
2. tabela processada;
3. catálogos versionados;
4. parâmetros em formato legível por máquina;
5. contribuições por componente;
6. ranking e classes;
7. relatório de validação;
8. ambiente/runtime bloqueado;
9. hashes de entrada e saída;
10. changelog e decisão científica.

## 16. Pseudocódigo reproduzível

```text
INPUT:
  workbook
  catalog_bundle_version             # [C/D]
  parameter_bundle_version           # [C/D]

1. hash(workbook) -> input_sha256
2. require sheets Banco_consolidado and Ranking_score_pontos              [A]
3. validate required columns and types                                    [A/D]
4. preserve raw values; create normalized copies                          [D]
5. assert unique molecular key or classify every collision                [D]
6. validate reads >= 0 and QC flags                                        [D]
7. for each sample and marker:
     T = sum(reads)
     if T > 0:
       pct = 100 * reads / T
     else:
       pct = null; flag NO_DENOMINATOR                                    [D]
8. join taxon catalogs by taxon_id; textual fallback only if catalog allows [D]
9. aggregate raw molecular components and preserve denominators            [D]
10. attach environmental/operational/sanitary metadata with provenance     [D]
11. evaluate QC and missingness; never coerce NA/QC_FAIL to zero            [D]
12. if mode == LEGACY_C1:
      score = imported Score integrado                                    [A]
      class = imported Classificação integrada                            [A]
      rank  = imported Posição                                             [A]
    else:
      require all catalogs and parameters resolved as approved [A]
      normalize each component with its versioned N_k                      [D]
      calculate candidate score and component contributions                [D]
      classify with versioned thresholds                                   [D]
      rank by score and versioned tie-break                                [D]
13. emit row-level audit, validation report, manifest and hashes            [D]
14. fail closed on unresolved parameter, unknown catalog version, invalid
    denominator, duplicate unexplained or insufficient component coverage  [D]
```

## 17. Exemplo numérico auditável, sem score fictício

### Amostra 71 — 116 - Captação ETA Iraí

| Elemento | Valor | Estado |
| --- | ---: | --- |
| posição legada | 1 | [A] |
| score integrado legado | 0,855 | [A] |
| classe integrada legada | Alto | [A] |
| risco ambiental | Alto | [A] |
| risco operacional | Moderado | [A] |
| risco sanitário | Alto | [A] |
| ciano reads | 1.766 | [A] |
| ciano prioritárias | 72,197% | [A] |
| bactérias de atenção | 1.453 reads | [A] |
| bactérias de atenção | 13,591% | [A] |
| COI invasores | 0 reads | [A] |
| COI invasores | 0,0% | [A] |
| confiança | Moderado | [A] |

Reprodução permitida:

```text
score_legacy_c1(amostra=71) = 0,855
class_legacy_c1(amostra=71) = Alto
rank_legacy_c1(amostra=71)  = 1
```

Reprodução **não** permitida:

```text
0,855 = combinação_de_componentes(...)  # NÃO CONFIRMADO; fórmula e pesos [C]
```

Mesmo com valores moleculares observados, não é possível decompor `0,855` em
contribuições sem inventar parâmetros. Este exemplo é deliberadamente
parametrizado e não cria um “score oficial” fictício.

## 18. Checklist operacional para fechamento das lacunas

Uma nova versão calculável só pode ser promovida quando todos os itens forem
`PASS`:

- [ ] catálogos integrais de ciano, bactérias e COI com referências e versões;
- [ ] definição de cada componente e prevenção de dupla contagem;
- [ ] normalização por componente e marcador;
- [ ] pesos e justificativa;
- [ ] política de zero/ND/censura/ausentes/QC;
- [ ] codificação de metadados ambientais e operacionais;
- [ ] regra de confiança;
- [ ] limites e inclusividade de classes;
- [ ] critério `Crítico`;
- [ ] desempate determinístico;
- [ ] alvo de calibração independente;
- [ ] plano de validação e limites de aceitação;
- [ ] conjunto de parâmetros legível por máquina;
- [ ] implementação que emita contribuições e manifesto;
- [ ] revisão científica das associações taxonômicas;
- [ ] teste de regressão do modo `LEGACY_C1`.

## 19. Tabela final de lacunas

| Campo/lacuna | Impacto | Evidência atual | Insumo necessário | Ação interna | Estado |
| --- | --- | --- | --- | --- | --- |
| fórmula do score legado | impede recálculo independente | F1 tem valores e 0 fórmulas; app só importa | código/planilha original ou especificação assinada | localizar fonte original; congelar legado | [C] |
| pesos | impede contribuição e auditoria causal | apenas declaração genérica na metodologia | tabela de pesos + justificativa | decisão científica e versionamento | [C/D] |
| normalização | reads não comparáveis e outliers sem tratamento | nenhum parâmetro localizado | funções e referências por marcador | pré-registrar e validar | [C/D] |
| lista ciano prioritária | percentual não recalculável | exemplos não integrais | catálogo completo e referências | formalizar catálogo | [C/D] |
| lista bacteriana de atenção | reads/% não recalculáveis | apenas exemplos no painel | catálogo completo e referências | formalizar catálogo | [C/D] |
| lista COI do score | métrica diverge do `INV` auxiliar em 9/73 pontos | F1 versus F2/F3 | catálogo exato usado no ranking | recuperar/definir versão | [C/D] |
| associações toxina/odor/invasão | risco de extrapolação científica | rótulos em código, sem bibliografia | referências técnicas versionadas | revisão científica | [C] |
| limites de classe | fronteiras não reproduzíveis | faixas observadas; cortes 0,30/0,50/0,70 apenas [B] | regra inclusiva oficial | formalizar | [C/D] |
| classe Crítico | classe não operacionalizável | texto “só com confirmação”, 0 casos | confirmação exigida e limite/regra | formalizar | [C/D] |
| desempate | 7 grupos sem regra | posições estáticas | critérios determinísticos | formalizar | [C/D] |
| confiança | não pode ser recalculada | 50 `Moderado`, 23 `Baixo a moderado` | fórmula e entradas | formalizar separada do score | [C/D] |
| turbidez | efeito no score desconhecido | 3 categorias, sem unidade quantitativa | valor, unidade, tempo e codificação | integrar série e definir regra | [C/D] |
| clima | inconsistência textual e efeito desconhecido | 16 grafias | ontologia e codificação | normalizar com trilha | [C/D] |
| descrição livre | extração e peso desconhecidos | texto disponível | protocolo de codificação | definir ou excluir explicitamente | [C/D] |
| dados operacionais ETA | elo molecular-operacional não validado | ausentes | séries de filtros, coagulante, vazão etc. | integrar por tempo/ponto | [C] |
| confirmação sanitária | sinal não pode virar diagnóstico | ausente | métodos normativos/qPCR-alvo | integrar e validar | [C] |
| toxinas e gosto/odor | associação não confirma composto | ausente | cianotoxinas, geosmina, 2-MIB | medir e correlacionar | [C] |
| QC de sequenciamento | zero/ND/falha não distinguíveis | lote, controles e LOD/LOQ ausentes | métricas de pipeline e controles | ampliar esquema | [C/D] |
| COI ausente em 32 amostras | risco de falso zero | 41/73 com COI | status de ensaio/QC por amostra | distinguir NA de ND | [C/D] |
| dicionário COI desatualizado | ambiguidade de proveniência | dicionário diz vazio, dados têm % | atualização versionada | corrigir em nova fonte, preservar original | [A/C] |
| contagem “74 amostras com metadados” no Resumo | conflito com 73 amostras no banco/ranking | F1 `Resumo` versus dados | registro da amostra 44 ou justificativa de exclusão | reconciliar sem renumerar | [A/C] |
| versão taxonômica | nomes/sinônimos não rastreáveis | só rótulo textual | banco e versão | criar `taxon_id` e catálogo | [C/D] |
| calibração/validação | score sem desempenho mensurável | não localizada | endpoint, campanhas e métricas | pré-registrar plano | [C/D] |

## 20. Critério de aceite deste documento

Este documento está completo para integração quando:

1. cada valor e regra existente está ligado a uma fonte [A] ou trilha [B];
2. cada informação necessária ausente está marcada [C];
3. cada escolha científica futura está marcada [D];
4. nenhuma lacuna recebeu valor fictício;
5. o modo legado pode ser reproduzido por importação e verificação;
6. o modo recalculado falha fechado até o fechamento dos placeholders.

Nesse estado, o ranking da Campanha 1 permanece utilizável como **prioridade
molecular relativa legada**, com limitações explícitas, enquanto a futura
metodologia calculável ganha um caminho auditável de formalização.
