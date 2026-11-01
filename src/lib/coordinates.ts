/**
 * Coordenadas geográficas do registro de campo.
 *
 * O banco grava latitude/longitude como numeric(9,6) e confere as mesmas regras
 * (faixa e par completo) que este módulo. Formulário, API e importação usam estas
 * funções para recusar o valor antes de chegar ao banco, com mensagem em português.
 */

export const COORDINATE_DECIMALS = 6;

export type CoordinateKind = "latitude" | "longitude";

export type ParsedCoordinate =
  | { status: "empty" }
  | { status: "valid"; value: number }
  | { status: "invalid"; reason: "not_a_number" | "out_of_range" };

const COORDINATE_LIMITS: Record<CoordinateKind, number> = {
  latitude: 90,
  longitude: 180,
};

const COORDINATE_TEXT = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;

/**
 * Converte o texto digitado (ou lido da planilha) em número. Aceita vírgula ou ponto
 * como separador decimal e espaços nas pontas. Não adivinha sinal nem hemisfério.
 */
export function parseCoordinate(value: unknown, kind: CoordinateKind): ParsedCoordinate {
  if (value === null || value === undefined) {
    return { status: "empty" };
  }

  if (typeof value === "number") {
    return checkRange(value, kind);
  }

  const text = String(value).trim().replace(/\s+/g, "");

  if (!text) {
    return { status: "empty" };
  }

  if (!COORDINATE_TEXT.test(text)) {
    return { status: "invalid", reason: "not_a_number" };
  }

  return checkRange(Number(text.replace(",", ".")), kind);
}

function checkRange(value: number, kind: CoordinateKind): ParsedCoordinate {
  if (!Number.isFinite(value)) {
    return { status: "invalid", reason: "not_a_number" };
  }

  const limit = COORDINATE_LIMITS[kind];

  if (value < -limit || value > limit) {
    return { status: "invalid", reason: "out_of_range" };
  }

  return { status: "valid", value: roundCoordinate(value) };
}

export function roundCoordinate(value: number) {
  const factor = 10 ** COORDINATE_DECIMALS;
  return Math.round(value * factor) / factor;
}

export type CoordinatePairResult =
  | { ok: true; latitude: number | null; longitude: number | null }
  | { ok: false; error: string };

/**
 * Confere latitude e longitude juntas: cada uma precisa ser número dentro da faixa
 * e as duas vêm sempre em par (as duas preenchidas ou as duas vazias).
 */
export function validateCoordinatePair(latitude: unknown, longitude: unknown): CoordinatePairResult {
  const lat = parseCoordinate(latitude, "latitude");
  const lon = parseCoordinate(longitude, "longitude");

  if (lat.status === "invalid") {
    return { ok: false, error: coordinateErrorMessage("latitude", lat.reason, latitude) };
  }

  if (lon.status === "invalid") {
    return { ok: false, error: coordinateErrorMessage("longitude", lon.reason, longitude) };
  }

  if (lat.status === "empty" && lon.status === "empty") {
    return { ok: true, latitude: null, longitude: null };
  }

  if (lat.status === "empty") {
    return { ok: false, error: "Informe a latitude junto com a longitude, ou deixe as duas em branco." };
  }

  if (lon.status === "empty") {
    return { ok: false, error: "Informe a longitude junto com a latitude, ou deixe as duas em branco." };
  }

  return { ok: true, latitude: lat.value, longitude: lon.value };
}

function coordinateErrorMessage(
  kind: CoordinateKind,
  reason: "not_a_number" | "out_of_range",
  raw: unknown,
) {
  const label = kind === "latitude" ? "A latitude" : "A longitude";
  const shown = String(raw ?? "").trim();

  if (reason === "out_of_range") {
    return kind === "latitude"
      ? `${label} “${shown}” está fora da faixa permitida (entre -90 e 90).`
      : `${label} “${shown}” está fora da faixa permitida (entre -180 e 180).`;
  }

  return `${label} “${shown}” não é um número válido. Use graus decimais, por exemplo -25.428400.`;
}

/** Valor do banco (numeric) para o texto usado nos formulários e telas. */
export function coordinateToText(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const parsed = parseCoordinate(value, "longitude");
  return parsed.status === "valid" ? String(parsed.value) : String(value).trim();
}
