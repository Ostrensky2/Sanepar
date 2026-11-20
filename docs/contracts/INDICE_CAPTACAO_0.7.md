# Índice de triagem de risco da biota na captação — IR-CAPTACAO-0.7-piloto

Registro das decisões tomadas com o administrador em 19 e 20/11/2026. Situação: **piloto em homologação**. Os pesos das fichas curadas foram aprovados pelo administrador em 20/11; os demais vêm do catálogo 0.3. O índice ordena atenção entre pontos. Não é probabilidade de dano, não é risco da água tratada e ainda não foi validado contra ocorrências reais.

## Decisões do administrador em 20/11 que prevalecem sobre o restante deste documento

1. **Iraí e Passaúna precisam ficar no topo ou perto dele**, porque os relatos de problema são recorrentes. A aplicabilidade de Microcystis fica em 0,5. Resultado: Iraí reservatório (SIA 78) 5º, 6º e 7º; Iraí captação (780) 7º, 5º e 9º; Passaúna captação (559) 13º, 7º e 5º, nas três campanhas. A ETA Passaúna (760) não sobe: o problema dela é o mosquito-fantasma, que os marcadores não enxergam.
2. **Diatomáceas entram na nota desde que haja resultado delas** (decisão final de 20/11, 13:17, que substitui a retirada feita minutos antes). Não há marcador próprio: o resultado disponível é a leitura do cloroplasto no 16S, com classificação exploratória (PR2) feita fora do pipeline do laboratório. Pontua só o que essa leitura atribui a diatomáceas e passa da base da rede (2,1% do 16S): 23 observações. Gravidade 3 e base aprovadas. Onde o cloroplasto não foi classificado, o índice não enxerga diatomáceas.
3. **Todo organismo marinho é retirado do COI**, das observações e do denominador. A varredura cobriu os 389 táxons do COI em todos os níveis e retirou 25 grupos: Hypanus, Dasyatis, Rhizoprionodon, Salmo, Caranx, Ascidia, Ostrea, Leiosolenus, Obelia, Ectopleura, Aequorea, Nanomia, Pandeidae, Liriope, Diadumene, Aiptasiidae, Synandwakia, Acantholobulus, Menippe, Callinectes, Echinoplana, Calocalanus, Delibus, Copilia e Artemia. São 90.217 reads em 82 bibliotecas, quase todos na C2. O banco do laboratório não é alterado: a retirada é feita na leitura, e as contagens ficam na saída (`parameters.coiExcluded` e `descriptors.coiExcludedReads`). O administrador avisará o Marcio para retirá-los na origem.
4. **Perna é mexilhão-dourado.** Os 1.061 reads atribuídos a Perna, em 23 bibliotecas, contam como Limnoperna fortunei.

Números com essas decisões: média do índice geral 0,05 (C1), 0,13 (C2) e 0,09 (C3); percentil 90 de 0,13, 0,31 e 0,31; máximo 0,69; 45 observações de 0,15 para cima.

5. **Só valem as análises do Marcio**, que refez todas as campanhas. O índice lê apenas o pacote `Marcio/MetaReports_COI_16S_C1_C2_C3_corrigido` (banco consolidado, rastreabilidade de ASVs e amostras). As análises anteriores, do Dany, não são usadas nem como comparação: as pastas `Comparacao_Dany` e `Historico_pacote_anterior` não são lidas, e o confronto com o índice de setembro (feito sobre o banco antigo) deixou de servir de base.

6. **Pesos aprovados.** O administrador aprovou em 20/11 os pesos das fichas curadas nesta rodada: Microcystis (aplicabilidade 0,5), gosto e odor (gravidade 2, aplicabilidade 0,5), quironomídeos (2 e 0,5), Cordylophora (2 e 0,5), mexilhão-dourado (3 e 1) e assinatura de esgoto (2 e 0,5, base de 1,0%). Onde este documento ainda diz "proposto" para esses pesos, vale a aprovação.
7. **Espécies exóticas: presença não é dano.** A categoria de danos ambientais só pontua organismo com dano documentado. A presença de exóticas é listada por ponto, sem nota, a partir da tabela de exóticas aquáticas do pipeline do Marcio (`COI/C*/exotic_aquatic_species.tsv`), com dois complementos: Corbicula em gênero (as duas espécies candidatas são exóticas) e o mexilhão reatribuído de Perna. Há exóticas em 116 das 225 observações.

## O que o índice entrega

Para cada ponto de coleta (SIA) em cada campanha:

- três notas de 0 a 1: **danos físicos e ambientais**, **riscos operacionais** e **perigo potencial à saúde, identificado na captação**;
- um **índice geral** do ponto e a categoria predominante;
- **piso e teto** de cada nota, a **confiança** (A, B ou C) e os **alertas**;
- a posição do ponto dentro da campanha.

