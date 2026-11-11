/**
 * Conversa do aparelho com a nuvem sobre as amostras de um registro de campo
 * (rota /api/field-diary/samples). As regras ficam em lib/field-samples.
 */

import { type FieldSample, type SampleCodeConflict, type SampleInput } from "@/lib/field-samples";
import { conservationTypes, isSampleTypeId } from "@/lib/field-standard";
import { rememberLastSamplePackaging } from "@/lib/last-sample-packaging";

const REQUEST_TIMEOUT_MS = 20000;

/** O que o formulário entrega junto com o registro na hora de salvar. */
export type SamplesChange = {
  projectCode: string;
  samples: SampleInput[];
  /** Amostras já gravadas que a pessoa tirou do registro. */
  removedIds: string[];
};

export type EntrySamplesRead =
  | { ok: true; available: boolean; samples: FieldSample[] }
  | { ok: false };

export type SamplesSaveResult =
  | { ok: true; samples: FieldSample[] }
  | {
      ok: false;
      error: string;
      /** Códigos que já existem, com o próximo número livre de cada um. */
      conflicts: SampleCodeConflict[];
      /** Amostras que estão gravadas agora no registro, quando a nuvem informou. */
      samples: FieldSample[] | null;
    };

export async function fetchEntrySamples(entryId: string, signal?: AbortSignal): Promise<EntrySamplesRead> {
  try {
    const response = await fetch(`/api/field-diary/samples?entryId=${encodeURIComponent(entryId)}`, {
      cache: "no-store",
      signal,
    });

    if (!response.ok) {
      return { ok: false };
    }

    const payload = (await response.json()) as { available?: unknown; samples?: unknown };

    return { ok: true, available: payload.available === true, samples: readSamples(payload.samples) };
  } catch {
    return { ok: false };
  }
}

export async function saveEntrySamples(entryId: string, change: SamplesChange): Promise<SamplesSaveResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("/api/field-diary/samples", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entryId,
        projectCode: change.projectCode,
        samples: change.samples,
        removedIds: change.removedIds,
      }),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: unknown;
      samples?: unknown;
      conflicts?: unknown;
    };

    if (response.ok) {
      return { ok: true, samples: readSamples(payload.samples) };
    }

    return {
      ok: false,
      error: describeFailure(response.status, typeof payload.error === "string" ? payload.error.trim() : ""),
      conflicts: readConflicts(payload.conflicts),
      samples: Array.isArray(payload.samples) ? readSamples(payload.samples) : null,
    };
  } catch {
    return {
      ok: false,
      error: "Sem conexão com o servidor na hora de salvar as amostras.",
      conflicts: [],
      samples: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Depois que o registro foi salvo na nuvem: grava as amostras dele e guarda no
 * aparelho o acondicionamento usado. `change` ausente = nada a gravar (devolve null).
 */
export async function saveSamplesOfSavedEntry(
  entryId: string,
  change: SamplesChange | undefined,
): Promise<SamplesSaveResult | null> {
  if (!change) {
    return null;
  }

  const result = await saveEntrySamples(entryId, change);

  if (result.ok) {
    rememberLastSamplePackaging(change.samples);
  }

  return result;
}

/** Aviso do formulário quando o registro foi salvo e as amostras não. */
export function samplesNotSavedMessage(result: Extract<SamplesSaveResult, { ok: false }>) {
  const what = result.conflicts.length
    ? "há código de amostra repetido. Veja o aviso em “Amostras do ponto” e salve de novo."
    : `${result.error} Toque em “Salvar registro” de novo.`;

  return `O registro de campo foi salvo, mas as amostras ainda não: ${what}`;
}

function describeFailure(status: number, serverMessage: string) {
  if (status === 401) {
    return "Sua sessão expirou antes de salvar as amostras. Entre de novo no sistema, em outra aba, e salve outra vez.";
  }

  if (status === 403) {
    return serverMessage || "Seu perfil não tem permissão para gravar amostras.";
  }

  return serverMessage || `A nuvem não confirmou a gravação das amostras (erro ${status}).`;
}

/** Amostras como a nuvem devolve, já conferidas. O que não é amostra fica de fora. */
export function readSamples(value: unknown): FieldSample[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const samples: FieldSample[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;

    const raw = item as Record<string, unknown>;
    const conservation = conservationTypes.find((option) => option.value === raw.conservation)?.value;

    if (typeof raw.id !== "string" || typeof raw.code !== "string" || !isSampleTypeId(raw.sampleType) || !conservation) {
      continue;
    }

    samples.push({
      id: raw.id,
      entryId: typeof raw.entryId === "string" ? raw.entryId : "",
      code: raw.code,
      projectCode: typeof raw.projectCode === "string" ? raw.projectCode : "",
      sampleType: raw.sampleType,
      sequence: Number(raw.sequence) || 1,
      depthM: typeof raw.depthM === "number" ? raw.depthM : null,
      quantity: typeof raw.quantity === "number" ? raw.quantity : null,
      quantityUnit: typeof raw.quantityUnit === "string" ? raw.quantityUnit : "",
      specification: typeof raw.specification === "string" ? raw.specification : "",
      conservation,
      packaging: typeof raw.packaging === "string" ? raw.packaging : "",
      boxPosition: typeof raw.boxPosition === "string" ? raw.boxPosition : "",
      exportedAt: typeof raw.exportedAt === "string" && raw.exportedAt ? raw.exportedAt : null,
    });
  }

  return samples;
}

function readConflicts(value: unknown): SampleCodeConflict[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const conflicts: SampleCodeConflict[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") continue;

    const raw = item as Record<string, unknown>;
    const suggestedSequence = Number(raw.suggestedSequence);

    if (
      typeof raw.sampleId !== "string" ||
      typeof raw.code !== "string" ||
      typeof raw.suggestedCode !== "string" ||
      !Number.isInteger(suggestedSequence) ||
      suggestedSequence < 1
    ) {
      continue;
    }

    conflicts.push({
      sampleId: raw.sampleId,
      code: raw.code,
      suggestedSequence,
      suggestedCode: raw.suggestedCode,
      sameEntry: raw.sameEntry === true,
    });
  }

  return conflicts;
}
