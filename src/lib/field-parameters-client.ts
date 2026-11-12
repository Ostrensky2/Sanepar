/**
 * Conversa do aparelho com a nuvem sobre os parâmetros de campo: o catálogo
 * (rota /api/field-diary/parameters) e as medições de um registro
 * (rota /api/field-diary/readings). As regras ficam em lib/field-parameters.
 */

import {
  readFieldParameter,
  type FieldParameter,
  type FieldParameterInput,
  type FieldReading,
  type ReadingInput,
} from "@/lib/field-parameters";
import { isTransientStatus } from "@/lib/field-diary";
import { cacheCatalog, rememberLastEquipment } from "@/lib/field-parameters-device";
import { FIELD_PARAMETER_ID_PATTERN } from "@/lib/field-standard";

const REQUEST_TIMEOUT_MS = 20000;

/** O que o formulário entrega junto com o registro na hora de salvar. */
export type ReadingsChange = {
  readings: ReadingInput[];
  /** Medições já gravadas que a pessoa tirou do registro. */
  removedIds: string[];
};

export type CatalogRead =
  | { ok: true; available: boolean; parameters: FieldParameter[] }
  | { ok: false };

export type EntryReadingsRead =
  | { ok: true; available: boolean; parameters: FieldParameter[]; readings: FieldReading[] }
  | { ok: false };

export type ReadingsSaveResult =
  | { ok: true; readings: FieldReading[] }
  | {
      ok: false;
      error: string;
      /** true = outro aparelho já gravou a mesma medição neste registro. */
      conflict: boolean;
      /** Medições que estão gravadas agora no registro, quando a nuvem informou. */
      readings: FieldReading[] | null;
      /** true = sem sinal ou sem resposta a tempo: dá para tentar de novo depois. */
      offline?: boolean;
      /** Código HTTP da recusa (0 = sem resposta). */
      status?: number;
    };

export type ParameterSaveResult =
  | { ok: true; parameter: FieldParameter }
  | {
      ok: false;
      error: string;
      /** Parâmetro que já existe com o mesmo nome, quando foi esse o motivo. */
      existing: FieldParameter | null;
    };

/** Catálogo e medições gravadas de um registro (entryId vazio = só o catálogo). */
export async function fetchEntryReadings(entryId: string, signal?: AbortSignal): Promise<EntryReadingsRead> {
  try {
    const response = await fetch(`/api/field-diary/readings?entryId=${encodeURIComponent(entryId)}`, {
      cache: "no-store",
      signal,
    });

    if (!response.ok) {
      return { ok: false };
    }

    const payload = (await response.json()) as { available?: unknown; parameters?: unknown; readings?: unknown };
    const available = payload.available === true;
    const parameters = readParameters(payload.parameters);

    if (available && parameters.length) {
      cacheCatalog(parameters);
    }

    return { ok: true, available, parameters, readings: readReadings(payload.readings) };
  } catch {
    return { ok: false };
  }
}

export async function fetchParameterCatalog(signal?: AbortSignal): Promise<CatalogRead> {
  try {
    const response = await fetch("/api/field-diary/parameters", { cache: "no-store", signal });

    if (!response.ok) {
      return { ok: false };
    }

    const payload = (await response.json()) as { available?: unknown; parameters?: unknown };
    const available = payload.available === true;
    const parameters = readParameters(payload.parameters);

    if (available && parameters.length) {
      cacheCatalog(parameters);
    }

    return { ok: true, available, parameters };
  } catch {
    return { ok: false };
  }
}

export async function saveEntryReadings(entryId: string, change: ReadingsChange): Promise<ReadingsSaveResult> {
  const sent = await send("/api/field-diary/readings", "PUT", {
    entryId,
    readings: change.readings,
    removedIds: change.removedIds,
  });

  if (!sent) {
    return {
      ok: false,
      error: "Sem conexão com o servidor na hora de salvar as medições.",
      conflict: false,
      readings: null,
      offline: true,
      status: 0,
    };
  }

  if (sent.ok) {
    return { ok: true, readings: readReadings(sent.payload.readings) };
  }

  return {
    ok: false,
    error: describeFailure(sent.status, sent.error, "salvar as medições", "gravar medições"),
    conflict: sent.payload.conflict === true,
    readings: Array.isArray(sent.payload.readings) ? readReadings(sent.payload.readings) : null,
    offline: isTransientStatus(sent.status),
    status: sent.status,
  };
}

