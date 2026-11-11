/**
 * Captura automática do início da coleta: hora, data e posição do celular.
 *
 * As funções daqui são puras (não tocam no navegador), para a regra poder ser
 * testada: o formulário só lê o GPS e aplica o resultado.
 */

import { COORDINATE_DECIMALS, roundCoordinate } from "@/lib/coordinates";

export const coordinateSources = ["gps", "planned", "manual"] as const;
export type CoordinateSource = (typeof coordinateSources)[number];

export const coordinateSourceLabels: Record<CoordinateSource, string> = {
  gps: "GPS do celular",
  planned: "Coordenada planejada do ponto",
  manual: "Digitada",
};

/** A partir desta distância do ponto planejado o app sugere marcar "Realocado". */
export const RELOCATION_WARNING_DISTANCE_M = 200;
export const GPS_ACCURACY_MAX_M = 100000;
/** Acima desta incerteza a leitura não serve como posição do ponto sem conferência. */
export const GPS_POOR_ACCURACY_M = 100;

export type GeoPoint = { latitude: number; longitude: number };
export type GpsReading = GeoPoint & { accuracyM: number | null };

export function parseCoordinateSource(value: unknown): CoordinateSource | null {
  return coordinateSources.includes(value as CoordinateSource) ? (value as CoordinateSource) : null;
}

/** Precisão do GPS em metros, com uma casa decimal; null quando ausente ou absurda. */
export function normalizeGpsAccuracy(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const accuracy = Number(value);

  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > GPS_ACCURACY_MAX_M) {
    return null;
  }

  return Math.round(accuracy * 10) / 10;
}

/**
 * Colunas de captura como vão para o banco, sempre coerentes com as regras de lá:
 * origem só com a coordenada preenchida; precisão só quando a origem é o GPS.
 */
export function captureRowColumns(entry: {
  latitude?: string | null;
  longitude?: string | null;
  coordinateSource?: unknown;
  gpsAccuracyM?: unknown;
  collectionStartedAt?: string | null;
}) {
  const source = entry.latitude && entry.longitude ? parseCoordinateSource(entry.coordinateSource) : null;

  return {
    coordinate_source: source,
    gps_accuracy_m: source === "gps" ? normalizeGpsAccuracy(entry.gpsAccuracyM) : null,
    collection_started_at: entry.collectionStartedAt ?? null,
  };
}