Para a rede em cada campanha: média dos pontos, mediana, percentil 90 e contagem de pontos por intervalo de escore.

## Fórmula

Por biblioteca e categoria:

    Q = soma de (reads do táxon / reads válidos) × (gravidade / 3) × aplicabilidade
    nota = ln(1 + 100 × Q) / ln(101)

- **Gravidade** (1 a 3): do efeito, pelo critério do catálogo SANEPAR-RISCOS-0.3. Não é reduzida por o táxon ter sido identificado só em gênero ou família.
- **Aplicabilidade**: peso convencional que expressa quanto do táxon detectado carrega o efeito, segundo a fonte. Quatro níveis: 1 (todo o táxon), 0,5 (parte substancial), 0,1 (minoria), 0 (sem efeito sustentado). Há ainda o estado **indeterminado**. Não é uma fração biológica medida.
- Cada táxon conta **uma vez por categoria**, pela ficha de maior gravidade × aplicabilidade.
- **Nota da categoria** = a maior entre os componentes utilizáveis. Contagens de marcadores diferentes nunca são somadas.
- **Índice geral do ponto** = a **maior das três notas**, com a categoria que o determinou e quantas categorias atingem a faixa de referência (0,15). Responde: qual é o sinal que mais merece atenção nesta captação? A versão 0.5 usava a média quadrática, que derrubava em 42% um ponto com problema em uma só categoria. A ordem dos pontos é a mesma nas duas (correlação de posto de 0,999). O valor da 0.5 segue na exportação de auditoria.
- **Rede** = média dos índices gerais, um voto por ponto, sem ponderar por número de reads.

## Como ler a escala

A régua é fixa e não depende dos dados de uma campanha. Ela não tem significado físico direto: a nota responde à **participação ponderada**, isto é, reads × gravidade × aplicabilidade. Uma nota de 0,15 corresponde a cerca de 1% de participação ponderada, 0,35 a 4%, 0,60 a 15% e 0,85 a 50%. Por exemplo, 1% dos reads com gravidade 3 e aplicabilidade 1 dá 0,15; os mesmos reads com aplicabilidade 0,5 dão 0,09. Nenhum desses valores é probabilidade de dano. A escala não foi esticada até 1 de propósito: precisa de folga para situações piores que as já observadas. Hoje as notas vão de 0 a 0,69.

## Maturidade de cada categoria (verificações de 20/11)

| Categoria | Situação | Base |
|---|---|---|
| Perigo potencial à saúde | Piloto com base | Concorda com os grupos de risco do laboratório de 13/11, da reanálise do Marcio (correlação de posto de 0,62 a 0,78). 18 dos 25 pontos de 0,15 para cima nesta categoria dependem da ficha de Microcystis, cujo peso é convenção. A assinatura de esgoto pontua em 21 observações, com peso PROPOSTO. |
| Danos físicos e ambientais | Em construção | Quase só duas fichas pontuam (Corbicula e Raphidiopsis). |
| Riscos operacionais | Em construção | Pontuam entupimento por diatomáceas (onde há resultado), gosto e odor, larvas de quironomídeos e incrustação, com pesos aprovados em 20/11. Pontua em 126 de 225 observações; 22 chegam a 0,15. Ainda não confrontado com datas de ocorrências reais. |

Repetibilidade entre aparelhos na C3, nas mesmas amostras: a ordem dos pontos se mantém (correlação de 0,77; 8 dos 10 primeiros em comum), a intensidade não (saúde média de 0,017 no MiSeq e 0,046 no NextSeq). Entre campanhas a persistência é fraca (0,29 a 0,41).

## Fichas operacionais da revisão por problema (20/11)

Cada ficha tem a fonte lida na íntegra. Gravidades e aplicabilidades são PROPOSTAS e aguardam aprovação do administrador.

| Problema | Organismo | Marcador | Gravidade | Aplicabilidade | Fonte |
|---|---|---|---|---|---|
| Entupimento de filtros | Diatomáceas (grupo, acima da base de 2,1%) | Cloroplasto no 16S | 3 | 1 | Relatório EPA Irlanda 353, ETA Vartry: capacidade caiu de 75 para 40 milhões de litros por dia |
| Gosto e odor (geosmina) | Dolichospermum | 16S | 2 | 0,5 | doi:10.3390/microorganisms12122610 |
| Gosto e odor (2-MIB) | Pseudanabaena | 16S | 2 | 0,5 | doi:10.3390/microorganisms11092332 |
| Larvas em filtros | Chironomidae (família) | COI | 2 | 0,5 | ficha curada anteriormente |
| Incrustação | Mexilhão-dourado (Limnoperna) | COI | 3 | 1 | doi:10.3390/polym16213070 e doi:10.1016/j.ese.2023.100305 |
| Incrustação | Cordylophora | COI | 2 | 0,5 | Grohmann 2008, Naturalia 31:16-21, usina de Funil: entupimento voltava em 4 meses em vez de 18 |
| Ferro, manganês e corrosão | Gallionella, Leptothrix, Crenothrix, Desulfovibrio | 16S | não pontua | indeterminada | doi:10.3390/toxics11070606, efeito documentado só na rede de distribuição |


