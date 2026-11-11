/**
 * Último acondicionamento usado neste aparelho, por tipo de amostra (ex.: "Isopor
 * com gelo"), para a próxima amostra já vir preenchida. Fica só no navegador.
 */

import { COLLECTION_TEXT_MAX_LENGTH, isSampleTypeId, type SampleTypeId } from "@/lib/field-standard";
import type { LastPackagingByType } from "@/lib/field-samples";

const STORAGE_KEY = "yvae:ultimo-acondicionamento";

export function readLastSamplePackaging(): LastPackagingByType {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as unknown;

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

/** Guarda o acondicionamento das amostras que acabaram de ser gravadas. */
export function rememberLastSamplePackaging(samples: Array<{ sampleType: SampleTypeId; packaging: string }>) {
  const next = readLastSamplePackaging();
  let changed = false;

  for (const sample of samples) {
    const text = sample.packaging.trim().slice(0, COLLECTION_TEXT_MAX_LENGTH);

    if (text && next[sample.sampleType] !== text) {
      next[sample.sampleType] = text;
      changed = true;
    }
  }

  if (!changed) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Navegador sem armazenamento (modo privado, cota): o registro segue normal.
  }
}
