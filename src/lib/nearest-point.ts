/**
 * Ponto da campanha mais próximo do celular (retorno de campo de 13/11/2026: "quando
 * aperta para ler o GPS, ele não associa ao ponto mais próximo, igual é no IAGEN").
 *
 * A lista de pontos com coordenada planejada vem de /api/field-diary/planned-points,
 * só para quem registra coleta, e fica guardada no aparelho para funcionar sem sinal.
 * A lista do formulário (/api/field-diary/point-options) continua sem coordenadas.
 *
 * Nada aqui fala com rede ou tela: são só as regras.
 */

import { campaignIdentityKey } from "@/lib/campaign-identity";
import { RELOCATION_WARNING_DISTANCE_M, distanceMeters, type GpsReading } from "@/lib/collection-capture";
import {
  findPlannedCoordinate,
  plannedCoordinateOf,
  pointMatchKey,
  siaMatchKey,
  type PlannedCoordinate,
  type PlannedCoordinateSource,
  type PlannedCoordinateTarget,
} from "@/lib/planned-coordinate";

/** Ponto de coleta com a coordenada planejada, como o aparelho guarda. */
export type CampaignPlannedPoint = {
  sia: string;
  locationName: string;
  municipality: string;
  /** Nome da campanha, como está na planilha (ex.: "4ª Campanha"). */
  campaign: string;
  latitude: number;
  longitude: number;
};

export type NearestPoint = { point: CampaignPlannedPoint; distanceM: number };

/**
 * Sem ponto escolhido, o app escolhe sozinho o mais próximo se o celular estiver a
 * até esta distância dele. Mais longe, só sugere (a pessoa toca para usar).
 */
export const NEAREST_POINT_AUTO_MAX_M = 1000;

/** Lista para o aparelho: um ponto por campanha, SIA e local, só os que têm coordenada. */
export function buildCampaignPlannedPoints(points: PlannedCoordinateSource[]): CampaignPlannedPoint[] {
  const byKey = new Map<string, CampaignPlannedPoint>();

  for (const point of points) {
    const coordinate = plannedCoordinateOf(point);
    const sia = String(point.code ?? "").trim();
    const locationName = String(point.waterBody ?? "").trim();

    if (!coordinate || (!sia && !locationName)) {
      continue;
    }

    const campaign = String(point.campaign ?? "").trim();
    const key = [campaignIdentityKey(null, campaign), siaMatchKey(sia), pointMatchKey(locationName)].join("|");

    if (!byKey.has(key)) {
      byKey.set(key, {
        sia,
        locationName,
        municipality: String(point.municipality ?? "").trim(),
        campaign,
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
      });
    }
  }

  return [...byKey.values()];
}

/** Leitura da resposta (ou da cópia guardada): o que não for ponto válido fica de fora. */
export function readCampaignPlannedPoints(value: unknown): CampaignPlannedPoint[] {
  const list = value && typeof value === "object" ? (value as { points?: unknown }).points : null;

  if (!Array.isArray(list)) {
    return [];
  }

  return list.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const raw = item as Record<string, unknown>;
    const latitude = Number(raw.latitude);
    const longitude = Number(raw.longitude);
    const text = (name: string) => (typeof raw[name] === "string" ? (raw[name] as string).trim() : "");

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180 ||
      (!text("sia") && !text("locationName"))
    ) {
      return [];
    }

    return [
      {
        sia: text("sia"),
        locationName: text("locationName"),
        municipality: text("municipality"),
        campaign: text("campaign"),
        latitude,
        longitude,
      },
    ];
  });
}

/** A coordenada planejada do ponto do registro, procurada na lista do aparelho. */
export function plannedCoordinateFromList(
  points: CampaignPlannedPoint[],
  target: PlannedCoordinateTarget,
): PlannedCoordinate | null {
  return findPlannedCoordinate(points.map(toSource), target);
}

/**
 * O ponto mais próximo do celular. Vale a campanha do registro; se ela não tem
 * nenhum ponto com coordenada, valem os das outras campanhas.
 */
