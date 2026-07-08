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

export function classifyFieldDiaryImport(
  incoming: FieldDiaryEntry,
  existing: FieldDiaryEntry | null,
  entityKey: string,
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
  // app, divergências viram conflito e o dado do app é mantido.
  const protectedEntry = isGovernanceProtected(existing.governanceStatus);

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

  return changed
    ? { status: "additive", entry: merged, conflicts: [] }
    : { status: "identical", entry: existing, conflicts: [] };
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
