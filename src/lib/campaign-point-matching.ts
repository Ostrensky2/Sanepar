/**
 * Regras de correspondência entre pontos do mapa e registros do Diário de campo.
 * Compartilhadas pela tela de Campanhas e pela exportação em Excel.
 */
import type { CampaignHydroMapPoint } from "@/components/campaign-hydro-map";
import { normalizeCampaignKey } from "@/lib/campaign-points";
import type { FieldDiaryEntry } from "@/lib/field-diary";

export function diaryEntryMatchesSelectedCampaign(
  entry: FieldDiaryEntry,
  selectedCampaignId: string,
  selectedCampaignTitle: string,
) {
  if (entry.campaignId === selectedCampaignId) {
    return true;
  }

  const campaignNumber = selectedCampaignId.match(/campanha-(\d+)/)?.[1];
  const entryKey = normalizeCampaignKey(entry.campaignName);
  const titleKey = normalizeCampaignKey(selectedCampaignTitle);

  return entryKey === titleKey || Boolean(campaignNumber && entryKey === campaignNumber);
}

export function dayNumber(value: unknown) {
  const match = String(value ?? "").match(/\d+/);
  return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
}

export function normalizeMapPointDateKey(value: unknown) {
  const text = String(value ?? "").trim();
  const brazilianDate = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

  if (brazilianDate) {
    return `${brazilianDate[3]}-${brazilianDate[2]}-${brazilianDate[1]}`;
  }

  return text.slice(0, 10);
}

export function mapPointMatchKeys(point: CampaignHydroMapPoint) {
  const values = [
    point.code,
    point.point,
    point.waterBody,
  ];
  const textKeys = values
    .map(normalizeMapPointKey)
    .filter(Boolean);
  const numericKeys = values
    .map(pointNumberKey)
    .filter(Boolean);

  return [...new Set([...textKeys, ...numericKeys])];
}

export function normalizeMapPointKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\bsia\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function pointNumberKey(value: unknown) {
  const match = String(value ?? "").match(/\d+/);

  if (!match) {
    return "";
  }

  return `numero:${Number(match[0])}`;
}

export function findDiaryEntryForMapPoint(
  point: CampaignHydroMapPoint,
  entries: FieldDiaryEntry[],
) {
  const pointKeys = new Set(mapPointMatchKeys(point));
  const pointDate = normalizeMapPointDateKey(point.date);
  const pointDay = dayNumber(point.day);

  return entries.find((entry) => {
    const samePoint = mapDiaryEntryMatchKeys(entry).some((key) => pointKeys.has(key));

    if (!samePoint) {
      return false;
    }

    if (pointDate && entry.entryDate !== pointDate) {
      return false;
    }

    return pointDay === Number.MAX_SAFE_INTEGER || entry.campaignDay === pointDay;
  }) ?? null;
}

export function mapDiaryEntryMatchKeys(entry: FieldDiaryEntry) {
  const values = [entry.sia, entry.locationName];
  const textKeys = values
    .map(normalizeMapPointKey)
    .filter(Boolean);
  const numericKeys = values
    .map(pointNumberKey)
    .filter(Boolean);

  return [...new Set([...textKeys, ...numericKeys])];
}
