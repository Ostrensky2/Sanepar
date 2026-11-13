# Padrão de coleta de campo (versão 3)

Definido em 11/11/2026 e revisto depois dos primeiros dias de campo: em 12/11/2026
(versão 2: código com a hora da coleta, preservante em cada amostra e número de
amostras livre por ponto) e em 13/11/2026 (versão 3: branco com código próprio, um
campo só de conservante, valores que não mudam já preenchidos e o ponto mais próximo
escolhido pelo GPS). Vale para o Yva'e (projeto Sanepar) e é o modelo para os
outros aplicativos de projeto: cada aplicativo registra a coleta em campo, gera o
código da amostra e exporta uma planilha no mesmo formato. O Biolog importa essa
planilha e segue com o rastreio no laboratório.

A mesma regra, em código, está em `src/lib/field-standard.ts`, com testes em
`src/lib/__tests__/field-standard.test.ts`. Se este texto e o código divergirem,
corrija os dois juntos.

## 1. Projeto

| Dado | Regra | Yva'e |
| --- | --- | --- |
| Código do projeto | Sempre 3 letras maiúsculas | `YVA` |
| Sigla do projeto | Como está cadastrado no Biolog | `YVAE` |
| Empresa / cliente | Texto | `SANEPAR` |

## 2. Tipos de amostra

| Tipo | Sigla no código | Valor na planilha | Quantidade | Tem profundidade |
| --- | --- | --- | --- | --- |
| Água | `AG` | `AGUA` | Volume (mL) | Sim |
| Branco | `BR` | `BRANCO` | Volume (mL) | Não |
| Solo | `SO` | `SOLO` | Massa (g) | Não |
| Ar | `AR` | `AR` | Volume (L) | Não |
| Tecido | `TE` | `TECIDO` | Massa (g) | Não |
| Plâncton | `PL` | `PLANCTON` | Volume (L) | Sim |

"Plâncton" cobre zooplâncton e fitoplâncton; o detalhe vai na especificação da
amostra. O volume do plâncton é o de água que passou pela rede, em litros (até a
versão 2.0.8 era em mL; as amostras antigas aparecem convertidas para L).

**Branco** é o controle negativo do ponto (água ultrapura). Tem sigla própria para
não virar mais uma réplica de água no código (`BR1`, e não `AG6`), não tem
profundidade e não leva parâmetro medido.

## 3. Código da amostra

```text
{PROJETO}-{PONTO}-{DDMMAA}-{HHMM}-{TIPO}{SEQUÊNCIA}

YVA-0136-071126-0905-AG1   água, 1ª amostra de água do SIA 0136 em 07/11/2026, 9h05
YVA-0136-071126-0905-AG2   2ª amostra (réplica) de água do mesmo ponto, dia e hora
YVA-0136-071126-0905-BR1   branco (controle negativo) do mesmo ponto
YVA-0136-071126-0905-PL1   plâncton
```

- **Projeto:** as 3 letras do código do projeto.
- **Ponto:** o SIA com 4 dígitos (`136` e `SIA-0136` viram `0136`). Em projetos sem
  SIA, o código do ponto só com letras e números, até 8 caracteres (`P-01` vira `P01`).
- **Data:** dia, mês e ano da coleta com 2 algarismos cada.
- **Hora:** a hora da coleta do registro, em horas e minutos (`0905`).
- **Tipo:** a sigla de 2 letras da tabela acima.
- **Sequência:** 1, 2, 3… para amostras do mesmo tipo, no mesmo ponto, dia e hora.
  Não tem zeros à esquerda.

O código tem 24 caracteres com um SIA de 4 dígitos. O ponto vem logo depois do
projeto porque é por ele que a equipe procura a amostra na caixa; o dia e a hora
separam duas coletas no mesmo ponto. Ele não leva o laboratório de destino nem a
profundidade: os dois são dados da amostra e vão em colunas próprias. Amostras do
mesmo ponto em profundidades diferentes se distinguem pela sequência.

**Formato anterior.** Até a versão 2.0.6 (11/11/2026) o código era
`{PROJETO}-{DDMMAA}-{PONTO}-{TIPO}{SEQUÊNCIA}` (`YVA-071126-0136-AG1`), sem a hora.
As amostras gravadas nesse formato ficam com o código que têm, porque ele pode já
estar numa etiqueta: o aplicativo, o banco e a planilha continuam aceitando os dois
formatos. Amostra nova sai sempre no formato com a hora.

