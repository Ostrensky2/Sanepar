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
      "Resultados recalculados com o novo índice por conjuntos, telas reorganizadas em menos destinos, a seção Ciência e método para explicar cada número e um único caminho para trazer dados de campo.",
    areas: [
      {
        title: "Resultados com o novo índice",
        items: [
          "Índice de 0 a 1 calculado por conjunto analítico (Cianobactérias, Bactérias e COI) e por domínio (ambiental, operacional e saúde humana).",
          "Ponto sem os três conjuntos aparece como parcial, com uma faixa possível no lugar de um valor único, e fica fora de médias e rankings.",
          "Panorama, Prioridades (os 5 pontos que pedem atenção primeiro), Alertas, abas por conjunto com mapa de calor e Evolução entre campanhas.",
          "Ficha de cada ponto: índice, domínios, reads por conjunto, organismos dominantes e o que mais pesou no índice.",
          "Fichas em PDF (síntese ou detalhada) e em XLSX completo, com uma aba “Leitura” no início na mesma ordem da ficha.",
          "Publicação por campanha: a prévia mostra as campanhas do arquivo e só as marcadas são substituídas.",
        ],
      },
      {
        title: "Ciência e método",
        items: [
          "Impactos potenciais: o que a literatura descreve para cada organismo, primeiro os detectados na campanha escolhida, depois o restante do catálogo.",
          "Onde ocorrem e Referências, ligados entre si e à ficha do ponto.",
          "Como o índice é calculado: escolha um ponto e refaça a conta passo a passo com os números dele.",
          "Documento metodológico em PDF.",
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
      { before: "Painel eDNA da Campanha 1 (score de risco)", now: "Campanhas e resultados › Resultados, com o novo índice. Os valores não são comparáveis ao score antigo." },
      { before: "Solicitações", now: "Suporte (contato direto com a equipe)." },
      { before: "Central de dados › Planilhas de campo", now: "Central de dados › Diário de campo › Importar planilha." },
      { before: "Ações pontuais", now: "Atividades complementares (abas Consultar e Registrar)." },
      { before: "Entrada de dados", now: "Central de dados." },
    ],
    notes: [
      "O índice da versão 2 não é comparável ao score de risco do painel da versão 1: a fórmula, a escala e os conjuntos mudaram.",
      "Links antigos continuam funcionando e levam à tela nova correspondente.",
    ],
    updates: [
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
