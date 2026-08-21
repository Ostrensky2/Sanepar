import { campaignIdentityKey } from "@/lib/campaign-identity";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";
import { sanitizeCampaignMedia } from "@/lib/imports/media-policy";

export type LaboratoryRiskLevel = "baixo" | "baixoModerado" | "moderado" | "alto";

export const laboratoryRiskColors: Record<LaboratoryRiskLevel, string> = {
  baixo: "#16a34a",
  baixoModerado: "#CDC602",
  moderado: "#FC883A",
  alto: "#FC2D09",
};

export function laboratoryRiskColor(level: LaboratoryRiskLevel) {
  return laboratoryRiskColors[level];
}

export type LaboratoryRiskResultRow = {
  position: number | null;
  sampleId: string;
  pointName: string;
  waterBody: string;
  municipality: string;
  campaignDate: string;
  mainOrganisms: string;
  mainDrivers: string;
  environmentalRisk: string;
  operationalRisk: string;
  sanitaryRisk: string;
  classification: string;
  riskLevel: LaboratoryRiskLevel;
  environmentalRiskLevel: LaboratoryRiskLevel;
  operationalRiskLevel: LaboratoryRiskLevel;
  sanitaryRiskLevel: LaboratoryRiskLevel;
  score: number | null;
  cianoReads: number | null;
  bactReads: number | null;
  coiReads: number | null;
  confidence: string;
  technicalJustification: string;
  recommendations: string;
};

export type LaboratoryRiskPoint = CampaignMapPoint & {
  riskLevel: LaboratoryRiskLevel;
  riskLabel: string;
  riskClassification: string;
  environmentalRisk: string;
  operationalRisk: string;
  sanitaryRisk: string;
  environmentalRiskLevel: LaboratoryRiskLevel;
  operationalRiskLevel: LaboratoryRiskLevel;
  sanitaryRiskLevel: LaboratoryRiskLevel;
  eta: string;
  detectedMarkers: string[];
  ednaSignal: string;
  laboratoryStatus: "homologado";
  resultSummary: string;
  score: number | null;
  confidence: string;
  recommendations: string;
  rankingPosition: number | null;
  sampleId: string;
};

const riskOrder: Record<LaboratoryRiskLevel, number> = {
  baixo: 1,
  baixoModerado: 2,
  moderado: 3,
  alto: 4,
};

export function buildLaboratoryRiskPoints(
  campaignPoints: CampaignMapPoint[],
  resultRows: LaboratoryRiskResultRow[],
): LaboratoryRiskPoint[] {
  const effectivePoints = campaignPoints.filter((point) => point.effective);
  const usedPointIds = new Set<string>();
  const riskPoints: LaboratoryRiskPoint[] = [];

  for (const row of resultRows) {
    const match = findBestCampaignPoint(row, effectivePoints, usedPointIds);

    if (!match) {
      continue;
    }

    usedPointIds.add(match.id);
    riskPoints.push(toLaboratoryRiskPoint(match, row));
  }

  return riskPoints.sort(
    (left, right) =>
      riskOrder[right.riskLevel] - riskOrder[left.riskLevel] ||
      (right.score ?? 0) - (left.score ?? 0) ||
      (left.rankingPosition ?? Number.MAX_SAFE_INTEGER) -
        (right.rankingPosition ?? Number.MAX_SAFE_INTEGER),
  );
}

export function hydrateLaboratoryRiskPointPhotos(
  riskPoints: LaboratoryRiskPoint[],
  campaignPoints: CampaignPhotoSource[],
): LaboratoryRiskPoint[] {
  if (!riskPoints.length || !campaignPoints.length) {
    return riskPoints;
  }

  const fieldPointByPhotoKey = new Map<string, CampaignPhotoSource | null>();

  for (const point of campaignPoints) {
    const key = campaignPhotoMatchKey(point);
    const sanitized = sanitizeCampaignMedia(point);

    if (!key || !sanitized.photoUrl) continue;

    const existing = fieldPointByPhotoKey.get(key);
    if (!fieldPointByPhotoKey.has(key)) {
      fieldPointByPhotoKey.set(key, sanitized);
    } else if (existing?.photoUrl !== sanitized.photoUrl) {
      fieldPointByPhotoKey.set(key, null);
    }
  }

  return riskPoints.map((riskPoint) => {
    const key = campaignPhotoMatchKey(riskPoint);
    const fieldPoint = fieldPointByPhotoKey.get(key);

    if (fieldPointByPhotoKey.has(key) && !fieldPoint) {
      return sanitizeCampaignMedia({ ...riskPoint, photoUrl: "", photos: [] });
    }

    return fieldPoint
      ? sanitizeCampaignMedia({
          ...riskPoint,
          photoUrl: fieldPoint.photoUrl,
          photos: fieldPoint.photos ?? [],
        })
      : sanitizeCampaignMedia(riskPoint);
  });
}

export function normalizeLaboratoryRiskLevel(value: string): LaboratoryRiskLevel {
  const normalized = normalizeText(value);

  if (normalized === "alto" || normalized.includes("risco alto")) {
    return "alto";
  }

  if (normalized === "moderado" || normalized.includes("risco moderado")) {
    return "moderado";
  }

  if (
    normalized.includes("baixo a moderado") ||
    normalized.includes("baixo moderado")
  ) {
    return "baixoModerado";
  }

  return "baixo";
}

