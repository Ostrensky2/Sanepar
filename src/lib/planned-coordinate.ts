/**
 * Coordenada planejada de um ponto de coleta: a que veio na planilha da campanha.
 * É a referência para avisar que o celular está longe do ponto e o que o registro
 * usa quando o aparelho fica sem GPS.
 *
 * A lista de pontos do formulário (/api/field-diary/point-options) não leva
 * coordenada, de propósito. Esta consulta devolve a de um ponto só, para quem pode
 * registrar coleta (ver /api/field-diary/planned-coordinate).
 */

import { campaignIdentityKey } from "@/lib/campaign-identity";

export type PlannedCoordinateSource = {
  waterBody?: unknown;
  code?: unknown;
  municipality?: unknown;
  campaign?: unknown;
  original?: { lat?: unknown; lon?: unknown } | null;
  effective?: { lat?: unknown; lon?: unknown } | null;
};

export type PlannedCoordinateTarget = {
  sia?: string | null;
  locationName?: string | null;
  municipality?: string | null;
  campaignId?: string | null;
  campaignName?: string | null;
};

export type PlannedCoordinate = {
  latitude: number;
  longitude: number;
  /** A campanha do registro ainda não tem coordenada para o ponto: veio a de outra. */
  fromOtherCampaign: boolean;
};

/**
 * Procura o ponto pelo SIA (e pelo local, quando informado); sem SIA, pelo local e
 * município. Prefere a coordenada da campanha do registro.
 */
export function findPlannedCoordinate(
  points: PlannedCoordinateSource[],
  target: PlannedCoordinateTarget,
): PlannedCoordinate | null {
  const sia = siaKey(target.sia);
  const location = pointKey(target.locationName);
  const municipality = pointKey(target.municipality);

  if (!sia && !location) {
    return null;
  }

  const campaignKey = campaignIdentityKey(target.campaignId, target.campaignName);
  let fromOtherCampaign: PlannedCoordinate | null = null;

  for (const point of points) {
    const matches = sia
      ? siaKey(point.code) === sia && (!location || pointKey(point.waterBody) === location)
      : pointKey(point.waterBody) === location && (!municipality || pointKey(point.municipality) === municipality);

    if (!matches) {
      continue;
    }

    const coordinate = coordinateOf(point);

    if (!coordinate) {
      continue;
    }

    if (campaignKey && campaignIdentityKey(null, point.campaign) === campaignKey) {
      return { ...coordinate, fromOtherCampaign: false };
    }

    fromOtherCampaign ??= { ...coordinate, fromOtherCampaign: true };
  }

  return fromOtherCampaign;
}

/**
 * Consulta feita pelo formulário. Nunca rejeita: sem resposta (sem rede, sem
 * permissão, ponto sem coordenada), o registro segue sem a coordenada planejada.
 */
export async function fetchPlannedCoordinate(
  target: PlannedCoordinateTarget,
  timeoutMs = 8000,
): Promise<PlannedCoordinate | null> {
  if (!target.sia && !target.locationName) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      sia: target.sia ?? "",
      locationName: target.locationName ?? "",
      municipality: target.municipality ?? "",
      campaignId: target.campaignId ?? "",
      campaignName: target.campaignName ?? "",
    });
    const response = await fetch(`/api/field-diary/planned-coordinate?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return null;
    }

    const { planned } = (await response.json()) as { planned?: Partial<PlannedCoordinate> | null };

    return planned && Number.isFinite(planned.latitude) && Number.isFinite(planned.longitude)
      ? {
          latitude: Number(planned.latitude),
          longitude: Number(planned.longitude),
          fromOtherCampaign: Boolean(planned.fromOtherCampaign),
        }
      : null;
  } catch {
    return null;
  }
}

/** Identifica o ponto e a campanha de uma consulta, para não repetir a mesma. */
export function plannedCoordinateKey(target: PlannedCoordinateTarget) {
  return [
    campaignIdentityKey(target.campaignId, target.campaignName),
    siaKey(target.sia),
    pointKey(target.locationName),
    pointKey(target.municipality),
  ].join("|");
}

/** A coordenada original da planilha; sem ela, a efetiva. Zero e vazio não contam. */
function coordinateOf(point: PlannedCoordinateSource) {
  for (const candidate of [point.original, point.effective]) {
    if (!candidate || isBlank(candidate.lat) || isBlank(candidate.lon)) {
      continue;
    }

    const latitude = Number(candidate.lat);
    const longitude = Number(candidate.lon);

    if (
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      Math.abs(latitude) <= 90 &&
      Math.abs(longitude) <= 180 &&
      !(latitude === 0 && longitude === 0)
    ) {
      return { latitude, longitude };
    }
  }

  return null;
}

function isBlank(value: unknown) {
  return value === null || value === undefined || value === "";
}

// "SIA-0771", "0771" e "771" são o mesmo ponto.
function siaKey(value: unknown) {
  return pointKey(value)
    .replace(/^sia\s*/, "")
    .replace(/^0+(?=\d)/, "");
}

// Mesma normalização da lista de pontos do formulário (normalizeFieldDiaryPointKey).
function pointKey(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Usados pela lista de pontos com coordenada (lib/nearest-point), com as mesmas regras.
export { coordinateOf as plannedCoordinateOf, siaKey as siaMatchKey, pointKey as pointMatchKey };