O código é gerado pelo aplicativo de campo, nunca digitado. Sem a hora da coleta no
registro não há código: o aplicativo pede a hora ("Iniciar coleta" já preenche).
Enquanto a amostra não foi exportada, o código acompanha o ponto, a data e a hora do
registro: se alguém corrige um deles, o código muda junto e o aplicativo mostra qual
era o código gravado, para a etiqueta ser refeita. Depois da exportação o código não
muda mais.

"Exportação" é gerar a planilha para o Biolog (seção 8). Nesse momento a amostra
recebe a marca de exportada, e o código, o tipo e o número dela ficam os que saíram
na planilha, mesmo que a data, a hora ou o ponto do registro sejam corrigidos
depois. Os outros dados da amostra (profundidade, volume, conservante,
armazenamento, posição) continuam podendo ser corrigidos.

Quem dá o código é o servidor, a partir do ponto, da data e da hora do registro que
ficou gravado. Um código nunca se repete no banco. Se outro registro do mesmo ponto,
dia e hora já usou o número, o aplicativo avisa e oferece o próximo número livre
(`AG4`, `AG5`).

## 4. Dados da amostra

Cada amostra guarda: código, tipo, profundidade em metros (0 = superfície), volume ou
massa, especificação (ex.: filtro 0,45 µm), conservante, armazenamento e posição na
caixa.

**Conservante** é um campo só desde a versão 2.0.9 (antes eram dois, "conservação"
e "preservante", que diziam a mesma coisa). As opções são as que a equipe usa:

| Opção | Valor gravado |
| --- | --- |
| Álcool com congelamento | `ALCOOL_COM_CONGELAMENTO` |
| Álcool sem congelamento | `ALCOOL_SEM_CONGELAMENTO` |
| Longmire | `LONGMIRE` |
| Sílica | `SILICA` |
| Outro (a pessoa escreve qual, até 120 caracteres) | `OUTRO` |

As opções anteriores (`FILTRO_CONGELADO`, `FILTRO_EM_ALCOOL_COM_REFRIGERACAO`,
`FILTRO_EM_ALCOOL_SEM_REFRIGERACAO`, `AMOSTRA_BRUTA_RESFRIADA`,
`AMOSTRA_BRUTA_CONGELADA`) continuam valendo para as amostras gravadas com elas,
junto com o preservante escrito à parte, mas não são oferecidas para amostra nova.
No banco, o texto do "Outro" (e o preservante antigo) fica na coluna `preservative`.

**Armazenamento** é texto livre (ex.: Criobox).

### Amostras no registro de campo

As amostras ficam no bloco **"Amostras do ponto"** do registro de campo (em código:
`src/lib/field-samples.ts`, tabela `field_diary_samples`).

- O aplicativo propõe as amostras do padrão da campanha quando a pessoa toca em
  "Iniciar coleta" num registro que ainda não tem amostra, ou pelo botão "Usar o
  padrão da campanha". Abrir o formulário não cria amostra nenhuma. O padrão do
  projeto Sanepar é 5 de água, 1 branco e 1 de plâncton por ponto, já com o que não
  muda de um ponto para outro: 250 mL de água e de branco, 1000 L de plâncton,
  conservante Longmire e armazenamento em Criobox. Tudo continua editável.
- O número de amostras é livre: os botões "−" e "+" ao lado de Água, Branco e
  Plâncton tiram ou acrescentam uma amostra naquele ponto, quantas a equipe quiser,
  até o limite do registro. O "−" tira a de maior número que ainda não foi
  exportada.
- "+ Amostra" acrescenta uma amostra do tipo escolhido, copiando os dados da última
  do mesmo tipo. O tipo de uma amostra não muda depois de criada: para trocar,
  remove-se a amostra e cria-se outra.
- Profundidade só existe nos tipos que têm profundidade (água e plâncton), em
  metros, com 0 para superfície. Volume ou massa segue a unidade do tipo.
- Amostra nova vem do padrão da campanha; a acrescentada com "+" copia a anterior
  do mesmo tipo. O aparelho não guarda mais o último acondicionamento ou
  preservante usado (até a versão 2.0.8 guardava): o que vale é o padrão.
- As amostras são gravadas depois do registro, com o registro que a nuvem
  confirmou. Se o registro foi salvo e as amostras não, o formulário fica aberto e
  avisa.
