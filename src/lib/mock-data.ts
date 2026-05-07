import type {
  AccessProfile,
  Campaign,
  ExecutiveMetric,
  GovernanceRule,
  ImportSource,
  MonitoringPoint,
  PartnerUpdate,
  RepositoryDocument,
} from "@/lib/types";

export const executiveMetrics: ExecutiveMetric[] = [
  {
    label: "Pontos monitorados",
    value: "324",
    detail: "18 receberam atualização técnica nesta semana",
    tone: "primary",
  },
  {
    label: "Campanhas em curso",
    value: "2",
    detail: "1 em consolidação e 1 em campo",
    tone: "warning",
  },
  {
    label: "Documentos publicados",
    value: "81",
    detail: "Repositório compartilhado com rastreabilidade",
    tone: "success",
  },
  {
    label: "Fontes de dados ativas",
    value: "6",
    detail: "Planilhas locais, Dropbox e Supabase",
    tone: "neutral",
  },
];

export const campaigns: Campaign[] = [
  {
    id: "CP-2026-01",
    name: "Campanha sazonal de verão",
    status: "publicada",
    period: "jan 2026 - fev 2026",
    objective: "Consolidar resultados de qualidade hídrica e disponibilidade de anexos técnicos.",
    plannedPoints: 128,
    deliveredDocuments: 14,
    lastUpdate: "2026-03-26",
  },
  {
    id: "CP-2026-02",
    name: "Campanha de transição operacional",
    status: "em_campo",
    period: "mar 2026 - abr 2026",
    objective: "Atualizar pontos com maior criticidade, revisar evidências fotográficas e mapear pendências.",
    plannedPoints: 96,
    deliveredDocuments: 6,
    lastUpdate: "2026-03-31",
  },
  {
    id: "CP-2026-03",
    name: "Campanha de outono regulamentar",
    status: "planejada",
    period: "mai 2026 - jun 2026",
    objective: "Preparar o cronograma regulatório e a publicação do pacote comparativo para a Sanepar.",
    plannedPoints: 140,
    deliveredDocuments: 0,
    lastUpdate: "2026-03-29",
  },
];

export const monitoringPoints: MonitoringPoint[] = [
  {
    code: "SIA-0142",
    municipality: "Curitiba",
    className: "Classe II",
    status: "estavel",
    latestCampaign: "Campanha de transição operacional",
    findings: "Sem inconformidades. Evidência fotográfica atualizada.",
    attachments: 5,
    updatedAt: "2026-03-31",
  },
  {
    code: "SIA-0204",
    municipality: "São José dos Pinhais",
    className: "Classe I",
    status: "alerta",
    latestCampaign: "Campanha de transição operacional",
    findings: "Necessita revisão de anexo e confirmação de coordenadas.",
    attachments: 2,
    updatedAt: "2026-03-30",
  },
  {
    code: "SIA-0311",
    municipality: "Araucária",
    className: "Classe III",
    status: "revisao",
    latestCampaign: "Campanha sazonal de verão",
    findings: "Planilha trouxe divergência entre código de campo e código institucional.",
    attachments: 3,
    updatedAt: "2026-03-27",
  },
  {
    code: "SIA-0448",
    municipality: "Campo Largo",
    className: "Classe II",
    status: "estavel",
    latestCampaign: "Campanha sazonal de verão",
    findings: "Última vistoria homologada e publicada.",
    attachments: 7,
    updatedAt: "2026-03-24",
  },
];

export const repositoryDocuments: RepositoryDocument[] = [
  {
    title: "Relatório técnico consolidado - fevereiro",
    category: "Relatório",
    audience: "Compartilhado",
    status: "publicado",
    source: "Dropbox / Relatórios Oficiais",
    updatedAt: "2026-03-25",
  },
  {
    title: "Matriz de pontos com criticidade",
    category: "Base analítica",
    audience: "ATGC",
    status: "interno",
    source: "Dropbox / Bases Curadas",
    updatedAt: "2026-03-30",
  },
  {
    title: "Painel executivo para reunião mensal",
    category: "Apresentação",
    audience: "Sanepar",
    status: "revisao",
    source: "Supabase Storage / Publicações",
    updatedAt: "2026-03-31",
  },
  {
    title: "Registro fotográfico dos pontos prioritários",
    category: "Anexo visual",
    audience: "Compartilhado",
    status: "publicado",
    source: "Dropbox / Evidências",
    updatedAt: "2026-03-29",
  },
];

export const importSources: ImportSource[] = [
  {
    name: "Planilha mestra de pontos",
    channel: "Upload manual de Excel",
    cadence: "Semanal",
    owner: "ATGC",
    lastRun: "2026-03-31",
    status: "pronto",
    costNote: "Curadoria local e subida apenas dos dados necessários.",
  },
  {
    name: "Repositório de anexos pesados",
    channel: "Dropbox compartilhado",
    cadence: "Sob demanda",
    owner: "ATGC",
    lastRun: "2026-03-30",
    status: "manual",
    costNote: "Arquivos grandes permanecem fora da Vercel e do Supabase.",
  },
  {
    name: "Indicadores publicados",
    channel: "Supabase",
    cadence: "Diária",
    owner: "Aplicação",
    lastRun: "2026-03-31",
    status: "aguardando",
    costNote: "Persistência apenas de metadados e recortes operacionais.",
  },
];

export const partnerUpdates: PartnerUpdate[] = [
  {
    title: "Painel executivo pronto para a reunião mensal",
    summary: "Os resultados consolidados de março foram preparados para consulta da Sanepar com foco em pontos, documentos e pendências.",
    audience: "Sanepar",
    updatedAt: "2026-03-31",
  },
  {
    title: "Fila de importação organizada por prioridade",
    summary: "A ATGC passa a tratar localmente as planilhas grandes e publicar somente o recorte operacional necessário na nuvem.",
    audience: "ATGC + Sanepar",
    updatedAt: "2026-03-30",
  },
  {
    title: "Repositório de documentos com trilha de publicação",
    summary: "Cada entrega passa a indicar origem, público-alvo e situação de disponibilização sem inflar custo de armazenamento.",
    audience: "ATGC + Sanepar",
    updatedAt: "2026-03-29",
  },
];

export const governanceRules: GovernanceRule[] = [
  {
    title: "Entrada de dados controlada",
    description:
      "A nuvem recebe apenas inserções autorizadas por perfis curadores. O restante do público consome informações e documentos.",
    owner: "ATGC",
  },
  {
    title: "Arquivos pesados fora da camada web",
    description:
      "Dropbox segue como origem de arquivos grandes. O app publica links, metadados e recortes estratégicos.",
    owner: "ATGC + TI",
  },
  {
    title: "Supabase como base operacional enxuta",
    description:
      "Persistir indicadores, entidades principais, histórico de importação e controle de acesso. Evitar duplicação de binários desnecessários.",
    owner: "Produto",
  },
];

export const accessProfiles: AccessProfile[] = [
  {
    name: "Curadoria ATGC",
    scope: "Importa dados, publica documentos e mantém referências operacionais.",
    permissions: ["importar planilhas", "revisar inconsistências", "publicar atualizações"],
  },
  {
    name: "Leitura Sanepar",
    scope: "Acompanha andamento, resultados e documentos homologados.",
    permissions: ["visualizar indicadores", "baixar documentos publicados", "acompanhar campanhas"],
  },
  {
    name: "Administrador técnico",
    scope: "Configura conexões, variáveis e política de persistência.",
    permissions: ["gerir nuvem", "ajustar perfis", "diagnosticar integrações"],
  },
];
