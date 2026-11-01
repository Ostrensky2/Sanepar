import { coordinateToText, validateCoordinatePair } from "@/lib/coordinates";
import {
  inferPointExecutionStatus,
  parsePointExecutionStatus,
  validateRelocation,
  type PointExecutionStatus,
} from "@/lib/point-execution-status";

type FieldRulesInput = {
  latitude?: unknown;
  longitude?: unknown;
  executionStatus?: unknown;
  relocationReason?: unknown;
};

/**
 * Regras do registro de campo que o banco também confere (coordenada e situação).
 * Formulário, API e importação usam a mesma função, para a pessoa ver o erro em
 * português antes de o banco recusar a gravação.
 */
export function fieldDiaryRuleErrors(entry: FieldRulesInput): string[] {
  const errors: string[] = [];
  const coordinates = validateCoordinatePair(entry.latitude, entry.longitude);

  if (!coordinates.ok) {
    errors.push(coordinates.error);
  }

  if (
    entry.executionStatus !== undefined &&
    entry.executionStatus !== null &&
    entry.executionStatus !== "" &&
    !parsePointExecutionStatus(entry.executionStatus)
  ) {
    errors.push(
      `A situação do ponto “${String(entry.executionStatus)}” não é reconhecida. Use Planejado, Realizado, Não realizado, Realocado ou Bloqueado.`,
    );
  }

  const relocationError = validateRelocation(entry.executionStatus, entry.relocationReason);

  if (relocationError) {
    errors.push(relocationError);
  }

  return errors;
}

/** Latitude/longitude prontas para o banco (numeric) ou erro em português. */
export function coordinatesForDatabase(latitude: unknown, longitude: unknown) {
  const result = validateCoordinatePair(latitude, longitude);

  if (!result.ok) {
    throw new FieldDiaryValidationError(result.error);
  }

  return { latitude: result.latitude, longitude: result.longitude };
}

export class FieldDiaryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldDiaryValidationError";
  }
}

export type FieldDiaryRuleColumns = {
  latitude: number | null;
  longitude: number | null;
  execution_status: PointExecutionStatus;
  relocation_reason: string | null;
};

/**
 * Colunas conferidas pelo banco, a partir do registro do app. Lança
 * FieldDiaryValidationError (mensagem em português) quando o registro não passa.
 */
export function fieldDiaryRuleColumns(
  entry: FieldRulesInput & Parameters<typeof inferPointExecutionStatus>[0],
): FieldDiaryRuleColumns {
  const [error] = fieldDiaryRuleErrors(entry);

  if (error) {
    throw new FieldDiaryValidationError(error);
  }

  const { latitude, longitude } = coordinatesForDatabase(entry.latitude, entry.longitude);
  const status = parsePointExecutionStatus(entry.executionStatus) ?? inferPointExecutionStatus(entry);
  const reason = String(entry.relocationReason ?? "").trim();

  return {
    latitude,
    longitude,
    execution_status: status,
    relocation_reason: status === "relocated" ? reason : null,
  };
}

/** Caminho inverso: colunas do banco para os campos do registro do app. */
export function fieldDiaryRuleFields(row: {
  latitude?: unknown;
  longitude?: unknown;
  execution_status?: unknown;
  relocation_reason?: unknown;
}) {
  return {
    latitude: coordinateToText(row.latitude),
    longitude: coordinateToText(row.longitude),
    executionStatus: parsePointExecutionStatus(row.execution_status) ?? undefined,
    relocationReason: row.relocation_reason ? String(row.relocation_reason) : "",
  };
}