- Um registro aceita até 60 amostras. Um registro com amostras não pode ser
  apagado do banco sem antes tirar as amostras. A exclusão dos dados de uma
  campanha confere isso primeiro e, havendo amostra, não apaga nada.
- Cada mudança na lista de amostras de um registro entra no histórico de
  alterações, no campo "Amostras".

Os dois campos de texto antigos continuam no registro e são preenchidos sozinhos:
"Amostras e Réplicas (eDNA)" recebe o número de amostras de água ("3 réplicas") e
"ID Zooplâncton" recebe os códigos das amostras de plâncton. O aplicativo só
escreve neles quando estão vazios ou quando o texto que está lá foi escrito por
ele. O que a pessoa digitou não é trocado.

## 5. Parâmetros medidos em campo

Um parâmetro é sempre um dado com nome, valor numérico e unidade. Nunca vai como
texto em observações. O catálogo começa com os oito abaixo, e o aplicativo permite
criar outros.

| Parâmetro | Identificador | Unidade | Faixa esperada | Tem profundidade |
| --- | --- | --- | --- | --- |
| Temperatura do ar | `air_temperature` | °C | -20 a 60 | Não |
| Temperatura da água | `water_temperature` | °C | -2 a 40 | Sim |
| pH | `ph` | | 0 a 14 | Sim |
| Condutividade | `conductivity` | µS/cm | 0 a 100000 | Sim |
| Salinidade | `salinity` | ups | 0 a 50 | Sim |
| Oxigênio dissolvido | `dissolved_oxygen` | mg/L | 0 a 20 | Sim |
| Transparência (Secchi) | `secchi_transparency` | m | 0 a 50 | Não |
| Turbidez | `turbidity` | NTU | 0 a 4000 | Sim |

Fora da faixa o aplicativo avisa, mas não impede o registro. Cada medição guarda o
valor, a unidade do parâmetro na hora da medição, a profundidade (quando o parâmetro
tem), a hora e o equipamento ou método.

### Catálogo de parâmetros

O catálogo vale para toda a equipe (em código: `src/lib/field-parameters.ts`, tabela
`field_parameters`).

- Cada parâmetro tem identificador, nome, unidade, faixa esperada, os tipos de
  amostra em que é medido e se é medido numa profundidade.
- "+ Parâmetro" cria um parâmetro novo, no registro de campo ou em "Padrões de
  coleta". O identificador sai do nome, sem acento e em minúsculas (`clorofila_a`),
  e nunca muda depois.
- Dois parâmetros não podem ter o mesmo nome, sem contar acento e maiúscula. Quem
  tenta criar um que já existe recebe o que está no catálogo.
- Os oito do padrão não mudam de nome, unidade ou faixa. Os criados pela equipe
  podem ser alterados em "Padrões de coleta".
- Parâmetro nenhum é apagado. O que a equipe não usa é desativado: sai da lista de
  quem mede, e as medições já gravadas continuam com o nome e a unidade.
- O catálogo aceita até 200 parâmetros.

### Parâmetros no registro de campo

As medições ficam no bloco **"Parâmetros medidos"** do registro de campo (tabela
`field_parameter_readings`).

- A medição pertence ao registro do ponto, e não a uma amostra. Na planilha de
  exportação ela acompanha cada amostra do ponto em que se aplica: o parâmetro vale
  para o tipo da amostra e, quando os dois têm profundidade, a profundidade é a
  mesma. Medição sem profundidade (temperatura do ar, Secchi) acompanha todas.
- Um registro tem no máximo uma medição de cada parâmetro em cada profundidade. Para
  medir o mesmo parâmetro em dois níveis, acrescenta-se outra medição com outra
  profundidade.
- Os parâmetros marcados na campanha aparecem prontos para preencher quando a pessoa
  toca em "Iniciar coleta" num registro que ainda não tem medição, ou pelo botão
  "Usar os parâmetros da campanha". Linha sem valor não é gravada.
- O valor é digitado só como número, com vírgula ou ponto. A unidade vem do
  catálogo e é gravada pelo servidor.
- A profundidade proposta é a do padrão da campanha para água (0 = superfície). No
  dia da coleta, a hora é anotada quando o valor é digitado. O aparelho lembra o
  último equipamento usado em cada parâmetro.
- As medições são gravadas depois do registro, com o registro que a nuvem confirmou.
  Se o registro foi salvo e as medições não, o formulário fica aberto e avisa.
