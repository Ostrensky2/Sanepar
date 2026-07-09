import type {
  MetabarcodingStageStatus,
} from "@/components/metabarcoding-stages";
import type { MetabarcodingStage } from "@/components/metabarcoding-stages";
export type { MetabarcodingStage };
import { canUseBrowserOnlyPersistence } from "@/lib/browser-persistence";

export type CampaignOperationalStatus =
  | "Não previsto"
  | "Planejada"
  | "Aguardando calendário"
  | "Em preparação"
  | "Em campo"
  | "Coleta concluída"
  | "Aguardando laboratório"
  | "Em análise"
  | "Resultados publicados"
  | "Concluída"
  | "Suspensa"
  | "Cancelada";

export type CampaignView = {
  id: string;
  selectorLabel: string;
  title: string;
  period: string;
  status: CampaignOperationalStatus;
  description: string;
  hasFieldData: boolean;
  hasResultData: boolean;
  resultsDashboardUrl?: string;
  metrics: {
    plannedPoints: string;
    effectivePoints: string;
    fieldRows: string;
    resultRows: string;
  };
};

export type CampaignManagement = {
  status: CampaignOperationalStatus;
  period: string;
  plannedPoints: string;
  stageTitle: string;
  stages: MetabarcodingStage[];
  note: string;
};

export type CampaignManagementById = Record<string, CampaignManagement>;

export const CAMPAIGN_MANAGEMENT_STORAGE_KEY = "yvae:campaign-management-v1";

export const operationalStatusOptions: CampaignOperationalStatus[] = [
  "Não previsto",
  "Planejada",
  "Aguardando calendário",
  "Em preparação",
  "Em campo",
  "Coleta concluída",
  "Aguardando laboratório",
  "Em análise",
  "Resultados publicados",
  "Concluída",
  "Suspensa",
  "Cancelada",
];

export const stageStatusOptions: Array<{ value: MetabarcodingStageStatus; label: string }> = [
  { value: "pending", label: "A fazer" },
  { value: "inprogress", label: "Em curso" },
  { value: "done", label: "Concluída" },
];

export const defaultMetabarcodingStages: MetabarcodingStage[] = [
  { label: "Planejamento da campanha", status: "done" },
  { label: "Preparação da campanha", status: "done" },
  { label: "Coleta de amostras", status: "done", completedDate: "2026-03-20" },
  { label: "Extração de DNA", status: "done" },
  { label: "Amplificação por PCR", status: "done" },
  { label: "Sequenciamento", status: "done" },
  { label: "Análise bioinformática", status: "inprogress" },
  { label: "Atribuição taxonômica", status: "pending" },
  { label: "Conclusão das análises dos dados", status: "pending" },
  { label: "Elaboração de relatório", status: "pending" },
];

export const plannedMetabarcodingStages: MetabarcodingStage[] = [
  { label: "Planejamento da campanha", status: "inprogress" },
  { label: "Preparação da campanha", status: "pending" },
  { label: "Coleta de amostras", status: "pending" },
  { label: "Extração de DNA", status: "pending" },
  { label: "Amplificação por PCR", status: "pending" },
  { label: "Sequenciamento", status: "pending" },
  { label: "Análise bioinformática", status: "pending" },
  { label: "Atribuição taxonômica", status: "pending" },
  { label: "Conclusão das análises dos dados", status: "pending" },
  { label: "Elaboração de relatório", status: "pending" },
];

