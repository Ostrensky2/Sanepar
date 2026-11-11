import "server-only";

import {
  baseParameterCatalog,
  sortCatalog,
  type FieldParameter,
  type FieldParameterInput,
  type FieldReading,
} from "@/lib/field-parameters";
import { isSampleTypeId } from "@/lib/field-standard";
import type { createOptionalSupabaseClient } from "@/lib/supabase";

/**
 * Catálogo de parâmetros no banco (tabela field_parameters), usado pelas rotas do
 * catálogo e das medições.
 */

export const PARAMETERS_TABLE = "field_parameters";
export const READINGS_TABLE = "field_parameter_readings";

type SupabaseClient = NonNullable<ReturnType<typeof createOptionalSupabaseClient>>;
type DatabaseError = { code?: string; message?: string };

export type ParameterRow = {
  id: string;
  label: string;
  unit: string | null;
  min_value: number | string | null;
  max_value: number | string | null;
  applies_to: string[] | null;
  uses_depth: boolean | null;
  biolog_column: string | null;
  is_base: boolean | null;
  active: boolean | null;
  sort_order: number | null;
};

export type CatalogRead =
  | { ok: true; available: true; parameters: FieldParameter[] }
  /** O banco ainda não tem as tabelas (migration 20261111140000 não aplicada). */
  | { ok: true; available: false; parameters: FieldParameter[] }
  | { ok: false };

/** PGRST205: tabela fora do cache de esquema do PostgREST; 42P01: tabela inexistente. */
export function isMissingTable(error: DatabaseError) {
  return error.code === "PGRST205" || error.code === "42P01";
}

export async function readParameterCatalog(supabase: SupabaseClient): Promise<CatalogRead> {
  const { data, error } = await supabase.from(PARAMETERS_TABLE).select("*").returns<ParameterRow[]>();

  if (error) {
    return isMissingTable(error) ? { ok: true, available: false, parameters: baseParameterCatalog() } : { ok: false };
  }

  return { ok: true, available: true, parameters: sortCatalog(parametersFromRows(data ?? [])) };
}

export function parametersFromRows(rows: ParameterRow[]): FieldParameter[] {
  const parameters: FieldParameter[] = [];

  for (const row of rows) {
    const appliesTo = (row.applies_to ?? []).filter(isSampleTypeId);

    // Linha fora do padrão (não deveria existir: o banco confere): fica de fora
    // em vez de derrubar a tela.
    if (!row.id || !row.label || !appliesTo.length) {
      continue;
    }

    parameters.push({
      id: row.id,
      label: row.label,
      unit: row.unit ?? "",
      min: toNumber(row.min_value),
      max: toNumber(row.max_value),
      appliesTo,
      usesDepth: row.uses_depth !== false,
      biologColumn: row.biolog_column || null,
      isBase: row.is_base === true,
      active: row.active !== false,
      sortOrder: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 1000,
    });
  }

  return parameters;
}

/** Colunas que a pessoa pode informar ao criar ou alterar um parâmetro. */
export function parameterInputToRow(input: FieldParameterInput) {
  return {
    label: input.label,
    unit: input.unit,
    min_value: input.min,
    max_value: input.max,
    applies_to: input.appliesTo,
    uses_depth: input.usesDepth,
  };
}

export function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export type ReadingRow = {
  id: string;
  entry_id: string;
  parameter_id: string;
  value: number | string;
  unit: string | null;
  depth_m: number | string | null;
  measured_time: string | null;
  equipment: string | null;
};

export function readingsFromRows(rows: ReadingRow[]): FieldReading[] {
  const readings: FieldReading[] = [];

  for (const row of rows) {
    const value = toNumber(row.value);

    // Linha fora do padrão (não deveria existir: o banco confere): fica de fora
    // em vez de derrubar a tela.
    if (value === null || !row.id || !row.parameter_id) {
      continue;
    }

    readings.push({
      id: row.id,
      entryId: row.entry_id,
      parameterId: row.parameter_id,
      value,
      unit: row.unit ?? "",
      depthM: toNumber(row.depth_m),
      measuredTime: row.measured_time ?? "",
      equipment: row.equipment ?? "",
    });
  }

  return readings;
}
