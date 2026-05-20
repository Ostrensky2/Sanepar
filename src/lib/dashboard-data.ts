import bundledCampaignMapPoints from "@/data/campaign-map-points.json";
import {
  readCampaignWorkbookFromPath,
  type CampaignMapPoint,
} from "@/lib/imports/campaigns";
import { getLatestPublishedCampaignImport } from "@/lib/supabase";

const CAMPAIGN_SYNTHESIS_WORKBOOK_PATH =
  "D:/Dropbox/Sanepar_única/Campo/Campanhas/Campanhas_ Planilha sintese.xlsx";

export type DashboardData = {
  campaignPoints: CampaignMapPoint[];
  laboratoryRiskPoints: LaboratoryRiskPoint[];
  campaignSummary: {
    source: string;
    totalCampaigns: number;
    completedCampaigns: number;
    activeCampaigns: number;
    period: string;
    rowCount: number;
  };
  pointSummary: {
    total: number;
    original: number;
    effective: number;
  };
};

export type LaboratoryRiskLevel = "baixo" | "medio" | "alto";

export type LaboratoryRiskPoint = CampaignMapPoint & {
  riskLevel: LaboratoryRiskLevel;
  riskLabel: string;
  eta: string;
  detectedMarkers: string[];
  ednaSignal: string;
  laboratoryStatus: "simulado" | "homologado";
  resultSummary: string;
};

export async function loadDashboardData(): Promise<DashboardData> {
  const campaignImport = await loadCampaignImport();
  const campaignPoints = campaignImport.points;

  return {
    campaignPoints,
    laboratoryRiskPoints: buildLaboratoryRiskPoints(campaignPoints),
    campaignSummary: buildCampaignSummary(campaignPoints, campaignImport),
    pointSummary: {
      total: campaignPoints.length,
      original: campaignPoints.filter((point) => point.original).length,
      effective: campaignPoints.filter((point) => point.effective).length,
    },
  };
}

function buildLaboratoryRiskPoints(campaignPoints: CampaignMapPoint[]): LaboratoryRiskPoint[] {
  return campaignPoints
    .filter((point) => point.effective)
    .map((point, index) => {
      const riskLevel = inferRiskLevel(point, index);
      const eta = inferEta(point);

      return {
        ...point,
        riskLevel,
        riskLabel: riskLabel(riskLevel),
        eta,
        detectedMarkers: detectedMarkers(riskLevel),
        ednaSignal: ednaSignal(riskLevel),
        laboratoryStatus: "simulado",
        resultSummary:
          "Registro preparado para receber resultados laboratoriais de eDNA. O grau de risco será substituído pelos dados homologados assim que a planilha de análise laboratorial estiver disponível.",
      };
    });
}

function inferRiskLevel(point: CampaignMapPoint, index: number): LaboratoryRiskLevel {
  const seed = `${point.code}-${point.campaign}-${point.municipality}`
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), index);
  const bucket = seed % 6;

  if (bucket === 0) {
    return "alto";
  }

  if (bucket <= 2) {
    return "medio";
  }

  return "baixo";
}

function inferEta(point: CampaignMapPoint) {
  const source = point.waterBody || point.municipality || point.code;
  const compact = source
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 3)
    .join(" ");

  return compact ? `ETA ${compact}` : "ETA vinculada ao SIA";
}

function riskLabel(level: LaboratoryRiskLevel) {
  if (level === "alto") {
    return "Risco alto";
  }

  if (level === "medio") {
    return "Risco moderado";
  }

  return "Risco baixo";
}

function detectedMarkers(level: LaboratoryRiskLevel) {
  if (level === "alto") {
    return ["Sinal eDNA elevado", "Marcadores críticos", "Reamostragem recomendada"];
  }

  if (level === "medio") {
    return ["Sinal eDNA intermediário", "Marcadores sob observação"];
  }

  return ["Sinal eDNA baixo", "Sem marcador crítico"];
}

function ednaSignal(level: LaboratoryRiskLevel) {
  if (level === "alto") {
    return "Alto";
  }

  if (level === "medio") {
    return "Intermediário";
  }

  return "Baixo";
}

async function loadCampaignImport() {
  const publishedImport = await getLatestPublishedCampaignImport();

  if (publishedImport?.points?.length) {
    return {
      points: publishedImport.points,
      rowCount: publishedImport.row_count,
      source: `Supabase / ${publishedImport.file_name}`,
    };
  }

  const synthesisImport = await readCampaignWorkbookFromPath(
    CAMPAIGN_SYNTHESIS_WORKBOOK_PATH,
    "Campanhas_ Planilha sintese.xlsx",
  ).catch(() => null);

  if (synthesisImport?.points.length) {
    return {
      points: synthesisImport.points,
      rowCount: synthesisImport.rowCount,
      source: CAMPAIGN_SYNTHESIS_WORKBOOK_PATH,
    };
  }

  const points = bundledCampaignMapPoints as CampaignMapPoint[];

  return {
    points,
    rowCount: points.length,
    source: "Base local embarcada",
  };
}

function buildCampaignSummary(
  campaignPoints: CampaignMapPoint[],
  campaignImport: { rowCount: number; source: string },
) {
  const campaigns = new Map<string, CampaignMapPoint[]>();

  for (const point of campaignPoints) {
    const campaign = point.campaign.trim() || "Campanha sem identificação";
    campaigns.set(campaign, [...(campaigns.get(campaign) ?? []), point]);
  }

  const completedCampaigns = [...campaigns.values()].filter(
    (points) => points.length > 0 && points.every((point) => point.effective),
  ).length;

  return {
    source: campaignImport.source,
    totalCampaigns: campaigns.size,
    completedCampaigns,
    activeCampaigns: Math.max(campaigns.size - completedCampaigns, 0),
    period: formatPointPeriod(campaignPoints),
    rowCount: campaignImport.rowCount,
  };
}

function formatPointPeriod(points: CampaignMapPoint[]) {
  const dates = points
    .map((point) => parsePointDate(point.date))
    .filter((date): date is Date => date !== null)
    .sort((left, right) => left.getTime() - right.getTime());

  if (!dates.length) {
    return "período não informado";
  }

  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];

  if (firstDate.getTime() === lastDate.getTime()) {
    return formatDate(firstDate);
  }

  return `${formatDate(firstDate)} a ${formatDate(lastDate)}`;
}

function parsePointDate(value: string) {
  const trimmedValue = value.trim();
  const brazilianDate = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmedValue);

  if (brazilianDate) {
    const [, day, month, year] = brazilianDate;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const date = new Date(trimmedValue);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}
