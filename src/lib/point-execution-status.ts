/**
 * Situação de execução do ponto no registro de campo.
 *
 * Os códigos são os mesmos do IAGen (sampling_points.execution_status), para que os
 * dois aplicativos falem a mesma língua. O banco confere a lista e exige motivo
 * quando o ponto foi realocado (regra field_diary_entries_relocation_reason_ck).
 */

export const pointExecutionStatuses = [
  "planned",
  "realized",
  "not_realized",
  "relocated",
  "blocked",
] as const;

export type PointExecutionStatus = (typeof pointExecutionStatuses)[number];

export const pointExecutionStatusLabels: Record<PointExecutionStatus, string> = {
  planned: "Planejado",
  realized: "Realizado",
  not_realized: "Não realizado",
  relocated: "Realocado",
  blocked: "Bloqueado",
};

export const RELOCATION_REASON_MAX_LENGTH = 500;

export function isPointExecutionStatus(value: unknown): value is PointExecutionStatus {
  return pointExecutionStatuses.includes(value as PointExecutionStatus);
}

/**
 * Aceita o código ("relocated") ou o rótulo em português ("Realocado", "realocado",
 * "Não realizado", "nao realizado"…). Devolve null quando não reconhece.
 */
export function parsePointExecutionStatus(value: unknown): PointExecutionStatus | null {
  if (isPointExecutionStatus(value)) {
    return value;
  }

  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  for (const status of pointExecutionStatuses) {
    if (normalizeText(pointExecutionStatusLabels[status]) === normalized || status.replace("_", " ") === normalized) {
      return status;
    }
  }

  return null;
}

export function pointExecutionStatusLabel(value: unknown) {
  const status = parsePointExecutionStatus(value);
  return status ? pointExecutionStatusLabels[status] : "Não informada";
}

/** Regra do banco: "realocado" exige motivo preenchido. */
export function validateRelocation(status: unknown, reason: unknown): string | null {
  const parsed = parsePointExecutionStatus(status);

  if (parsed !== "relocated") {
    return null;
  }

  const text = String(reason ?? "").trim();

  if (!text) {
    return "Informe o motivo da realocação: um ponto realocado precisa de justificativa.";
  }

  if (text.length > RELOCATION_REASON_MAX_LENGTH) {
    return `O motivo da realocação deve ter até ${RELOCATION_REASON_MAX_LENGTH} caracteres.`;
  }

  return null;
}

/**
 * Situação inferida para registros que ainda não têm uma (dados antigos e linhas
 * de planilha sem a coluna). É a mesma regra aplicada pela migration
 * 20261101120000_field_diary_coordinates_status_vocabulary.sql.
 * "Realocado" nunca é inferido: exige motivo, então só entra por escolha explícita.
 */
export function inferPointExecutionStatus(entry: {
  activities?: string[] | null;
  occurrenceType?: string | null;
  hasOccurrence?: boolean | null;
  pointAccessibility?: string | null;
  collectionTime?: string | null;
  samplesReplicasEdna?: string | null;
  zooplanktonId?: string | null;
}): PointExecutionStatus {
  const activities = (entry.activities ?? []).map(normalizeText);
  const occurrence = entry.hasOccurrence === false ? "" : normalizeText(entry.occurrenceType);
  const accessibility = normalizeText(entry.pointAccessibility);

  if (activities.includes("coleta nao realizada") || occurrence === "coleta nao realizada") {
    return "not_realized";
  }

  const hasCollection =
    activities.length > 0 ||
    Boolean(String(entry.collectionTime ?? "").trim()) ||
    Boolean(String(entry.samplesReplicasEdna ?? "").trim()) ||
    Boolean(String(entry.zooplanktonId ?? "").trim());

  if (hasCollection) {
    return "realized";
  }

  if (occurrence === "ponto inacessivel" || accessibility === "inacessivel" || accessibility === "acesso bloqueado") {
    return "blocked";
  }

  return "planned";
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[_\s]+/g, " ");
}
