import {
  fieldDiaryStatusOptions,
  followUpOptions,
  type FieldDiaryPayload,
} from "@/lib/field-diary";
import {
  LEGACY_GENERIC_COLLECTION,
  canonicalOccurrenceType,
  canonicalPointAccessibility,
  canonicalVocabularyList,
  canonicalWeatherCondition,
} from "@/lib/field-diary-vocabulary";
import { resolveCanonicalCampaign } from "@/lib/campaign-identity";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";
import { fieldCivilDay } from "@/lib/imports/field-references";

export function campaignPointToFieldDiaryPayload(point: CampaignMapPoint): FieldDiaryPayload | null {
  const coordinates = point.effective;
  const sia = normalizeSia(point.code);

  if (!coordinates || !hasOperationalCollectionEvidence(point)) {
    return null;
  }

  const entryDate = fieldCivilDay(point.date);
  if (!entryDate) return null;
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
    executionStatus: point.executionStatus,
    relocationReason: point.executionStatus === "relocated" ? point.relocationReason ?? "" : "",
    municipality: point.municipality || "Paraná",
    // Termos antigos da planilha são traduzidos para o vocabulário comum com o IAGen.
    activities: canonicalVocabularyList(
      "activities",
      point.activities?.length ? point.activities : [LEGACY_GENERIC_COLLECTION],
      { zooplanktonId: point.zooplanktonId },
    ),
    waterVisualConditions: canonicalVocabularyList(
      "waterVisualConditions",
      splitWaterVisualConditions(point.waterAspect),
    ),
    hasOccurrence: Boolean(point.hasOccurrence),
    occurrenceType: point.hasOccurrence ? canonicalOccurrenceType(point.occurrenceType) || null : null,
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

export function hasOperationalCollectionEvidence(point: CampaignMapPoint) {
  return Boolean(
    point.activities?.some(hasMeaningfulValue) ||
    hasMeaningfulValue(point.collectionTime) ||
    hasMeaningfulValue(point.samplesReplicasEdna) ||
    hasMeaningfulValue(point.zooplanktonId) ||
    point.hasOccurrence ||
    hasMeaningfulValue(point.occurrenceType) ||
    hasMeaningfulValue(point.occurrenceDescription) ||
    hasNonDefaultValue(point.requiresFollowUp, "Não") ||
    hasMeaningfulValue(point.followUpNotes) ||
    hasMeaningfulValue(point.dailySummary) ||
    hasMeaningfulValue(point.problems) ||
    hasMeaningfulValue(point.waterAspect) ||
    hasMeaningfulValue(point.weatherConditions) ||
    hasNonDefaultValue(point.status, "Rascunho") ||
    point.photos?.length ||
    hasMeaningfulValue(point.photoUrl)
  );
}

function hasMeaningfulValue(value: unknown) {
  const normalized = normalizeEvidenceValue(value);
  return Boolean(normalized && normalized !== "não informado" && normalized !== "nao informado");
}

function hasNonDefaultValue(value: unknown, defaultValue: string) {
  return hasMeaningfulValue(value) && normalizeEvidenceValue(value) !== normalizeEvidenceValue(defaultValue);
}

function normalizeEvidenceValue(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("pt-BR");
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

function normalizeFollowUp(value: string): FieldDiaryPayload["requiresFollowUp"] {
  return followUpOptions.find((option) => option === value) ?? "Não";
}

function normalizeStatus(value: string): FieldDiaryPayload["status"] {
  return fieldDiaryStatusOptions.find((option) => option === value) ?? "Rascunho";
}

function normalizeWeatherCondition(value: string): FieldDiaryPayload["weatherConditions"] {
  return canonicalWeatherCondition(value);
}

function normalizePointAccessibility(value: string): FieldDiaryPayload["pointAccessibility"] {
  return canonicalPointAccessibility(value);
}