/**
 * Depois que o registro foi salvo na nuvem: grava as medições dele e guarda no
 * aparelho o equipamento usado. `change` ausente = nada a gravar (devolve null).
 */
export async function saveReadingsOfSavedEntry(
  entryId: string,
  change: ReadingsChange | undefined,
): Promise<ReadingsSaveResult | null> {
  if (!change) {
    return null;
  }

  const result = await saveEntryReadings(entryId, change);

  if (result.ok) {
    rememberLastEquipment(change.readings);
  }

  return result;
}

/** Cria um parâmetro no catálogo (botão "+ Parâmetro"). */
export function createFieldParameter(input: FieldParameterInput): Promise<ParameterSaveResult> {
  return saveParameter("POST", input);
}

/** Altera um parâmetro criado pela equipe, ou ativa e desativa qualquer um. */
export function updateFieldParameter(
  id: string,
  patch: Partial<FieldParameterInput> & { active?: boolean },
): Promise<ParameterSaveResult> {
  return saveParameter("PATCH", { id, ...patch });
}

async function saveParameter(method: "POST" | "PATCH", body: Record<string, unknown>): Promise<ParameterSaveResult> {
  const sent = await send("/api/field-diary/parameters", method, body);

  if (!sent) {
    return { ok: false, error: "Sem conexão com o servidor na hora de gravar o parâmetro.", existing: null };
  }

  const parameter = readFieldParameter(sent.payload.parameter);

  if (sent.ok && parameter) {
    return { ok: true, parameter };
  }

  return {
    ok: false,
    error: describeFailure(sent.status, sent.error, "gravar o parâmetro", "alterar o catálogo de parâmetros"),
    existing: sent.ok ? null : parameter,
  };
}

/** Aviso do formulário quando o registro foi salvo e as medições não. */
export function readingsNotSavedMessage(result: Extract<ReadingsSaveResult, { ok: false }>) {
  return result.conflict
    ? `${result.error} Veja o aviso em “Parâmetros medidos”.`
    : `${result.error} Toque em “Salvar registro” de novo.`;
}

type Sent = { ok: boolean; status: number; error: string; payload: Record<string, unknown> };

/** Envia JSON com limite de tempo. null = sem conexão. */
async function send(url: string, method: "PUT" | "POST" | "PATCH", body: unknown): Promise<Sent | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    return {
      ok: response.ok,
      status: response.status,
      error: typeof payload.error === "string" ? payload.error.trim() : "",
      payload: payload && typeof payload === "object" ? payload : {},
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function describeFailure(status: number, serverMessage: string, doing: string, permission: string) {
  if (status === 401) {
    return `Sua sessão expirou antes de ${doing}. Entre de novo no sistema, em outra aba, e tente outra vez.`;
  }

  if (status === 403) {
    return serverMessage || `Seu perfil não tem permissão para ${permission}.`;
  }

  return serverMessage || `A nuvem não confirmou (erro ${status}) ao ${doing}.`;
}

export function readParameters(value: unknown): FieldParameter[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const parameters: FieldParameter[] = [];

  for (const item of value) {
    const parameter = readFieldParameter(item);

    if (parameter) {
      parameters.push(parameter);
    }
  }

  return parameters;
}

export function readReadings(value: unknown): FieldReading[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const readings: FieldReading[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;

    const raw = item as Record<string, unknown>;

    if (
      typeof raw.id !== "string" ||
      typeof raw.parameterId !== "string" ||
      !FIELD_PARAMETER_ID_PATTERN.test(raw.parameterId) ||
      typeof raw.value !== "number" ||
      !Number.isFinite(raw.value)
    ) {
      continue;
    }

    readings.push({
      id: raw.id,
      entryId: typeof raw.entryId === "string" ? raw.entryId : "",
      parameterId: raw.parameterId,
      value: raw.value,
      unit: typeof raw.unit === "string" ? raw.unit : "",
      depthM: typeof raw.depthM === "number" && Number.isFinite(raw.depthM) ? raw.depthM : null,
      measuredTime: typeof raw.measuredTime === "string" ? raw.measuredTime : "",
      equipment: typeof raw.equipment === "string" ? raw.equipment : "",
    });
  }

  return readings;
}