Duas exceções aprovadas pelo administrador em 20/11, escritas em cada ficha: quando só uma espécie do gênero ocorre no Brasil, a evidência da espécie vale para o gênero detectado (Limnoperna, Cordylophora); e dano em tubulação de água bruta de usina vale para a captação, com aplicabilidade 0,5.

## Assinatura de esgoto (20/11)

Bacteroides, Bifidobacterium e a família Prevotellaceae, bactérias de intestino, somam como um grupo na categoria de saúde (16S), com efeito por massa: só pontua o excesso sobre a base da rede, 0,97% do 16S (percentil 90 das 224 observações). Gravidade 2 e aplicabilidade 0,5 PROPOSTAS. Fonte lida: doi:10.1038/s41598-018-29920-7, em que o conjunto de sequências de intestino humano acompanha a E. coli cultivada (r = 0,64) melhor que os reads de Escherichia/Shigella (r = 0,39). Indica contaminação fecal; não identifica patógeno. Zero não prova ausência (doi:10.2166/wst.2015.407). Pontos com maior sinal: SIA 31 (C2), 244 (C2 e C3), 782 (C3), 72 (C1 e C2).

**Qualidade da amostra.** Escherichia-Shigella com 1% ou mais do 16S e anaeróbios de intestino abaixo de um quinto disso vira alerta, sem nota. Ocorre em 8 pontos da C2 (SIAs 63, 82, 121, 125, 132, 158, 168, 204) e 1 da C3 (188), na mesma campanha em que Cedecea diverge. Hipótese a conferir com o laboratório: crescimento na amostra durante transporte ou armazenamento.

## Regras de evidência

1. **Sem herança.** Táxon sem ficha decidida contribui com zero e reduz a confiança, não a nota. Evidência de espécie não pontua uma detecção de gênero, salvo exceção aprovada e escrita na ficha (gênero com uma só espécie no Brasil).
2. **Indeterminado não pontua.** Evidência de espécie do catálogo 0.3 virou ficha de gênero indeterminada: fica registrada, entra só no teto.
3. **Aplicabilidade só recebe valor com a fonte lida na íntegra** e a justificativa escrita na ficha.
4. **Piso** = só fichas com aplicabilidade 1. **Teto** = indeterminadas com peso cheio. A distância entre os dois mostra quanto a nota depende de decisões ainda abertas.
5. **Medição contestada** (táxon que diverge fortemente entre corridas da mesma amostra) não pontua e aparece como alerta até conferência do laboratório. Caso atual: Cedecea.
6. **Baixo suporte**: táxon com menos de 10 reads ou menos de 0,01% da biblioteca vira alerta e não eleva a nota. Limites de piloto, a calibrar com os controles do laboratório.
7. **Zero** significa nenhuma contribuição pontuada. Não demonstra ausência de risco. **Sem medição** só ocorre quando não há nenhuma biblioteca utilizável.
8. **Efeito por massa.** Quando a fonte atribui o efeito à quantidade total de um grupo, e não a um gênero, as fichas do grupo somam a participação antes de pontuar, e só pontua o excesso sobre a participação de base da rede. Caso atual: diatomáceas, base de 2,1% do 16S (percentil 90 das 224 observações de C1 a C3). Dentro da base não pontua nem gera alerta.
9. **Dominância fora do padrão.** Qualquer táxon, com ou sem ficha, com 10% ou mais dos reads do componente e mais de três vezes a sua própria referência na rede (percentil 90 do táxon entre as bibliotecas das três campanhas, com piso de 0,5%) vira alerta. Não entra na nota: proporção de reads não mede biomassa, e a mesma proporção pode vir de água limpa ou de floração. Passa a poder pontuar quando houver uma medida de quantidade por amostra (concentração de DNA, clorofila ou turbidez). Hoje são 76 alertas em 59 das 225 observações.
10. **Leptospira e nitrificantes não pontuam.** Leptospira em gênero não prediz virulência (doi:10.1371/journal.pone.0227055). Nitrificantes na água bruta indicam aporte de amônia, não dano ao tratamento.

## Componentes e denominadores