export function findNearestPoint(
  points: CampaignPlannedPoint[],
  gps: Pick<GpsReading, "latitude" | "longitude">,
  campaign: Pick<PlannedCoordinateTarget, "campaignId" | "campaignName">,
): NearestPoint | null {
  const campaignKey = campaignIdentityKey(campaign.campaignId, campaign.campaignName);
  const ofCampaign = campaignKey
    ? points.filter((point) => campaignIdentityKey(null, point.campaign) === campaignKey)
    : [];
  let nearest: NearestPoint | null = null;

  for (const point of ofCampaign.length ? ofCampaign : points) {
    const distanceM = distanceMeters(gps, point);

    if (!nearest || distanceM < nearest.distanceM) {
      nearest = { point, distanceM };
    }
  }

  return nearest;
}

export type NearestPointDecision =
  /** Nada a fazer: sem lista, ou o ponto escolhido já serve. */
  | { kind: "none" }
  /** O ponto escolhido é o mais próximo. */
  | { kind: "same"; nearest: NearestPoint }
  /** Nenhum ponto escolhido e o celular está perto de um: o app escolhe. */
  | { kind: "select"; nearest: NearestPoint }
  /** O app sugere o ponto mais próximo e a pessoa decide. */
  | { kind: "suggest"; nearest: NearestPoint };

/**
 * O que fazer com o ponto do registro depois de ler o GPS. Sem ponto escolhido, o
 * mais próximo entra sozinho (até NEAREST_POINT_AUTO_MAX_M). Com ponto escolhido, o
 * app só sugere trocar quando o celular está longe dele e outro ponto está mais perto:
 * o que a pessoa escolheu não é trocado sem ela ver.
 */
export function decideNearestPoint(input: {
  points: CampaignPlannedPoint[];
  gps: GpsReading;
  entry: PlannedCoordinateTarget;
}): NearestPointDecision {
  const nearest = findNearestPoint(input.points, input.gps, input.entry);

  if (!nearest) {
    return { kind: "none" };
  }

  const accuracyM = Number.isFinite(input.gps.accuracyM) ? Math.max(0, Number(input.gps.accuracyM)) : 0;
  const hasPoint = Boolean(String(input.entry.sia ?? "").trim() || String(input.entry.locationName ?? "").trim());

  if (!hasPoint) {
    return nearest.distanceM - accuracyM <= NEAREST_POINT_AUTO_MAX_M
      ? { kind: "select", nearest }
      : { kind: "suggest", nearest };
  }

  if (isSamePoint(nearest.point, input.entry)) {
    return { kind: "same", nearest };
  }

  const current = plannedCoordinateFromList(input.points, input.entry);
  const currentDistanceM = current ? distanceMeters(input.gps, current) : null;
  const isFarFromCurrent =
    currentDistanceM === null || currentDistanceM - accuracyM > RELOCATION_WARNING_DISTANCE_M;

  return isFarFromCurrent && (currentDistanceM === null || nearest.distanceM < currentDistanceM)
    ? { kind: "suggest", nearest }
    : { kind: "none" };
}

/** "0136 · Rio Passaúna", como o ponto aparece na lista do formulário. */
export function nearestPointLabel(point: Pick<CampaignPlannedPoint, "sia" | "locationName">) {
  return [point.sia, point.locationName].filter(Boolean).join(" · ");
}

/** O ponto da lista é o do registro (mesmo SIA; sem SIA, mesmo local). */
export function isSamePoint(point: CampaignPlannedPoint, entry: PlannedCoordinateTarget) {
  const sia = siaMatchKey(entry.sia);
  const location = pointMatchKey(entry.locationName);

  if (sia) {
    return siaMatchKey(point.sia) === sia && (!location || pointMatchKey(point.locationName) === location);
  }

  return Boolean(location) && pointMatchKey(point.locationName) === location;
}

function toSource(point: CampaignPlannedPoint): PlannedCoordinateSource {
  return {
    code: point.sia,
    waterBody: point.locationName,
    municipality: point.municipality,
    campaign: point.campaign,
    original: { lat: point.latitude, lon: point.longitude },
  };
}
