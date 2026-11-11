# Padrão de coleta de campo (versão 1)

Definido em 11/11/2026. Vale para o Yva'e (projeto Sanepar) e é o modelo para os
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
| Solo | `SO` | `SOLO` | Massa (g) | Não |
| Ar | `AR` | `AR` | Volume (L) | Não |
| Tecido | `TE` | `TECIDO` | Massa (g) | Não |
| Plâncton | `PL` | `PLANCTON` | Volume (mL) | Sim |

"Plâncton" cobre zooplâncton e fitoplâncton; o detalhe vai na especificação da
amostra.

## 3. Código da amostra

```text
{PROJETO}-{DDMMAA}-{PONTO}-{TIPO}{SEQUÊNCIA}

YVA-071126-0136-AG1   água, 1ª amostra de água do SIA 0136 em 07/11/2026
YVA-071126-0136-AG2   2ª amostra (réplica) de água do mesmo ponto e dia
YVA-071126-0136-PL1   plâncton
```

- **Projeto:** as 3 letras do código do projeto.
- **Data:** dia, mês e ano da coleta com 2 algarismos cada.
- **Ponto:** o SIA com 4 dígitos (`136` e `SIA-0136` viram `0136`). Em projetos sem
  SIA, o código do ponto só com letras e números, até 8 caracteres (`P-01` vira `P01`).
- **Tipo:** a sigla de 2 letras da tabela acima.
- **Sequência:** 1, 2, 3… para amostras do mesmo tipo, no mesmo ponto e no mesmo dia.
  Não tem zeros à esquerda.

O código tem 19 caracteres com um SIA de 4 dígitos. Ele não leva o laboratório de
destino nem a profundidade: os dois são dados da amostra e vão em colunas próprias.
Amostras do mesmo ponto em profundidades diferentes se distinguem pela sequência.

O código é gerado pelo aplicativo de campo, nunca digitado. Enquanto a amostra não
foi exportada, ele acompanha a data e o ponto do registro: se alguém corrige o SIA
ou a data, o código muda junto e o aplicativo mostra qual era o código gravado,
para a etiqueta ser refeita. Depois da exportação o código não muda mais.

Quem dá o código é o servidor, a partir da data e do ponto do registro que ficou
gravado. Um código nunca se repete no banco. Se outro registro do mesmo ponto e dia
já usou o número, o aplicativo avisa e oferece o próximo número livre (`AG4`, `AG5`).

## 4. Dados da amostra

Cada amostra guarda: código, tipo, profundidade em metros (0 = superfície), volume ou
massa, especificação (ex.: filtro 0,45 µm), tipo de conservação, acondicionamento e
posição na caixa.

Tipos de conservação: `FILTRO_CONGELADO`, `FILTRO_EM_ALCOOL_COM_REFRIGERACAO`,
`FILTRO_EM_ALCOOL_SEM_REFRIGERACAO`, `AMOSTRA_BRUTA_RESFRIADA`,
`AMOSTRA_BRUTA_CONGELADA`, `OUTRO`.

### Amostras no registro de campo

As amostras ficam no bloco **"Amostras do ponto"** do registro de campo (em código:
`src/lib/field-samples.ts`, tabela `field_diary_samples`).

- O aplicativo propõe as amostras do padrão da campanha quando a pessoa toca em
  "Iniciar coleta" num registro que ainda não tem amostra, ou pelo botão "Usar o
  padrão da campanha". Abrir o formulário não cria amostra nenhuma.
- "+ Amostra" acrescenta uma amostra do tipo escolhido, copiando os dados da última
  do mesmo tipo. O tipo de uma amostra não muda depois de criada: para trocar,
  remove-se a amostra e cria-se outra.
- Profundidade só existe nos tipos que têm profundidade (água e plâncton), em
  metros, com 0 para superfície. Volume ou massa segue a unidade do tipo.
- As amostras são gravadas depois do registro, com o registro que a nuvem
  confirmou. Se o registro foi salvo e as amostras não, o formulário fica aberto e
  avisa.
- Um registro aceita até 60 amostras. Um registro com amostras não pode ser
  apagado do banco sem antes tirar as amostras. A exclusão dos dados de uma
  campanha confere isso primeiro e, havendo amostra, não apaga nada.
- Cada mudança na lista de amostras de um registro entra no histórico de
  alterações, no campo "Amostras".
- O aparelho lembra o último acondicionamento usado em cada tipo, para a próxima
  amostra já vir preenchida.

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
- De cada tipo de amostra: quantas amostras o aplicativo propõe por ponto,
  conservação, acondicionamento, volume ou massa, profundidade e especificação.
- Parâmetros medidos em todo ponto: a lista dos parâmetros do catálogo que o
  registro de campo já traz prontos para preencher (até 30). O padrão do projeto
  começa sem nenhum marcado.

## 7. O que o celular registra sozinho

No registro de campo, a pessoa escolhe o ponto e toca em **"Iniciar coleta"**. O
aplicativo grava:

- A hora da coleta e a data, do relógio do aparelho, no momento do toque. O instante
  exato do toque também fica guardado (`collection_started_at`).
- A latitude e a longitude pelo GPS, com a precisão informada pelo aparelho.
- De onde veio a coordenada: `gps` (medida pelo aparelho), `planned` (coordenada
  planejada do ponto) ou `manual` (digitada). Registros antigos e os que vieram de
  planilha ficam sem origem.

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

A lista de pontos do formulário não leva coordenadas. A coordenada planejada é
consultada de um ponto por vez, só por quem pode registrar coleta.

O aplicativo também lembra, em cada aparelho, a última "Equipe" usada, para o
próximo registro já vir preenchido.

## 8. Planilha de exportação

Arquivo `.xlsx` com duas abas de dados.

**Aba `Amostras`**, uma linha por amostra:

```text
Lab Destino | Empresa | Projeto (Short Name) | Nome da Campanha | Coletores |
Categoria da Amostra | Origem da Amostra | Objetivo | Tipo de Conservação |
Código de Campo | Ponto de Coleta | Data da Coleta | Hora da Coleta | Latitude |
Longitude | Profundidade (m) | Volume Filtrado (mL) | Especificação | Temp Ar (°C) |
Temp Água (°C) | pH | Salinidade (ups) | Oxigênio Dissolvido | Transparência |
Turbidez | Local Armazenamento | Posição | Observações
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
- `Origem da Amostra` é calculada: para água, a matriz da campanha; para os outros
  tipos, o próprio tipo.

### Situação no Biolog em 11/11/2026

O Biolog já importa a aba `Amostras` (Amostras > Curadoria > Importar Excel), menos
três coisas que dependem de ajuste nele: a origem `PLANCTON`, as colunas
`Categoria da Amostra` e `Profundidade (m)`, e a aba `Parâmetros`. Até lá, os sete
parâmetros que o Biolog conhece também vão nas colunas fixas da aba `Amostras`. O
Biolog ainda gera um código definitivo próprio; a intenção é que passe a usar o
código do aplicativo de campo.