| Componente | O que representa | Denominador |
|---|---|---|
| 16S | Bactérias | Reads válidos do 16S, sem os reads de cloroplasto |
| ALGAS | Algas, pelo cloroplasto detectado no 16S | Todos os reads válidos do 16S |
| COI | Invertebrados e outros eucariotos | Todos os reads válidos do COI, inclusive os sem identificação |

O denominador é fixado antes de consultar o cadastro. O componente ALGAS usa uma classificação exploratória dos cloroplastos contra os 16S plastidiais do PR2 v5.1.1 (`cloroplastos.py`), feita fora do pipeline do laboratório, que cobre as 400 maiores sequências de cloroplasto. Não substitui a classificação oficial e precisa de confirmação por microscopia.

## Plataforma de sequenciamento

Quando a mesma amostra tem duas corridas, usa-se o **NextSeq** se a biblioteca for utilizável e o **MiSeq** na falta dele. A escolha é feita por coleta e por marcador, antes de olhar a nota, e a origem fica registrada. Um zero válido na corrida preferida não é trocado por um positivo da outra. Comparação entre aparelhos é estudo separado.

Na C3, nas mesmas 76 amostras, cianobactérias são 0,30% do 16S no MiSeq e 2,07% no NextSeq. Por isso valores de cianobactérias do MiSeq da C3 não devem ser comparados com C1 e C2 como queda real.

## Confiança

Fração dos reads válidos com ficha decidida na categoria: **A** a partir de 50%, **B** de 20% a 50%, **C** abaixo de 20%. Confiança baixa não zera a nota; indica que grande parte dos organismos ainda não foi avaliada.

## O que o índice não enxerga

- **Mosquito-fantasma (Chaoboridae)**, problema conhecido da ETA Passaúna: nenhum read no COI das três campanhas.
- **Diatomáceas e outras algas**: sem marcador próprio; vistas só pelo cloroplasto, com classificação exploratória das 400 sequências mais abundantes.
- **Protozoários (Cryptosporidium e Giardia)** e o dinoflagelado **Ceratium**: nenhum read nas três campanhas; os marcadores usados não os detectam.
- **COI sem identificação**: de 94% a 99% dos reads válidos não chegam a família.

## Estabilidade frente aos pesos propostos (20/11, `estabilidade.py`; teste feito antes da retirada das diatomáceas e dos organismos marinhos)

Doze cenários variando os pesos propostos. Dos dez primeiros de cada campanha (C1/C2/C3), quantos permanecem:

| Cenário | Permanecem | Leitura |
|---|---|---|
| Microcystis com aplicabilidade 0,1 | 10/6/5 | O mais sensível: Iraí e Passaúna saem dos dez primeiros em C2 e C3 |
| Microcystis com aplicabilidade 1 | 9/8/10 | Estável |
| Diatomáceas com gravidade 2 | 10/10/9 | Estável |
| Diatomáceas com base na mediana (0,26%) | 9/7/8 | Sensível: 65 pontos passam de 0,15 (hoje 44) |
| Diatomáceas com base no percentil 95 | 10/10/9 | Estável |
| Gosto e odor, aplicabilidade 0,1 ou 1 | 10/10/10 | Não altera |
| Esgoto, três variações | 9/9/9 a 9/10/10 | Estável |
| Todos no mínimo | 9/7/9 | 23 pontos passam de 0,15 |
| Todos no máximo | 9/9/10 | 67 pontos passam de 0,15 |

As duas escolhas que mais pesam são a aplicabilidade de Microcystis e a base das diatomáceas.

## Critérios para sair do piloto

1. Acertar os casos conhecidos sem ser avisado. Iraí já fica entre os dez primeiros nas três campanhas, por saúde.
2. Estabilidade: os dez primeiros pontos de cada campanha devem se manter com escolhas plausíveis de peso.
3. Declarar os pontos cegos na tela.
4. Não acusar em períodos de operação normal documentada.
5. Confronto com ocorrências reais posteriores, por ponto e categoria.

## Onde está cada coisa

- Motor, cadastro de fichas e testes: `audit/matrizes-sia-central-2026-11-18/turno-noturno-2026-11-18/indice_v07/` (`motor.py`, `fichas.py`, `fichas-0.7.csv`, `rodar.py`, `test_motor.py`).
- Saída imutável consumida pelo aplicativo: `src/lib/capture-index/indice-captacao.json` (esquema `yvae-capture-index/4`).
- Visão única, exportações e rota: `src/lib/capture-index/index.ts`, `src/app/api/results/capture-index/route.ts`.
- Painel: `src/components/capture-index-panel.tsx`, usado na página `Ciência e método › Índice de risco na captação` (`/resultados/indice-captacao`).
- O índice histórico SANEPAR-INDICE-0.3 (setembro) permanece disponível para auditoria e não foi alterado.
