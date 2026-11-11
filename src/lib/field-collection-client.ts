/**
 * O que é gravado depois do registro de campo: as amostras do ponto e os
 * parâmetros medidos. Os dois vão para a nuvem só depois que o registro foi
 * confirmado, com o identificador que a nuvem devolveu.
 */

import {
  readingsNotSavedMessage,
  saveReadingsOfSavedEntry,
  type ReadingsChange,
  type ReadingsSaveResult,
} from "@/lib/field-parameters-client";
import {
  samplesNotSavedMessage,
  saveSamplesOfSavedEntry,
  type SamplesChange,
  type SamplesSaveResult,
} from "@/lib/field-samples-client";

/** O que o formulário entrega junto com o registro. Ausente = não mudou. */
export type CollectedChange = {
  samples?: SamplesChange;
  readings?: ReadingsChange;
};

/** Resultado de salvar o registro e, em seguida, as amostras e as medições dele. */
export type FieldRecordSaveOutcome = {
  /** Identificador do registro gravado; vazio quando o registro não foi salvo. */
  savedEntryId: string;
  samples: SamplesSaveResult | null;
  readings: ReadingsSaveResult | null;
};

/** Resultado quando o registro não chegou a ser salvo. */
export const RECORD_NOT_SAVED: FieldRecordSaveOutcome = { savedEntryId: "", samples: null, readings: null };

/**
 * Grava as amostras e as medições de um registro que a nuvem acabou de confirmar.
 * Uma coisa não depende da outra: se as amostras falharem, as medições são
 * gravadas mesmo assim.
 */
export async function saveCollectedOfSavedEntry(
  entryId: string,
  change: CollectedChange | undefined,
): Promise<FieldRecordSaveOutcome> {
  const samples = await saveSamplesOfSavedEntry(entryId, change?.samples);
  const readings = await saveReadingsOfSavedEntry(entryId, change?.readings);

  return { savedEntryId: entryId, samples, readings };
}

/**
 * Aviso do formulário quando o registro foi salvo e alguma parte não. Vazio =
 * tudo o que havia para gravar foi gravado.
 */
export function collectedNotSavedMessage(outcome: FieldRecordSaveOutcome) {
  const samplesFailed = outcome.samples && !outcome.samples.ok ? outcome.samples : null;
  const readingsFailed = outcome.readings && !outcome.readings.ok ? outcome.readings : null;

  if (samplesFailed && readingsFailed) {
    return (
      `${samplesNotSavedMessage(samplesFailed)} ` +
      `Os parâmetros medidos também não foram salvos: ${readingsNotSavedMessage(readingsFailed)}`
    );
  }

  if (samplesFailed) {
    return samplesNotSavedMessage(samplesFailed);
  }

  return readingsFailed
    ? `O registro de campo foi salvo, mas os parâmetros medidos ainda não: ${readingsNotSavedMessage(readingsFailed)}`
    : "";
}