export function laboratoryRiskLabel(level: LaboratoryRiskLevel) {
  if (level === "alto") {
    return "Risco alto";
  }

  if (level === "moderado") {
    return "Risco moderado";
  }

  if (level === "baixoModerado") {
    return "Baixo a moderado";
  }

  return "Risco baixo";
}

function toLaboratoryRiskPoint(
  point: CampaignMapPoint,
  row: LaboratoryRiskResultRow,
): LaboratoryRiskPoint {
  return {
    ...point,
    riskLevel: row.riskLevel,
    riskLabel: laboratoryRiskLabel(row.riskLevel),
    riskClassification: row.classification,
    environmentalRisk: row.environmentalRisk,
    operationalRisk: row.operationalRisk,
    sanitaryRisk: row.sanitaryRisk,
    environmentalRiskLevel: row.environmentalRiskLevel,
    operationalRiskLevel: row.operationalRiskLevel,
    sanitaryRiskLevel: row.sanitaryRiskLevel,
    eta: inferEta(row.pointName || row.waterBody || point.waterBody),
    detectedMarkers: detectedMarkers(row),
    ednaSignal: row.classification || laboratoryRiskLabel(row.riskLevel),
    laboratoryStatus: "homologado",
    resultSummary:
      row.technicalJustification ||
      `Classificação integrada ${row.classification.toLowerCase()} com escore ${
        row.score?.toFixed(3) ?? "não informado"
      }.`,
    score: row.score,
    confidence: row.confidence,
    recommendations: row.recommendations,
    rankingPosition: row.position,
    sampleId: row.sampleId,
  };
}

function findBestCampaignPoint(
  row: LaboratoryRiskResultRow,
  points: CampaignMapPoint[],
  usedPointIds: Set<string>,
) {
  let best: { point: CampaignMapPoint; score: number } | null = null;

  for (const point of points) {
    if (usedPointIds.has(point.id)) {
      continue;
    }

    const score = matchScore(row, point);

    if (!best || score > best.score) {
      best = { point, score };
    }
  }

  return best && best.score >= 60 ? best.point : null;
}

function matchScore(row: LaboratoryRiskResultRow, point: CampaignMapPoint) {
  let score = 0;
  const rowMunicipality = normalizeText(row.municipality);
  const pointMunicipality = normalizeText(point.municipality);

  if (rowMunicipality && pointMunicipality === rowMunicipality) {
    score += 40;
  } else if (rowMunicipality && pointMunicipality.includes(rowMunicipality)) {
    score += 20;
  }

  const rowNames = [row.pointName, row.waterBody].map(normalizePointName);
  const pointNames = [point.waterBody, point.point, point.code].map(normalizePointName);
  let nameScore = 0;

  for (const rowName of rowNames) {
    for (const pointName of pointNames) {
      if (!rowName || !pointName) {
        continue;
      }

      if (rowName === pointName) {
        nameScore = Math.max(nameScore, 45);
      } else if (
        (rowName.length > 5 && pointName.includes(rowName)) ||
        (pointName.length > 5 && rowName.includes(pointName))
      ) {
        nameScore = Math.max(nameScore, 30);
      }
    }
  }

  score += nameScore;

  const numericPrefix = `${row.pointName} ${row.waterBody}`.match(/\d+/)?.[0];

  if (
    numericPrefix &&
    [point.waterBody, point.point, point.code].some((value) =>
      String(value ?? "").includes(numericPrefix),
    )
  ) {
    score += 15;
  }

  return score;
}

type CampaignPhotoSource = Pick<CampaignMapPoint, "campaign" | "code" | "photoUrl" | "photos">;

function campaignPhotoMatchKey(point: Pick<CampaignMapPoint, "campaign" | "code">) {
  const campaignKey = campaignIdentityKey(null, point.campaign);
  const pointKey = normalizeSiaKey(point.code);

  return campaignKey && pointKey ? `${campaignKey}|${pointKey}` : "";
}

function normalizeSiaKey(value: string | undefined) {
  const normalized = normalizeText(value);
  const matches = normalized.match(/\d+/g);

  return matches?.length === 1 ? `sia:${Number(matches[0])}` : "";
}

function detectedMarkers(row: LaboratoryRiskResultRow) {
  const markers = [
    formatReads("Ciano", row.cianoReads),
    formatReads("Bact.", row.bactReads),
    formatReads("COI", row.coiReads),
  ].filter((marker): marker is string => Boolean(marker));

  return markers.length ? markers : ["Marcadores eDNA consolidados"];
}

function formatReads(label: string, reads: number | null) {
  if (reads === null || !Number.isFinite(reads)) {
    return null;
  }

  return `${label}: ${new Intl.NumberFormat("pt-BR").format(reads)} reads`;
}

function inferEta(value: string) {
  const withoutCode = value.replace(/^\s*\d+\s*[-–]?\s*/, "").trim();
  const match = withoutCode.match(/(?:capta[cç][aã]o\s+)?eta\s+(.+)/i);

  if (match?.[1]) {
    return `ETA ${match[1].trim()}`;
  }

  return withoutCode || "Ponto SIA";
}

function normalizePointName(value: string | undefined) {
  return normalizeText(value)
    .replace(/^\d+\s+/, "")
    .replace(/\b(captacao|eta|rio|ribeirao|reservatorio|represa|ponto)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value: string | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bsia\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