export const defaultCampaigns: CampaignView[] = [
  {
    id: "campanha-1-verao-2026",
    selectorLabel: "1ª Campanha - Verão 2026",
    title: "1ª Campanha - Verão 2026",
    period: "Realizada no Verão de 2026",
    status: "Em análise",
    description:
      "Dados de campo da primeira campanha sazonal. O dashboard de resultados eDNA está disponível para consulta.",
    hasFieldData: true,
    hasResultData: true,
    resultsDashboardUrl: "/dashboards/Painel_eDNA_Campanha1_Sanepar.html",
    metrics: {
      plannedPoints: "81",
      effectivePoints: "76",
      fieldRows: "76",
      resultRows: "eDNA",
    },
  },
  {
    id: "campanha-2-outono-2026",
    selectorLabel: "2ª Campanha - Outono 2026",
    title: "2ª Campanha - Outono 2026",
    period: "Em preparação técnica",
    status: "Em preparação",
    description:
      "Campanha com pontos e datas planejados, ainda sem coleta de campo realizada.",
    hasFieldData: false,
    hasResultData: false,
    metrics: {
      plannedPoints: "81",
      effectivePoints: "0",
      fieldRows: "0",
      resultRows: "0",
    },
  },
  ...[
    "3ª Campanha - Inverno 2026",
    "4ª Campanha - Primavera 2026",
    "5ª Campanha - Verão 2027",
    "6ª Campanha - Outono 2027",
    "7ª Campanha - Inverno 2027",
    "8ª Campanha - Primavera 2027",
    "9ª Campanha - Verão 2028",
  ].map((label, index) => ({
    id: `campanha-${index + 3}`,
    selectorLabel: label,
    title: label,
    period: "Aguardando calendário técnico",
    status: "Aguardando calendário" as const,
    description:
      "Campanha sazonal prevista. A visualização será liberada quando os dados forem importados pela aba Dados.",
    hasFieldData: false,
    hasResultData: false,
    metrics: {
      plannedPoints: "81",
      effectivePoints: "0",
      fieldRows: "0",
      resultRows: "0",
    },
  })),
];

export function buildInitialCampaignManagement(campaigns: CampaignView[]) {
  if (typeof window === "undefined" || !canUseBrowserOnlyPersistence()) {
    return buildDefaultCampaignManagementById(campaigns);
  }

  return loadCampaignManagement(campaigns);
}

export async function readCampaignManagement(campaigns: CampaignView[]) {
  const defaults = buildDefaultCampaignManagementById(campaigns);

  try {
    const response = await fetch("/api/campaign-management", { cache: "no-store" });
    const payload = (await response.json()) as {
      management?: unknown;
      persistence?: "browser" | "cloud";
    };

    if (response.ok && payload.persistence === "cloud" && payload.management) {
      const management = normalizeCampaignManagementById(campaigns, payload.management);
      cacheCampaignManagement(management, { notify: false });
      return management;
    }
  } catch {
    // Fall back below according to runtime.
  }

  return canUseBrowserOnlyPersistence() ? loadCampaignManagement(campaigns) : defaults;
}

export function loadCampaignManagement(campaigns: CampaignView[]) {
  const defaults = buildDefaultCampaignManagementById(campaigns);
  const stored = window.localStorage.getItem(CAMPAIGN_MANAGEMENT_STORAGE_KEY);

  if (!stored) return defaults;

  try {
    return normalizeCampaignManagementById(campaigns, JSON.parse(stored));
  } catch {
    return defaults;
  }
}

export async function saveCampaignManagement(management: CampaignManagementById) {
  try {
    const response = await fetch("/api/campaign-management", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ management }),
    });

    if (response.ok) {
      cacheCampaignManagement(management);
      return { ok: true, persistence: "cloud" as const };
    }
  } catch {
    // Fall back below according to runtime.
  }

  if (canUseBrowserOnlyPersistence()) {
    cacheCampaignManagement(management);
    return { ok: true, persistence: "browser" as const };
  }

  return { ok: false, persistence: "none" as const };
}

export function cacheCampaignManagement(
  management: CampaignManagementById,
  options: { notify?: boolean } = {},
) {
  window.localStorage.setItem(CAMPAIGN_MANAGEMENT_STORAGE_KEY, JSON.stringify(management));
  if (options.notify ?? true) {
    window.dispatchEvent(new Event("yvae:campaign-management-updated"));
  }
}

function normalizeCampaignManagementById(
  campaigns: CampaignView[],
  value: unknown,
) {
  const defaults = buildDefaultCampaignManagementById(campaigns);
  const parsed = isRecord(value) ? value as Partial<CampaignManagementById> : {};

  return Object.fromEntries(
    campaigns.map((campaign) => {
      const fallback = defaults[campaign.id];
      const saved = parsed[campaign.id];
      const storedStatus = saved?.status ?? fallback.status;
      const stages = saved?.stages?.length ? saved.stages : fallback.stages;
      const normalizedStages = normalizeStoredStages(stages, storedStatus);
      const status = normalizeCampaignStatus(storedStatus, normalizedStages);

      return [
        campaign.id,
        {
          ...fallback,
          ...saved,
          status,
          stages: normalizedStages,
        },
      ];
    }),
  ) as CampaignManagementById;
}

