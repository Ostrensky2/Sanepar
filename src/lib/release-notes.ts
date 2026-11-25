/**
 * Histórico de versões mostrado em Ajuda › Versões.
 *
 * Regra: cada versão principal (1, 2, 3…) ganha uma entrada. As atualizações de cada
 * deploy (2.0.1, 2.0.2…) entram em `updates` da versão principal correspondente, a mais
 * recente primeiro. O número exibido no rodapé vem de APP_VERSION (scripts/update-app-version.mjs).
 */
export type ReleaseArea = { title: string; items: string[] };
export type ReleaseUpdate = { version: string; date: string; items: string[] };
export type MajorRelease = {
  major: number;
  name: string;
  /** Faixa de números desta versão principal, para leitura humana. */
  range: string;
  period: string;
  summary: string;
  areas: ReleaseArea[];
  /** O que deixou de existir ou mudou de lugar em relação à versão anterior. */
  moved?: Array<{ before: string; now: string }>;
  notes?: string[];
  updates?: ReleaseUpdate[];
};

export const MAJOR_RELEASES: MajorRelease[] = [
  {
    major: 2,
    name: "Versão 2",
    range: "2.0.0 em diante",
    period: "Setembro de 2026",
    summary:
      "Resultados pelo índice de captação, metodologia 3.0, por campanha e por ponto; telas reorganizadas em menos destinos, a seção Ciência e método para explicar cada número e um único caminho para trazer dados de campo.",
    areas: [
      {
        title: "Resultados: índice de captação 3.0",
        items: [
          "Índice de 0 a 1 em escala fixa, calculado em cada campanha e em cada ponto (SIA), com três categorias: danos físicos e ambientais, riscos operacionais e perigo potencial à saúde.",
          "A maior das três categorias é o piso do índice geral; um dano distinto e documentado em outra categoria pode elevá-lo. O índice geral não é a média das três.",
          "Zero é nota calculada. “Sem estimativa” e “sem medição” aparecem com esses nomes e não são zero.",
          "Visão geral, Por campanha, Mapa, Tipos de efeito, Exóticas e Por ponto, sempre com a mesma nota.",
          "Ficha de cada ponto: índice geral, categorias, perfis de risco biológico operacional e sanitário e os efeitos documentados na amostra.",
          "Exportações para leitura e para auditoria, e planilha unificada da campanha com a nota de cada SIA.",
          "Cada campanha é calculada à parte: não há total nem média juntando campanhas.",
        ],
      },
      {
        title: "Ciência e método",
        items: [
          "Impactos potenciais: o que a literatura descreve para cada organismo, primeiro os detectados na campanha escolhida, depois o restante do catálogo.",
          "Onde ocorrem e Referências, ligados entre si e à ficha do ponto.",
          "Como o índice é calculado: a metodologia 3.0, com a fórmula das categorias, o piso e o reforço.",
        ],
      },
      {
        title: "Navegação e leitura",
        items: [
          "Menu com 8 destinos em 3 grupos (Consultar, Abastecer e Apoio); subtelas viraram abas.",
          "Campanhas e resultados reúne campo e resultados de cada campanha; a campanha escolhida vale para as demais telas.",
          "Fases das campanhas simplificadas para 6 (mais Suspensa e Cancelada), com a etapa atual ao lado.",
          "Botão “?” abre a ajuda da própria tela num painel lateral, sem sair da página.",
          "Textos revistos em linguagem comum, sem códigos internos; letras de no mínimo 12 px e menos caixa alta.",
          "Celular: menu por grupos, tabelas com rolagem própria e nenhuma rolagem lateral da página.",
        ],
      },
      {
        title: "Dados e campo",
        items: [
          "Central de dados com checklist por campanha e o assistente “Tenho uma planilha. Onde importo?”.",
          "Importador único de campo no Diário: aceita a planilha-síntese e a de registros, mostra prévia, conflitos lado a lado e histórico; copia as fotos indicadas por link.",
          "Calendário do Diário com dia da campanha e número de pontos (“D1 · 4 pt”).",
          "Sessão mais resistente a quedas de conexão: mostra “Conexão instável · Tentar novamente” em vez de voltar ao login.",
        ],
      },
    ],
    moved: [
      { before: "Painel eDNA da Campanha 1 (score de risco) e índice por conjuntos", now: "Campanhas e resultados › Resultados, com o índice de captação 3.0. Os valores não são comparáveis aos anteriores." },
      { before: "Solicitações", now: "Suporte (contato direto com a equipe)." },
      { before: "Central de dados › Planilhas de campo", now: "Central de dados › Diário de campo › Importar planilha." },
      { before: "Ações pontuais", now: "Atividades complementares (abas Consultar e Registrar)." },
      { before: "Entrada de dados", now: "Central de dados." },
    ],
    notes: [
      "O índice de captação 3.0 não é comparável ao score de risco do painel da versão 1 nem ao índice por conjuntos: a fórmula e a escala mudaram.",
      "Links antigos continuam funcionando e levam à tela nova correspondente.",
    ],
    updates: [
      {
        version: "2.1.3",
        date: "25/11/2026",
        items: [
          "Nova aba Central de dados › Eventos emergenciais: registra as idas a campo fora da rotina (nome do evento, data informada, data de ida ao local, problema principal, ponto ou local, atividades feitas, que se marcam com um toque, e a descrição do fato). Dá para editar e apagar.",
          "Registro de campo: o dia de hoje é o de Curitiba também à noite (depois das 21h o app já sugeria o dia seguinte), e o registro novo já vem com o dia da campanha certo, em vez de sempre “Dia 1”.",
          "Campanhas abre na campanha que está em campo quando o aparelho ainda não tinha escolhido nenhuma.",
          "Atividades complementares: salvar uma atividade não apaga mais as que outra pessoa registrou com a página aberta ao mesmo tempo, e o aviso diz qual campo falta.",
          "Segurança: cadastro de usuário com categoria em branco ou desconhecida não vale mais como Admin.",
          "Também desde a 2.1.2: resultados pelo método 3.0 por campanha e por ponto, Início com gráfico de índices por campanha, mapa, 10 pontos com maior índice e pontos que pedem atenção; Resultados com Distribuição e Organismos; Ciência e método com catálogo de fichas, Acervo científico dentro de cada ficha, Metodologia científica e explicação em linguagem simples; fotos de campo nos mapas.",
        ],
      },
      {
        version: "2.0.9",
        date: "13/11/2026",
        items: [
          "“Iniciar coleta” escolhe sozinho o ponto da campanha mais próximo do celular, como no IAGEN, também sem sinal. Se você já tinha escolhido um ponto e o celular está longe dele, o app mostra o mais próximo com o botão “Usar este ponto”.",
          "As amostras já vêm com o que não muda de um ponto para outro: água com 250 mL, armazenamento em Criobox, conservante Longmire e plâncton com 1000 L (o volume do plâncton agora é em litros). Tudo continua editável.",
          "Conservação e preservante viraram um campo só, “Conservante”, com as opções que a equipe usa: Álcool com congelamento, Álcool sem congelamento, Longmire, Sílica e Outro (aí escreva qual).",
          "Novo tipo de amostra Branco (controle negativo), com código próprio, como YVA-0136-071126-0905-BR1. O padrão do ponto passou a ser 5 de água, 1 branco e 1 de plâncton, e o branco não vira mais a réplica 6 da água.",
          "Planilha para o Biolog: a coluna “Preservante” passou a se chamar “Conservante”, e o branco sai como controle negativo. Ajuda atualizada.",
        ],
      },
      {
        version: "2.0.8",
        date: "13/11/2026",
        items: [
          "Ajuda: novo quadro em destaque “Regras para toda a equipe”, no alto da Ajuda e no botão “?” do Diário de campo. Ele diz como preparar o celular com internet antes de cada saída a campo, o que fazer com registros guardados no aparelho e como ler o código da etiqueta.",
          "Ajuda › Diário de campo reescrita para o trabalho de campo: “Iniciar coleta”, situação do ponto, amostras com réplicas livres e preservante, parâmetros medidos, registro sem sinal e o que fazer quando algo não aparece.",
          "Ajuda › Campanhas e resultados explica a planilha para o Biolog, e Ajuda › Central de dados explica os padrões de coleta da campanha.",
        ],
      },
      {
        version: "2.0.7",
        date: "12/11/2026",
        items: [
          "Diário de campo funciona sem sinal. Com o app aberto uma vez com internet depois da atualização, o celular guarda as telas, os pontos e a campanha. Sem sinal, salvar guarda o registro, as amostras, as medições e as fotos no aparelho, com o selo “No aparelho, aguardando sinal”, e tudo vai para a nuvem sozinho quando o sinal volta. “Enviar agora” força o envio.",
          "Dá para instalar o Yva'e na tela inicial do celular (“Adicionar à tela inicial”) e abrir como um aplicativo.",
          "Amostras do ponto: o número de amostras é livre. Os botões “−” e “+” ao lado de cada tipo tiram ou acrescentam uma réplica naquele ponto. O padrão do projeto passou a ser 5 de água e 1 de plâncton.",
          "Cada amostra ganhou o campo “Preservante”, com sugestões (Longmire, álcool, sílica, RNAlater) e espaço para qualquer outro. O preservante usado por último em cada tipo já vem preenchido, e o padrão da campanha também pode trazer o preservante.",
          "O código da etiqueta passa a levar o ponto, o dia e a hora da coleta, como YVA-0136-071126-0905-AG1. As amostras já gravadas no formato anterior ficam com o código que têm.",
          "A planilha para o Biolog ganhou a coluna “Preservante”, e o preservante também vai na “Especificação”.",
        ],
      },
      {
        version: "2.0.6",
        date: "11/11/2026",
        items: [
          "Diário de campo: novo bloco “Amostras do ponto”. Cada amostra (água, solo, ar, tecido ou plâncton) ganha o código da etiqueta, como YVA-071126-0136-AG1, montado pela data e pelo ponto. Em “Iniciar coleta” ou em “Usar o padrão da campanha”, as amostras já vêm dos padrões de coleta da campanha.",
          "Cada amostra tem profundidade (0 é a superfície), volume ou massa, conservação, acondicionamento e posição na caixa. O acondicionamento usado por último em cada tipo de amostra já vem preenchido no aparelho.",
          "Novo bloco “Parâmetros medidos”: pH, condutividade, temperatura e os demais parâmetros de campo entram como números, com unidade, profundidade, hora e equipamento, e o app avisa quando um valor sai da faixa esperada. “+ Parâmetro” cria um parâmetro que ainda não está na lista, e ele fica disponível para toda a equipe.",
          "Padrões de coleta: agora também marcam os parâmetros medidos em todo ponto da campanha.",
          "Campanhas › Exportar: nova “Planilha para o Biolog (.xlsx)”, com as abas Amostras, Parâmetros e Catálogo de parâmetros. Antes de gerar, ela mostra o que o Biolog recusaria (registro sem hora, sem coordenada ou sem ponto) e o que vale conferir.",
          "Depois que uma amostra sai na planilha do Biolog, o código dela não muda mais, mesmo que a data ou o ponto do registro sejam corrigidos.",
        ],
      },
      {
        version: "2.0.5",
        date: "11/11/2026",
        items: [
          "Diário de campo: novo botão “Iniciar coleta”. Ao chegar no ponto, um toque grava a hora e a data do relógio do celular e a latitude e a longitude pelo GPS, sem digitar. “Ler o GPS de novo” atualiza só a posição.",
          "Sem sinal de GPS, nada do que já está no registro é trocado: se não havia coordenada, entra a planejada do ponto, com aviso para conferir. Com precisão pior que 100 m o app pede conferência, e a mais de 200 m do ponto planejado avisa e oferece marcar o ponto como realocado.",
          "Num registro que já tem hora, ou que é de outro dia, o app pergunta antes de trocar a hora e a data.",
          "A “Equipe” do último registro feito no aparelho já vem preenchida no registro seguinte.",
          "Central de dados › Fase e etapas: novo painel “Padrões de coleta”, com projeto, laboratório de destino, objetivo, matriz da água e, para cada tipo de amostra (água, solo, ar, tecido e plâncton), quantidade por ponto, conservação, acondicionamento, volume ou massa e profundidade. Vale para as campanhas seguintes até alguém mudar. Esses padrões vão preencher as amostras do registro de campo, que chegam na próxima versão.",
        ],
      },
      {
        version: "2.0.4",
        date: "04/11/2026",
        items: [
          "Diário de campo: o botão “+ Novo registro” voltou a gravar na nuvem. Ele misturava o clique do botão nos dados do registro e o envio falhava com “Sem conexão com o servidor”, embora a internet estivesse normal. O “+ Registrar ponto” já funcionava.",
          "O app passa a enviar só os campos do registro, e um campo estranho não impede mais a gravação.",
          "Quando a foto termina de subir, o formulário não apaga mais o que foi digitado enquanto ela subia.",
        ],
      },
      {
        version: "2.0.3",
        date: "04/11/2026",
        items: [
          "Diário de campo: quando a nuvem recusa um registro, o formulário passa a dizer o motivo (sessão expirada, perfil sem permissão, sem conexão ou recusa do banco) e o que fazer, e os dados preenchidos continuam no formulário.",
          "O botão “Salvar registro” espera a foto terminar de subir e não grava duas vezes com toques repetidos. O erro do envio da foto não some mais quando aparece outro aviso.",
          "O servidor registra no log o motivo de cada gravação recusada pelo banco, para o suporte achar a causa.",
        ],
      },
      {
        version: "2.0.2",
        date: "01/11/2026",
        items: [
          "Banco de dados fechado para quem não entrou no app: tabelas, fotos e documentos só são lidos e gravados por membros com a categoria de acesso certa.",
          "Latitude e longitude agora são números conferidos: aceitam vírgula ou ponto, precisam vir em par e dentro da faixa (latitude de -90 a 90, longitude de -180 a 180). O formulário, a importação e o banco avisam em português quando algo não confere.",
          "Nova “Situação do ponto” no Diário de campo: Planejado, Realizado, Não realizado, Realocado ou Bloqueado. Ponto realocado exige o motivo. A situação aparece no formulário, no detalhe do registro, no mapa e na legenda.",
          "Listas do Diário (atividades, condições da água, clima, acesso e ocorrências) alinhadas ao vocabulário padrão. Termos antigos foram trocados pelos novos nos registros e passam a ser trocados também na importação; cada troca ficou no histórico do registro.",
          "Modelos de planilha atualizados com as novas listas e as colunas “Situação do ponto” e “Motivo da realocação”.",
        ],
      },
    ],
  },
  {
    major: 1,
    name: "Versão 1",
    range: "1.0.0 a 1.2.7",
    period: "Maio a agosto de 2026",
    summary:
      "Primeira versão na nuvem: mapa das campanhas, planilhas de campo e de resultados, Diário de campo, documentos, ações pontuais e controle de acesso.",
    areas: [
      {
        title: "Monitoramento",
        items: [
          "Início com mapa de risco por ponto, filtro por classe de risco e evolução do risco entre campanhas.",
          "Painel eDNA da Campanha 1 integrado ao app e resultados das Campanhas 1 e 2 publicados por campanha.",
          "Modelo de planilha de resultados pré-preenchido.",
        ],
      },
      {
        title: "Campo",
        items: [
          "Diário de campo com equipes, fotos e ocorrências; mapa de percurso por dia de coleta.",
          "Importação de planilhas com prévia, conflitos lado a lado, histórico de alterações e campanhas consolidadas protegidas.",
        ],
      },
      {
        title: "Documentos e ações",
        items: [
          "Repositório de documentos e fotos no armazenamento da nuvem.",
          "Ações pontuais com pontos no mapa, evidências e documentos.",
        ],
      },
      {
        title: "Acesso e segurança",
        items: [
          "Entrada com convite e recuperação de senha, categorias de acesso (incluindo Tecpar) e registro de atividades dos membros.",
        ],
      },
    ],
    notes: [
      "A versão 1.2.7 (31/08/2026) é a que está na nuvem até o deploy da versão 2.",
    ],
  },
];

/** Versão principal de um número "X.Y.Z". */
export function majorOf(version: string) {
  const major = Number(version.split(".")[0]);
  return Number.isInteger(major) ? major : null;
}
