import { describe, expect, it } from "vitest";
import {
  type CampaignOperationalStatus,
  getCurrentCampaignStage,
  defaultMetabarcodingStages,
} from "../campaign-management";
import type {
  MetabarcodingStage,
  MetabarcodingStageStatus,
} from "../../components/metabarcoding-stages";


// Helper functions and proposed logic
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

function countAdvancedStagesForStatusProposed(
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

function calculateCampaignProgressProposed(
  stages: MetabarcodingStage[],
  status: CampaignOperationalStatus,
) {
  const hasStarted = stages.some((stage) => stage.status === "done" || stage.status === "inprogress");
  const activeStatus = (status === "Aguardando calendário" || status === "Não previsto") && hasStarted
    ? "Planejada"
    : status;

  if (["Não previsto", "Aguardando calendário", "Suspensa", "Cancelada"].includes(activeStatus)) return 0;
  if (!stages.length) return 0;

  const advancedStages = countAdvancedStagesForStatusProposed(stages, activeStatus);
  return Math.round((advancedStages / stages.length) * 100);
}

describe("calculateCampaignProgressProposed with 5% weight", () => {
  it("calcula 0% com todos pendentes", () => {
    const stages: MetabarcodingStage[] = [
      { label: "Planejamento da campanha", status: "pending" },
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

    expect(calculateCampaignProgressProposed(stages, "Planejada")).toBe(0);
    expect(calculateCampaignProgressProposed(stages, "Aguardando calendário")).toBe(0);
  });

  it("calcula 5% com planejamento em andamento", () => {
    const stages: MetabarcodingStage[] = [
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

    expect(calculateCampaignProgressProposed(stages, "Planejada")).toBe(5);
    expect(calculateCampaignProgressProposed(stages, "Aguardando calendário")).toBe(5);
  });

  it("calcula 10% com planejamento concluido", () => {
    const stages: MetabarcodingStage[] = [
      { label: "Planejamento da campanha", status: "done" },
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

    expect(calculateCampaignProgressProposed(stages, "Planejada")).toBe(10);
    expect(calculateCampaignProgressProposed(stages, "Aguardando calendário")).toBe(10);
  });

  it("calcula 15% com planejamento concluido e preparacao em andamento", () => {
    const stages: MetabarcodingStage[] = [
      { label: "Planejamento da campanha", status: "done" },
      { label: "Preparação da campanha", status: "inprogress" },
      { label: "Coleta de amostras", status: "pending" },
      { label: "Extração de DNA", status: "pending" },
      { label: "Amplificação por PCR", status: "pending" },
      { label: "Sequenciamento", status: "pending" },
      { label: "Análise bioinformática", status: "pending" },
      { label: "Atribuição taxonômica", status: "pending" },
      { label: "Conclusão das análises dos dados", status: "pending" },
      { label: "Elaboração de relatório", status: "pending" },
    ];

    expect(calculateCampaignProgressProposed(stages, "Planejada")).toBe(10); // Capped at 1.0 (Planejada)
    expect(calculateCampaignProgressProposed(stages, "Em preparação")).toBe(15); // Capped at 2.0 (Em preparação)
    expect(calculateCampaignProgressProposed(stages, "Aguardando calendário")).toBe(10); // Auto-activates to Planejada, capped at 1.0
  });

  it("calcula 20% com planejamento e preparacao concluidos", () => {
    const stages: MetabarcodingStage[] = [
      { label: "Planejamento da campanha", status: "done" },
      { label: "Preparação da campanha", status: "done" },
      { label: "Coleta de amostras", status: "pending" },
      { label: "Extração de DNA", status: "pending" },
      { label: "Amplificação por PCR", status: "pending" },
      { label: "Sequenciamento", status: "pending" },
      { label: "Análise bioinformática", status: "pending" },
      { label: "Atribuição taxonômica", status: "pending" },
      { label: "Conclusão das análises dos dados", status: "pending" },
      { label: "Elaboração de relatório", status: "pending" },
    ];

    expect(calculateCampaignProgressProposed(stages, "Planejada")).toBe(10); // Capped at 1.0 (Planejada)
    expect(calculateCampaignProgressProposed(stages, "Em preparação")).toBe(20); // Capped at 2.0 (Em preparação)
  });
});
