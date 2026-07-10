import {
  fieldDiaryStatusOptions,
  followUpOptions,
  pointAccessibilityOptions,
  weatherConditionOptions,
  type FieldDiaryPayload,
} from "@/lib/field-diary";
import { resolveCanonicalCampaign } from "@/lib/campaign-identity";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";

export function campaignPointToFieldDiaryPayload(point: CampaignMapPoint): FieldDiaryPayload | null {
  const coordinates = point.effective ?? point.original;
  const sia = normalizeSia(point.code);

  if (!sia && !coordinates) {
    return null;
  }

  const entryDate = parseImportDate(point.date);
  const canonicalCampaign = resolveCanonicalCampaign(point.campaign);

  return {
    campaignId: canonicalCampaign?.id ?? null,
    campaignName: canonicalCampaign?.name ?? point.campaign ?? "Campanha",
    campaignDay: Number.parseInt(point.day, 10) || 1,
    entryDate,
    fieldTeamName: "",
    fieldTeamMembers: [],
    collectionTime: point.collectionTime || "",
    createdByName: point.createdByName || null,
    locationName: point.waterBody || point.point || sia || "Ponto de campanha",
    sia,
    samplesReplicasEdna: point.samplesReplicasEdna || "",
    zooplanktonId: point.zooplanktonId || "",
    latitude: coordinates ? String(coordinates.lat) : null,
    longitude: coordinates ? String(coordinates.lon) : null,
    municipality: point.municipality || "Paraná",
    activities: point.activities?.length ? point.activities : ["Coleta realizada"],
    waterVisualConditions: splitWaterVisualConditions(point.waterAspect),
    hasOccurrence: Boolean(point.hasOccurrence),
    occurrenceType: point.hasOccurrence ? point.occurrenceType || null : null,
    occurrenceDescription: point.hasOccurrence ? point.occurrenceDescription || null : null,
    requiresFollowUp: normalizeFollowUp(point.requiresFollowUp ?? ""),
    followUpNotes: point.followUpNotes || null,
    weatherConditions: normalizeWeatherCondition(point.weatherConditions),
    pointAccessibility: normalizePointAccessibility(point.accessibility),
    dailySummary: point.dailySummary || point.problems || "",
    status: normalizeStatus(point.status ?? ""),
    createdBy: null,
    photos: point.photos ?? [],
    collectionOrder: point.collectionOrder ?? null,
  };
}

// Coluna "Condições visuais da água (;)": multisseleção separada por ";".
function splitWaterVisualConditions(value: string | undefined) {
  return String(value ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter((item) => item && item !== "Não informado");
}

function normalizeSia(value: string) {
  const digits = String(value ?? "").match(/\d+/g)?.join("") ?? "";
  return digits ? `SIA-${digits.padStart(4, "0")}` : "";
}

function parseImportDate(value: string) {
  const raw = String(value ?? "").trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return new Date().toISOString().slice(0, 10);
}

function normalizeFollowUp(value: string): FieldDiaryPayload["requiresFollowUp"] {
  return followUpOptions.find((option) => option === value) ?? "Não";
}

function normalizeStatus(value: string): FieldDiaryPayload["status"] {
  return fieldDiaryStatusOptions.find((option) => option === value) ?? "Rascunho";
}

function normalizeWeatherCondition(value: string): FieldDiaryPayload["weatherConditions"] {
  return weatherConditionOptions.find((option) => option === value) ?? "";
}

function normalizePointAccessibility(value: string): FieldDiaryPayload["pointAccessibility"] {
  return pointAccessibilityOptions.find((option) => option === value) ?? "";
}
