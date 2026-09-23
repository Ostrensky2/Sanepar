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
    updates: [],
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