- Se outro aparelho já gravou a mesma medição no mesmo registro, nada é trocado sem
  a pessoa escolher entre ficar com a gravada ou gravar a dela por cima.
- Um registro aceita até 100 medições. Um registro com medições não pode ser apagado
  do banco sem antes tirar as medições, e a exclusão dos dados de uma campanha
  confere isso primeiro, como faz com as amostras.
- Cada mudança nas medições de um registro entra no histórico de alterações, no
  campo "Parâmetros".

## 6. Padrões de coleta

São os valores que não precisam ser digitados em cada ponto. Ficam na campanha e
passam para as campanhas seguintes enquanto ninguém mudar.

- Do projeto: código, sigla, empresa, laboratório de destino (`GA`, `LAPOA` ou
  `LHM`), objetivo e matriz da água (`AGUA_DOCE`, `AGUA_ESTUARINA`, `AGUA_MARINHA`,
  `AGUA_CLORADA`, `AGUA_ULTRAPURA`).
- De cada tipo de amostra: quantas amostras o aplicativo propõe por ponto (só a
  sugestão inicial; no ponto a equipe acrescenta ou tira), conservante (e qual, se
  for "Outro"), armazenamento, volume ou massa, profundidade e especificação.
- Os padrões gravados guardam a versão (`standardVersion`, hoje 2). Padrões
  gravados antes da versão 2.0.9 ficam com o número de amostras de cada tipo e os
  parâmetros que a campanha escolheu; o resto de cada tipo de amostra volta ao
  padrão do projeto.
- Parâmetros medidos em todo ponto: a lista dos parâmetros do catálogo que o
  registro de campo já traz prontos para preencher (até 30). O padrão do projeto
  começa sem nenhum marcado.

## 7. O que o celular registra sozinho

No registro de campo, a pessoa toca em **"Iniciar coleta"** ao chegar no ponto. O
aplicativo grava:

- A hora da coleta e a data, do relógio do aparelho, no momento do toque. O instante
  exato do toque também fica guardado (`collection_started_at`).
- A latitude e a longitude pelo GPS, com a precisão informada pelo aparelho.
- De onde veio a coordenada: `gps` (medida pelo aparelho), `planned` (coordenada
  planejada do ponto) ou `manual` (digitada). Registros antigos e os que vieram de
  planilha ficam sem origem.
- O ponto de coleta, quando nenhum foi escolhido: o da campanha mais próximo do
  celular (ver "Ponto mais próximo", abaixo).

Regras da captura (em código: `src/lib/collection-capture.ts`):

- **Sem leitura do GPS, nada do que já está no registro é trocado.** Se o registro já
  tem coordenada, ela fica. Se não tem, entra a coordenada planejada do ponto, marcada
  como `planned`, com aviso para conferir. Sem nenhuma das duas, a pessoa digita.
- Precisão pior que 100 m pede conferência da coordenada.
- Se o celular está a mais de 200 m da coordenada planejada do ponto (já descontada
  a incerteza do GPS), o aplicativo avisa e oferece marcar o ponto como realocado.
- Digitar a latitude ou a longitude muda a origem para `manual`.
- Trocar o ponto de um registro com coordenada `planned` apaga a coordenada, porque
  ela era do ponto anterior. Coordenada do GPS ou digitada não muda.
- Num registro que já tem hora, ou que é de outro dia, o aplicativo pergunta antes de
  trocar a hora e a data.
- Quando uma planilha importada troca a coordenada de um registro, a origem é
  apagada; quando não troca, a origem, a precisão e o início da coleta são mantidos.
- "Ler o GPS de novo" atualiza só a posição, sem mexer na hora.

### Ponto mais próximo

Desde a versão 2.0.9 (13/11/2026), como no IAGEN, a leitura do GPS associa o
registro ao ponto mais próximo (em código: `src/lib/nearest-point.ts`).

- Valem os pontos da campanha do registro que têm coordenada planejada; se a
  campanha não tem nenhum, valem os das outras campanhas.
- Registro sem ponto escolhido: o mais próximo entra sozinho se estiver a até 1 km
  (já descontada a incerteza do GPS). Mais longe, o aplicativo só sugere, com o
  botão "Usar este ponto".
- Registro com ponto escolhido: nada é trocado sem a pessoa tocar. O aplicativo
  sugere o mais próximo só quando o celular está a mais de 200 m do ponto escolhido
  e outro ponto está mais perto.
