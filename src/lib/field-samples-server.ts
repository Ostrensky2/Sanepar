import "server-only";

import { sortSamples, type FieldSample } from "@/lib/field-samples";
import { conservationTypes, isSampleTypeId, parseSampleCode } from "@/lib/field-standard";

/**
 * Amostras do ponto no banco (tabela field_diary_samples), usadas pela rota das
 * amostras e pela exportação para o Biolog.
 */

export const SAMPLES_TABLE = "field_diary_samples";

type DatabaseError = { code?: string; message?: string };

export type SampleRow = {
  id: string;
  entry_id: string;
  sample_code: string;
  project_code: string;
  sample_type: string;
  sequence: number;
  depth_m: number | string | null;
  quantity: number | string | null;
  quantity_unit: string;
  specification: string | null;
  conservation: string;
  packaging: string | null;
  box_position: string | null;
  /** Só existe depois da migration 20261111150000 (marca de exportação). */
  exported_at?: string | null;
};

export function samplesFromRows(rows: SampleRow[]): FieldSample[] {
  const samples: FieldSample[] = [];

  for (const row of rows) {
    const conservation = conservationTypes.find((item) => item.value === row.conservation)?.value;

    // Linha fora do padrão (não deveria existir: o banco confere): fica de fora
    // em vez de derrubar a tela.
    if (!isSampleTypeId(row.sample_type) || !conservation || !parseSampleCode(row.sample_code)) {
      continue;
    }

    samples.push({
      id: row.id,
      entryId: row.entry_id,
      code: row.sample_code,
      projectCode: row.project_code,
      sampleType: row.sample_type,
      sequence: Number(row.sequence),
      depthM: toNumber(row.depth_m),
      quantity: toNumber(row.quantity),
      quantityUnit: row.quantity_unit,
      specification: row.specification ?? "",
      conservation,
      packaging: row.packaging ?? "",
      boxPosition: row.box_position ?? "",
      exportedAt: row.exported_at || null,
    });
  }

  return sortSamples(samples);
}

/** PGRST205: tabela fora do cache de esquema do PostgREST; 42P01: tabela inexistente. */
export function isMissingSamplesTable(error: DatabaseError) {
  return error.code === "PGRST205" || error.code === "42P01";
}

/**
 * PGRST204: coluna fora do cache de esquema do PostgREST; 42703: coluna inexistente.
 * É o que o banco responde enquanto a marca de exportação não foi criada.
 */
export function isMissingExportedColumn(error: DatabaseError) {
  return (error.code === "PGRST204" || error.code === "42703") && /exported_at/.test(error.message ?? "");
}

function toNumber(value: number | string | null) {
  if (value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
