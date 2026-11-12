/**
 * Último acondicionamento e último preservante usados neste aparelho, por tipo de
 * amostra (ex.: "Isopor com gelo", "Longmire"), para a próxima amostra já vir
 * preenchida. Fica só no navegador.
 */

import { COLLECTION_TEXT_MAX_LENGTH, isSampleTypeId, type SampleTypeId } from "@/lib/field-standard";
import type { LastPackagingByType } from "@/lib/field-samples";

const STORAGE_KEY = "yvae:ultimo-acondicionamento";
const PRESERVATIVE_KEY = "yvae:ultimo-preservante";

export function readLastSamplePackaging(): LastPackagingByType {
  return readByType(STORAGE_KEY);
}

export function readLastSamplePreservative(): LastPackagingByType {
  return readByType(PRESERVATIVE_KEY);
}

function readByType(key: string): LastPackagingByType {
  try {
    const stored = JSON.parse(window.localStorage.getItem(key) ?? "{}") as unknown;

    if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
      return {};
    }

    const result: LastPackagingByType = {};

    for (const [type, value] of Object.entries(stored)) {
      const text = typeof value === "string" ? value.trim().slice(0, COLLECTION_TEXT_MAX_LENGTH) : "";

      if (isSampleTypeId(type) && text) {
        result[type] = text;
      }
    }

    return result;
  } catch {
    return {};
  }
}

/** Guarda o acondicionamento e o preservante das amostras que acabaram de ser gravadas. */
export function rememberLastSamplePackaging(
  samples: Array<{ sampleType: SampleTypeId; packaging: string; preservative?: string }>,
) {
  rememberByType(STORAGE_KEY, readLastSamplePackaging(), samples.map((sample) => [sample.sampleType, sample.packaging]));
  rememberByType(
    PRESERVATIVE_KEY,
    readLastSamplePreservative(),
    samples.map((sample) => [sample.sampleType, sample.preservative ?? ""]),
  );
}

function rememberByType(key: string, current: LastPackagingByType, values: Array<[SampleTypeId, string]>) {
  const next = { ...current };
  let changed = false;

  for (const [sampleType, value] of values) {
    const text = value.trim().slice(0, COLLECTION_TEXT_MAX_LENGTH);

    if (text && next[sampleType] !== text) {
      next[sampleType] = text;
      changed = true;
    }
  }

  if (!changed) {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Navegador sem armazenamento (modo privado, cota): o registro segue normal.
  }
}