- Funciona sem sinal: a lista de pontos com coordenada fica guardada no aparelho.

A lista de pontos do formulário (`/api/field-diary/point-options`) não leva
coordenadas. A lista com coordenadas (`/api/field-diary/planned-points`) e a
coordenada de um ponto (`/api/field-diary/planned-coordinate`) são só para quem pode
registrar coleta, e saem só com ponto, município, campanha e coordenada.

O aplicativo também lembra, em cada aparelho, a última "Equipe" usada, para o
próximo registro já vir preenchido.

### Sem sinal

Desde a versão 2.0.7 (12/11/2026) o registro de campo funciona sem sinal nenhum
(em código: `public/sw.js`, `src/lib/field-outbox.ts`, `src/lib/field-record-sync.ts`).

- O celular guarda as telas do aplicativo e a última cópia dos pontos (com a
  coordenada planejada), campanhas, parâmetros e registros. Para isso, o aplicativo precisa ter sido aberto uma vez
  com sinal depois da atualização, já com a conta conectada. Dá para instalar na
  tela inicial do celular ("Adicionar à tela inicial").
- Sem sinal, salvar o registro guarda tudo no aparelho: o registro, as amostras, as
  medições e as fotos. O registro aparece na lista com o selo "No aparelho,
  aguardando sinal" e pode ser aberto e corrigido.
- Quando o sinal volta, o aplicativo envia sozinho, do mais antigo para o mais
  novo: primeiro as fotos, depois o registro, depois as amostras e as medições. O
  botão "Enviar agora" força o envio.
- Se a nuvem recusar alguma coisa (código de amostra repetido, por exemplo), o
  registro fica com o selo "Precisa de revisão" e nada se perde.
- Sair do sistema com registros ainda no aparelho pede confirmação. Sair apaga a
  cópia guardada dos dados da conta.

## 8. Planilha de exportação

Arquivo `.xlsx` com duas abas de dados e uma de consulta (`Catálogo de parâmetros`).
A aba `Amostras` é sempre a primeira: é a que o Biolog lê.

**Aba `Amostras`**, uma linha por amostra:

```text
Lab Destino | Empresa | Projeto (Short Name) | Nome da Campanha | Coletores |
Categoria da Amostra | Origem da Amostra | Objetivo | Tipo de Conservação |
Código de Campo | Ponto de Coleta | Data da Coleta | Hora da Coleta | Latitude |
Longitude | Profundidade (m) | Volume Filtrado (mL) | Especificação | Temp Ar (°C) |
Temp Água (°C) | pH | Salinidade (ups) | Oxigênio Dissolvido | Transparência |
Turbidez | Local Armazenamento | Posição | Observações | Conservante
```

**Aba `Parâmetros`**, uma linha por medição:

```text
Código de Campo | Parâmetro | Valor | Unidade | Profundidade (m) |
Data/Hora da Medição | Equipamento / Método
```

Regras do formato:

- Data em `DD/MM/AAAA`, hora em `HH:MM`, coordenadas decimais com ponto.
- A aba `Parâmetros` é em formato longo: um parâmetro novo vira mais linhas e não
  muda o layout.
- A coluna do tipo se chama `Categoria da Amostra`. O cabeçalho "Tipo de Amostra"
  não pode ser usado, porque o Biolog o lê como "Origem da Amostra".
- Os cabeçalhos da aba `Amostras` são os que o importador do Biolog reconhece
  sozinho. Não usar barra (`/`) em cabeçalho.
- `Origem da Amostra` é calculada: para água, a matriz da campanha; para o branco,
  `AGUA_ULTRAPURA`; para os outros tipos, o próprio tipo.
- `Objetivo` do branco é sempre `CONTROLE` (controle negativo).
- `Tipo de Conservação` é da lista do Biolog: as opções de conservante que não
  existem lá saem como a mais próxima (álcool com ou sem congelamento, em água e
  branco, como `FILTRO_EM_ALCOOL_COM_REFRIGERACAO` ou `..._SEM_REFRIGERACAO`) ou
  `OUTRO` (Longmire, Sílica, álcool em plâncton).
