import { isGovernanceProtected, type FieldDiaryEntry } from "@/lib/field-diary";

export type ImportConflict = {
  entityType: "diario";
  entityKey: string;
  fieldName: keyof FieldDiaryEntry;
  appValue: unknown;
  sheetValue: unknown;
};

export type FieldDiaryImportClassification =
  | { status: "new"; entry: FieldDiaryEntry; conflicts: [] }
  | { status: "identical"; entry: FieldDiaryEntry; conflicts: [] }
  | { status: "additive"; entry: FieldDiaryEntry; conflicts: [] }
  | { status: "conflict"; entry: FieldDiaryEntry; conflicts: ImportConflict[] };

const COMPARED_FIELDS: Array<keyof FieldDiaryEntry> = [
  "campaignDay",
  "entryDate",
  "collectionTime",
  "createdByName",
  "locationName",
  "sia",
  "samplesReplicasEdna",
  "zooplanktonId",
  "latitude",
  "longitude",
  // Só entra na comparação quando a planilha traz a coluna "Situação do ponto"
  // (sem ela o campo fica vazio e o valor do app é mantido).
  "executionStatus",
  "relocationReason",
  "municipality",
  "activities",
  "waterVisualConditions",
  "hasOccurrence",
  "occurrenceType",
  "occurrenceDescription",
  "requiresFollowUp",
  "followUpNotes",
  "weatherConditions",
  "pointAccessibility",
  "dailySummary",
  "status",
  "photos",
];

// O histórico também guarda de onde veio a coordenada (GPS, planejada ou digitada).
// Ela fica fora da comparação com a planilha, que nunca traz essa informação.
const HISTORY_FIELDS: Array<keyof FieldDiaryEntry> = [...COMPARED_FIELDS, "coordinateSource"];

export function classifyFieldDiaryImport(
  incoming: FieldDiaryEntry,
  existing: FieldDiaryEntry | null,
  entityKey: string,
  options?: { force?: boolean },
): FieldDiaryImportClassification {
  if (!existing) {
    return { status: "new", entry: incoming, conflicts: [] };
  }

  const merged: FieldDiaryEntry = {
    ...existing,
    updatedAt: incoming.updatedAt,
  };
  const conflicts: ImportConflict[] = [];
  let changed = false;
  // Enquanto o registro está "importado" (preliminar), a planilha oficial da
  // campanha vence e sobrescreve. Depois de consolidado/revisado/corrigido no
  // app, divergências viram conflito e o dado do app é mantido — a menos que o
  // usuário force explicitamente a planilha (resolução de conflito assumida).
  const protectedEntry = options?.force ? false : isGovernanceProtected(existing.governanceStatus);

  for (const fieldName of COMPARED_FIELDS) {
    const appValue = existing[fieldName];
    const sheetValue = incoming[fieldName];

    if (!hasValue(sheetValue)) {
      continue;
    }

    if (!hasValue(appValue)) {
      (merged as Record<keyof FieldDiaryEntry, unknown>)[fieldName] = sheetValue;
      changed = true;
      continue;
    }

    if (equivalent(appValue, sheetValue)) {
      continue;
    }

    if (protectedEntry) {
      conflicts.push({
        entityType: "diario",
        entityKey,
        fieldName,
        appValue,
        sheetValue,
      });
      continue;
    }

    // Preliminar: a planilha da campanha é a verdade — sobrescreve o campo.
    (merged as Record<keyof FieldDiaryEntry, unknown>)[fieldName] = sheetValue;
    changed = true;
  }

  if (conflicts.length) {
    return { status: "conflict", entry: existing, conflicts };
  }

  // A origem da coordenada (GPS, planejada, digitada) é do valor que estava no
  // app. Se a planilha trocou o número, a origem deixa de ser conhecida.
  if (
    !sameCoordinateValue(existing.latitude, merged.latitude) ||
    !sameCoordinateValue(existing.longitude, merged.longitude)
  ) {
    merged.coordinateSource = null;
    merged.gpsAccuracyM = null;
  }

  return changed
    ? { status: "additive", entry: merged, conflicts: [] }
    : { status: "identical", entry: existing, conflicts: [] };
}

function sameCoordinateValue(left: unknown, right: unknown) {
  if (!hasValue(left) || !hasValue(right)) {
    return hasValue(left) === hasValue(right);
  }

  return Number(left) === Number(right);
}

function hasValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return String(value ?? "").trim() !== "";
}

function equivalent(left: unknown, right: unknown) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return arrayKey(left) === arrayKey(right);
  }

  if (typeof left === "boolean" || typeof right === "boolean") {
    return Boolean(left) === Boolean(right);
  }

  return normalizeScalar(left) === normalizeScalar(right);
}

function arrayKey(value: unknown) {
  const items = Array.isArray(value) ? value : [];
  return [...new Set(items.map(normalizeScalar).filter(Boolean))].sort().join("|");
}

function normalizeScalar(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export type FieldDiaryFieldChange = {
  field: keyof FieldDiaryEntry;
  oldValue: string;
  newValue: string;
};

// Diferença campo a campo entre dois registros (para o histórico de alterações).
// Só considera os campos comparáveis; ignora diferenças irrelevantes de formato.
export function diffFieldDiaryEntries(
  oldEntry: FieldDiaryEntry,
  newEntry: FieldDiaryEntry,
): FieldDiaryFieldChange[] {
  const changes: FieldDiaryFieldChange[] = [];

  for (const field of HISTORY_FIELDS) {
    if (!equivalent(oldEntry[field], newEntry[field])) {
      changes.push({
        field,
        oldValue: stringifyChangeValue(oldEntry[field]),
        newValue: stringifyChangeValue(newEntry[field]),
      });
    }
  }

  return changes;
}

function stringifyChangeValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "")).join("; ");
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}