function isRecord(value: unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function buildDefaultCampaignManagementById(campaigns: CampaignView[]) {
  return Object.fromEntries(
    campaigns.map((campaign) => [campaign.id, buildDefaultCampaignManagement(campaign)]),
  ) as CampaignManagementById;
}

export function buildDefaultCampaignManagement(campaign: CampaignView): CampaignManagement {
  const isFirstCampaign = campaign.id === "campanha-1-verao-2026";
  const stages = isFirstCampaign ? defaultMetabarcodingStages : plannedMetabarcodingStages;

  return {
    status: campaign.status,
    period: campaign.period,
    plannedPoints: campaign.metrics.plannedPoints,
    stageTitle: isFirstCampaign
      ? "Processo de análise por metabarcoding"
      : "Preparação da campanha e análise por metabarcoding",
    stages: stages.map((stage) => ({ ...stage })),
    note: campaign.description,
  };
}

export function calculateStageProgress(stages: MetabarcodingStage[]) {
  if (!stages.length) return 0;
  const advancedUnits = countStageProgressUnits(stages);
  return Math.round((advancedUnits / stages.length) * 100);
}

export function calculateCampaignProgress(
  stages: MetabarcodingStage[],
  status: CampaignOperationalStatus,
) {
  if (isCampaignInactiveForProgress(status)) return 0;
  if (!stages.length) return 0;

  const advancedStages = countAdvancedStagesForStatus(stages, status);
  return Math.round((advancedStages / stages.length) * 100);
}

export function calculateProjectProgress(managementById: CampaignManagementById) {
  let total = 0;
  let completed = 0;

  defaultCampaigns.forEach((campaign) => {
    const management = managementById[campaign.id];
    const stages = management?.stages ?? defaultMetabarcodingStages;
    total += stages.length;
    completed += stages.filter((stage) => stage.status === "done").length;
  });

  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

export function getCurrentCampaignStage(stages: MetabarcodingStage[]) {
  return stages.find((stage) => stage.status === "inprogress");
}

export function getMostAdvancedCampaignStage(stages: MetabarcodingStage[]) {
  return [...stages].reverse().find(
    (stage) => stage.status === "done" || stage.status === "inprogress"
  );
}

function countStageProgressUnits(stages: MetabarcodingStage[]) {
  return stages.reduce((acc, stage) => {
    if (stage.status === "done") return acc + 1;
    if (stage.status === "inprogress") return acc + 0.5;
    return acc;
  }, 0);
}

function getStagePositionWeight(label: string, status: MetabarcodingStageStatus) {
  const position = getStagePosition(label);
  if (position === 0) return 0;
  if (status === "done") return position;
  if (status === "inprogress") return position - 1 + 0.5;
  return 0; // pending
}

function countAdvancedStagesForStatus(
  stages: MetabarcodingStage[],
  status: CampaignOperationalStatus,
) {
  const currentStage = getCurrentCampaignStage(stages);
  const currentStagePositionWeight = currentStage && currentStage.status !== "pending"
    ? getStagePositionWeight(currentStage.label, currentStage.status)
    : 0;
  const advancedStages = Math.max(countStageProgressUnits(stages), currentStagePositionWeight);

  if (status === "Planejada") {
    return Math.min(advancedStages, 1);
  }
  if (status === "Em preparação") {
    return Math.min(advancedStages, 2);
  }

  return advancedStages;
}

function normalizeStoredStages(
  stages: MetabarcodingStage[],
  status: CampaignOperationalStatus,
) {
  const normalizedLengthStages = normalizeStageListLength(stages);

  if (!["Não previsto", "Planejada", "Aguardando calendário", "Em preparação"].includes(status)) {
    return normalizedLengthStages;
  }

  const [planning, points, mobilization] = stages;
  const hasLegacyPlanningState =
    planning?.label === "Planejamento da campanha" &&
    planning.status === "done" &&
    points?.label === "Pontos e datas definidos" &&
    points.status === "done" &&
    mobilization?.label === "Mobilização de campo" &&
    mobilization.status === "inprogress";

  return hasLegacyPlanningState
    ? plannedMetabarcodingStages.map((stage) => ({ ...stage }))
    : normalizedLengthStages;
}

function normalizeCampaignStatus(
  status: CampaignOperationalStatus,
  stages: MetabarcodingStage[],
): CampaignOperationalStatus {
  let currentStatus = status;

  if (status === "Aguardando calendário" || status === "Não previsto") {
    const hasStarted = stages.some((stage) => stage.status === "done" || stage.status === "inprogress");
    if (hasStarted) {
      currentStatus = "Planejada";
    }
  }

  if (
    currentStatus !== "Planejada" &&
    currentStatus !== "Em preparação" &&
    currentStatus !== "Em campo" &&
    currentStatus !== "Coleta concluída" &&
    currentStatus !== "Aguardando laboratório" &&
    currentStatus !== "Em análise"
  ) {
    return currentStatus;
  }

  const currentStage = getCurrentCampaignStage(stages);

  if (currentStage && getStagePosition(currentStage.label) >= getStagePosition("Análise bioinformática")) {
    return "Em análise";
  }

  if (currentStage && getStagePosition(currentStage.label) >= getStagePosition("Extração de DNA")) {
    return "Coleta concluída";
  }

  if (currentStage && getStagePosition(currentStage.label) >= getStagePosition("Coleta de amostras")) {
    return "Em campo";
  }

  if (currentStatus === "Planejada" || currentStatus === "Em preparação") {
    const prepStage = stages.find((stage) => normalizeStageKey(stage.label) === normalizeStageKey("Preparação da campanha"));
    if (prepStage && (prepStage.status === "done" || prepStage.status === "inprogress")) {
      return "Em preparação";
    }
    return "Planejada";
  }

  return currentStatus;
}

function normalizeStageListLength(stages: MetabarcodingStage[]) {
  const byLabel = new Map(
    stages.map((stage) => {
      const normalizedStage = normalizeStageLabel(stage);
      return [normalizeStageKey(normalizedStage.label), normalizedStage];
    }),
  );
  const hasStartedFieldWork = stages.some((stage) =>
    ["Coleta de amostras", "Extração de DNA", "Amplificação por PCR", "Sequenciamento"].includes(stage.label) &&
    stage.status === "done",
  );
  const template = hasStartedFieldWork ? defaultMetabarcodingStages : plannedMetabarcodingStages;

  return template.map((templateStage) => {
    const savedStage = byLabel.get(normalizeStageKey(templateStage.label));
    const legacyBioinformatics = byLabel.get("processamento bioinformatico") ?? byLabel.get("bioinformatica");
    const stage = savedStage ?? (
      templateStage.label === "Análise bioinformática" ? legacyBioinformatics : undefined
    );

    return {
      ...templateStage,
      ...stage,
      label: templateStage.label,
    };
  });
}

function normalizeStageLabel(stage: MetabarcodingStage) {
  if (stage.label === "Processamento bioinformático" || stage.label === "Bioinformática") {
    return { ...stage, label: "Análise bioinformática" };
  }

  if (stage.label === "Resultados publicados") {
    return { ...stage, label: "Conclusão das análises dos dados" };
  }

  return stage;
}

function normalizeStageKey(label: string) {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getStagePosition(label: string) {
  const index = defaultMetabarcodingStages.findIndex(
    (stage) => normalizeStageKey(stage.label) === normalizeStageKey(label),
  );

  return index >= 0 ? index + 1 : 0;
}

export function isCampaignActive(status: CampaignOperationalStatus) {
  return [
    "Planejada",
    "Em preparação",
    "Em campo",
    "Coleta concluída",
    "Aguardando laboratório",
    "Em análise",
  ].includes(status);
}

function isCampaignInactiveForProgress(status: CampaignOperationalStatus) {
  return ["Não previsto", "Aguardando calendário", "Suspensa", "Cancelada"].includes(status);
}

export function hasCampaignCollectionStarted(status: CampaignOperationalStatus) {
  return !["Não previsto", "Planejada", "Aguardando calendário", "Em preparação"].includes(status);
}