/** Data local do aparelho em AAAA-MM-DD (não em UTC: à noite o dia em UTC já virou). */
export function localIsoDate(now: Date) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Hora local do aparelho em HH:MM. */
export function localTimeOfDay(now: Date) {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Distância em metros entre dois pontos (haversine). */
export function distanceMeters(a: GeoPoint, b: GeoPoint) {
  const earthRadiusM = 6371008.8;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(deltaLongitude / 2) ** 2;

  return 2 * earthRadiusM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistance(meters: number) {
  if (meters < 1000) {
    return `${Math.round(meters / 10) * 10} m`;
  }

  return `${(meters / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

export function formatCoordinate(value: number) {
  return roundCoordinate(value).toFixed(COORDINATE_DECIMALS);
}

/** Por que o aparelho não entregou a posição. */
export const gpsProblems = ["denied", "unavailable", "timeout", "unsupported"] as const;
export type GpsProblem = (typeof gpsProblems)[number];

const gpsProblemLabels: Record<GpsProblem, string> = {
  denied: "O celular não liberou a localização para o aplicativo",
  unavailable: "Sem sinal de GPS",
  timeout: "O GPS demorou demais para responder",
  unsupported: "Este aparelho não informa a localização",
};

/** Código de erro do navegador (GeolocationPositionError.code) em motivo legível. */
export function gpsProblemFromErrorCode(code: unknown): GpsProblem {
  if (code === 1) {
    return "denied";
  }

  return code === 3 ? "timeout" : "unavailable";
}

export type PlannedPoint = GeoPoint & {
  /** A campanha do registro ainda não tem coordenada própria: veio a de outra. */
  fromOtherCampaign?: boolean;
};

export type TimeCaptureInput = {
  now: Date;
  /** Data que o registro tinha antes (AAAA-MM-DD). */
  currentEntryDate: string;
};

export type TimeCapturePatch = {
  entryDate: string;
  collectionTime: string;
  collectionStartedAt: string;
};

/** Hora e data da coleta: sempre as do aparelho, no momento do toque. */
export function buildTimeCapture(input: TimeCaptureInput): { patch: TimeCapturePatch; notices: string[] } {
  const entryDate = localIsoDate(input.now);
  const collectionTime = localTimeOfDay(input.now);
  const notices = [`Hora da coleta gravada: ${collectionTime}.`];

  if (input.currentEntryDate && input.currentEntryDate !== entryDate) {
    notices.push(
      `A data do registro mudou de ${formatDateBr(input.currentEntryDate)} para hoje, ${formatDateBr(entryDate)}.`,
    );
  }

  return {
    patch: { entryDate, collectionTime, collectionStartedAt: input.now.toISOString() },
    notices,
  };
}

export type PositionCaptureInput = {
  /** Leitura do GPS; null quando o aparelho não conseguiu a posição. */
  gps: GpsReading | null;
  /** Por que não houve leitura (só quando `gps` é null). */
  gpsProblem?: GpsProblem | null;
  /** Coordenada planejada do ponto escolhido, quando existe. */
  planned: PlannedPoint | null;
  /** O registro já tinha latitude e longitude antes da captura. */
  hadCoordinates: boolean;
};

export type PositionCapturePatch = {
  latitude?: string;
  longitude?: string;
  coordinateSource?: CoordinateSource;
  gpsAccuracyM?: number | null;
};

export type PositionCaptureResult = {
  patch: PositionCapturePatch;
  /** Mensagens para a pessoa, na ordem em que devem aparecer. */
  notices: string[];
  /** Preenchido quando o GPS está longe do ponto planejado. */
  farFromPlanned: { distanceM: number } | null;
  /** true quando a posição precisa de conferência (não veio do GPS ou veio imprecisa). */
  needsCoordinateCheck: boolean;
};

/**
 * Posição da coleta. Vem do GPS. Sem leitura, nada do que já está no registro é
 * trocado: se ele já tem coordenada, ela fica; se não tem, entra a coordenada
 * planejada do ponto (marcada como planejada); sem nenhuma, a pessoa digita.
 */
export function buildPositionCapture(input: PositionCaptureInput): PositionCaptureResult {
  const patch: PositionCapturePatch = {};
  const notices: string[] = [];
  let farFromPlanned: PositionCaptureResult["farFromPlanned"] = null;
  let needsCoordinateCheck = false;

  if (input.gps) {
    const accuracyM = normalizeGpsAccuracy(input.gps.accuracyM);

    patch.latitude = formatCoordinate(input.gps.latitude);
    patch.longitude = formatCoordinate(input.gps.longitude);
    patch.coordinateSource = "gps";
    patch.gpsAccuracyM = accuracyM;

    if (accuracyM !== null && accuracyM > GPS_POOR_ACCURACY_M) {
      needsCoordinateCheck = true;
      notices.push(
        `Posição gravada pelo GPS do celular, mas com precisão baixa (${formatDistance(accuracyM)}). ` +
          "Confira a coordenada ou leia o GPS de novo em local aberto.",
      );
    } else {
      notices.push(
        accuracyM === null
          ? "Posição gravada pelo GPS do celular."
          : `Posição gravada pelo GPS do celular (precisão de ${Math.max(1, Math.round(accuracyM))} m).`,
      );
    }

    if (input.planned) {
      const distanceM = distanceMeters(input.gps, input.planned);

      // A incerteza do GPS conta a favor: só avisa quando o aparelho está longe
      // mesmo no melhor caso.
      if (distanceM - (accuracyM ?? 0) > RELOCATION_WARNING_DISTANCE_M) {
        farFromPlanned = { distanceM };
      }
    }

    return { patch, notices, farFromPlanned, needsCoordinateCheck };
  }

  const reason = gpsProblemLabels[input.gpsProblem ?? "unavailable"];

  needsCoordinateCheck = true;

  if (input.hadCoordinates) {
    notices.push(`${reason}: a coordenada que já estava no registro foi mantida. Confira.`);
  } else if (input.planned) {
    patch.latitude = formatCoordinate(input.planned.latitude);
    patch.longitude = formatCoordinate(input.planned.longitude);
    patch.coordinateSource = "planned";
    patch.gpsAccuracyM = null;
    notices.push(
      `${reason}: usei a coordenada planejada do ponto` +
        (input.planned.fromOtherCampaign ? ", a de outra campanha, porque esta ainda não tem a dela" : "") +
        ". Confira e corrija se a coleta foi em outro lugar.",
    );
  } else {
    notices.push(`${reason}: digite a latitude e a longitude.`);
  }

  if (input.gpsProblem === "denied") {
    notices.push(
      "Para o aplicativo gravar a posição sozinho, libere a localização deste site nas configurações do navegador.",
    );
  }

  return { patch, notices, farFromPlanned, needsCoordinateCheck };
}

export type CollectionStartInput = TimeCaptureInput & PositionCaptureInput;
export type CollectionStartPatch = TimeCapturePatch & PositionCapturePatch;
export type CollectionStartResult = Omit<PositionCaptureResult, "patch"> & { patch: CollectionStartPatch };

/**
 * O que o botão "Iniciar coleta" grava no registro: a hora e a data do aparelho e a
 * posição (ver buildTimeCapture e buildPositionCapture).
 */
export function buildCollectionStart(input: CollectionStartInput): CollectionStartResult {
  const time = buildTimeCapture(input);
  const position = buildPositionCapture(input);

  return {
    ...position,
    patch: { ...time.patch, ...position.patch },
    notices: [...time.notices, ...position.notices],
  };
}

/**
 * Troca de ponto num registro cuja coordenada é a planejada: a coordenada tem de
 * acompanhar o novo ponto (ou ser apagada, se ele não tem coordenada planejada).
 * Coordenada do GPS ou digitada não muda: ela diz onde a pessoa estava.
 */
export function plannedPatchForPointChange(
  currentSource: unknown,
  planned: GeoPoint | null,
): { latitude: string; longitude: string; coordinateSource: CoordinateSource | null; gpsAccuracyM: null } | null {
  if (parseCoordinateSource(currentSource) !== "planned") {
    return null;
  }

  return planned
    ? {
        latitude: formatCoordinate(planned.latitude),
        longitude: formatCoordinate(planned.longitude),
        coordinateSource: "planned",
        gpsAccuracyM: null,
      }
    : { latitude: "", longitude: "", coordinateSource: null, gpsAccuracyM: null };
}

/** AAAA-MM-DD em DD/MM/AAAA. */
export function formatDateBr(isoDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : isoDate;
}

/** Momento do toque em "Iniciar coleta" como "DD/MM/AAAA às HH:MM", na hora do aparelho. */
export function formatCollectionStart(startedAt: unknown) {
  if (!startedAt) {
    return "";
  }

  const moment = new Date(String(startedAt));

  return Number.isFinite(moment.getTime())
    ? `${formatDateBr(localIsoDate(moment))} às ${localTimeOfDay(moment)}`
    : "";
}

/**
 * Pergunta a fazer antes de "Iniciar coleta" num registro que já tem hora ou que é
 * de outro dia: a captura troca esses dados. Texto vazio = pode iniciar direto.
 */
export function collectionRestartWarning(
  entry: { id?: string | null; entryDate?: string | null; collectionTime?: string | null },
  now: Date,
) {
  const today = localIsoDate(now);
  const otherDay = entry.entryDate && entry.entryDate !== today ? formatDateBr(entry.entryDate) : "";

  if (entry.collectionTime) {
    return (
      `Este registro já tem a hora ${entry.collectionTime}` +
      (otherDay ? ` e a data ${otherDay}` : "") +
      ". Iniciar a coleta de novo troca pela hora" +
      (otherDay ? " e pela data" : "") +
      " de agora e lê o GPS outra vez."
    );
  }

  return entry.id && otherDay
    ? `Este registro está com a data ${otherDay}. Iniciar a coleta muda a data para hoje, ${formatDateBr(today)}.`
    : "";
}

/** Texto curto de origem da coordenada, para mostrar junto dos campos. */
export function describeCoordinateSource(source: unknown, accuracyM: unknown) {
  const parsed = parseCoordinateSource(source);

  if (!parsed) {
    return "";
  }

  const accuracy = normalizeGpsAccuracy(accuracyM);

  return parsed === "gps" && accuracy !== null
    ? `${coordinateSourceLabels.gps}, precisão de ${Math.max(1, Math.round(accuracy))} m`
    : coordinateSourceLabels[parsed];
}