- `Conservante` é a última coluna, para não mudar a posição das outras. Foi
  acrescentada em 12/11/2026 como `Preservante` (versão 1.1 do contrato com o
  Biolog) e virou `Conservante` em 13/11/2026 (versão 1.2): o nome exato que a
  equipe escolheu (`Longmire`, `Sílica`, `Álcool com congelamento`, ou o que foi
  escrito em "Outro"). Enquanto o Biolog não a lê, o conservante também vai no fim
  da `Especificação` (`eDNA; conservante: Longmire`) quando a coluna `Tipo de
  Conservação` não diz o mesmo.

### Como o Yva'e gera a planilha

Em **Campanhas > Exportar > Planilha para o Biolog (.xlsx)**, para a campanha que
está na tela. Antes de gerar, o aplicativo mostra o que vai e o que falta.

O que entra:

- Só registros de campo que têm amostra. Os outros ficam de fora e são contados.
- Todas as amostras da campanha, sempre, inclusive as que já saíram numa planilha
  anterior: o Biolog ignora a amostra que já importou (mesmo código, projeto,
  campanha, ponto e data), então mandar de novo não duplica nada.
- As linhas saem por campanha, data, hora e ponto; dentro do ponto, por tipo de
  amostra e número.

Como cada coluna é preenchida:

- `Lab Destino`, `Empresa`, `Projeto (Short Name)` e `Objetivo`: padrões de coleta
  da campanha (seção 6).
- `Coletores`: as pessoas da equipe do registro, separadas por ponto e vírgula; sem
  elas, o nome da equipe.
- `Ponto de Coleta`: o ponto como está no código (`0136`).
- `Volume Filtrado (mL)`: só para quantidade em mL. Massa e litros (solo, tecido,
  ar, plâncton) vão no começo da `Especificação` (`50 g; Margem`, `1000 L`).
- `Profundidade (m)`: só nos tipos que têm profundidade. `0` é superfície.
- Colunas fixas de parâmetro (`Temp Ar (°C)`, `pH`…): a medição que vale para a
  amostra. Havendo mais de uma, fica a mais rasa.
- `Observações`: município, local, situação do ponto, motivo da realocação, origem
  da coordenada, ocorrência e o identificador do registro no Yva'e.
- Aba `Parâmetros`: uma linha para cada medição de cada amostra a que ela se aplica
  (mesmo tipo e mesma profundidade; medição sem profundidade vale para todas).
- Aba `Catálogo de parâmetros`: os parâmetros ativos e os desativados que têm
  medição na planilha, com unidade, faixa esperada e a coluna fixa de cada um.

O que o aplicativo aponta antes de gerar (a planilha sai do mesmo jeito; quem decide
se manda é a pessoa):

| Pendência | O Biolog recusa? |
| --- | --- |
| Registro sem hora da coleta | Sim |
| Registro sem latitude e longitude | Sim |
| Registro sem ponto de coleta (SIA) | Sim |
| Coordenada que é a planejada do ponto, e não a medida no local | Não |
| Código gravado que não confere mais com a data, a hora e o ponto do registro | Não |
| Código já exportado (ou no formato antigo) que ficou o mesmo depois de o registro ser corrigido | Não |
| Medição que não vale para nenhuma amostra do registro (outra profundidade) | Não |

Depois que o arquivo sai, as amostras ficam marcadas como exportadas (coluna
`exported_at`, migration `20261111150000_field_diary_samples_exported.sql`) e o
histórico de cada registro ganha a linha "Exportação para o Biolog" com os códigos
e quem exportou. A marca guarda a data da primeira exportação. Enquanto o banco não
tiver essa coluna, a planilha é gerada igual e os códigos continuam acompanhando o
registro.

Uma amostra exportada ainda pode ser retirada do registro (a retirada fica no
histórico). O formulário avisa que ela precisa ser retirada também no Biolog, porque
o número dela volta a ficar livre no Yva'e.

O arquivo se chama `yvae-biolog-{campanha}-{AAAA-MM-DD}.xlsx`.

### Situação no Biolog em 11/11/2026

O Biolog já importa a aba `Amostras` (Amostras > Curadoria > Importar Excel), menos
três coisas que dependem de ajuste nele: a origem `PLANCTON`, as colunas
`Categoria da Amostra` e `Profundidade (m)`, e a aba `Parâmetros`. Até lá, os sete
parâmetros que o Biolog conhece também vão nas colunas fixas da aba `Amostras`. O
Biolog ainda gera um código definitivo próprio; a intenção é que passe a usar o
código do aplicativo de campo.
