import { digest } from "./canonical";

export const SCHEMA_VERSION = "yvae-tape/3";
export const HASH_VERSION = "yvae-canonical-json/1";
export const PHOTO_LIMIT_BYTES = 20_000_000;
export const DOCUMENT_LIMIT_BYTES = 50_000_000;

export type EntityType =
  | "point" | "campaign" | "plannedPoint" | "entry" | "sample" | "parameter"
  | "reading" | "action" | "photo" | "document";

/** Campos de cada entidade. Uma chave fora desta lista nunca sai do Yva'e. */
export const FIELDS: Record<EntityType, readonly string[]> = {
  point: ["code", "name", "municipality", "waterBody", "lat", "lon", "coordinateSource", "nameVariants"],
  campaign: ["number", "name", "status", "period", "plannedPointsLabel", "note", "planningRevisionId", "planningRevisionAt", "planningRevisionCount"],
  plannedPoint: ["campaignId", "pointId", "plannedDate", "dayLabel", "order", "activities", "samplesNote", "lat", "lon", "effectiveLat", "effectiveLon", "executionStatus", "revisionId"],
  entry: [
    "campaignId", "campaignName", "campaignDay", "pointId", "sia", "locationName", "municipality", "entryDate",
    "collectionTime", "collectionStartedAt", "executionStatus", "editorialStatus", "governanceStatus", "lat", "lon",
    "coordinateSource", "gpsAccuracyM", "activities", "waterVisualConditions", "weatherConditions", "pointAccessibility",
    "dailySummary", "hasOccurrence", "occurrenceType", "occurrenceDescription", "requiresFollowUp", "followUpNotes",
    "relocationReason", "collectionOrder", "missingInImport", "teamName", "teamMembers", "authorName", "samplesNote",
    "zooplanktonId", "createdAt",
  ],
  sample: ["entryId", "sampleCode", "projectCode", "sampleType", "sequence", "depthM", "quantity", "quantityUnit", "specification", "conservation", "packaging", "preservative", "boxPosition"],
  parameter: ["label", "unit", "min", "max", "usesDepth", "active", "appliesTo", "isBase"],
  reading: ["entryId", "parameterId", "value", "unit", "depthM", "measuredTime", "equipment"],
  action: ["eventName", "objectives", "createdAtLabel", "places"],
  photo: ["parentType", "parentId", "opaqueId", "caption", "originalName", "width", "height", "uploadedAt", "size", "mime", "sha256", "objectState", "objectReason"],
  document: [
    "title", "category", "status", "campaignLabel", "pointLabel", "campaignId", "pointId", "actionId", "referenceDateLabel",
    "sourceType", "originalName", "opaqueId", "size", "mime", "sha256", "objectState", "objectReason", "fieldScope",
    "fieldScopeReason",
  ],
};

/** Campos que apontam para outra entidade do mesmo retrato. */
export const RELATIONS: Partial<Record<EntityType, readonly string[]>> = {
  plannedPoint: ["campaignId", "pointId"],
  entry: ["campaignId", "pointId"],
  sample: ["entryId"],
  reading: ["entryId", "parameterId"],
  photo: ["parentId"],
  document: ["campaignId", "pointId", "actionId"],
};

export type Derivation = { field: string; rule: string; status: "derived" | "missing" | "pending" };
export type Provenance = {
  sourceEntity: string;
  sourceFields: string[];
  identityStatus: "authoritative" | "derived" | "derived-pending";
  derivations: Derivation[];
};
export type WireItem = {
  entityType: EntityType;
  sourceId: string;
  contentVersion: string;
  hashVersion: typeof HASH_VERSION;
  contentHash: string;
  sourceUpdatedAt: string | null;
  operation: "upsert";
  payload: Record<string, unknown>;
  provenance: Provenance;
};
export type Totals = {
  rowsByEntityType: Record<string, number>;
  relationReferences: number;
  distinctObjects: number;
};
export type Envelope = {
  schemaVersion: typeof SCHEMA_VERSION;
  issuer: string;
  scopeId: string;
  sourceProjectId: string;
  destinationProjectId: string;
  destinationContractId: string;
  snapshotId: string;
  asOf: string;
  highWatermark: string;
  totals: Totals;
};

export function makeItem(
  entityType: EntityType,
  sourceId: string,
  payload: Record<string, unknown>,
  provenance: Provenance,
  sourceUpdatedAt: string | null,
): WireItem {
  const allowed = FIELDS[entityType];
  const unknown = Object.keys(payload).filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !(key in payload));
  if (!sourceId || unknown.length || missing.length) throw new Error("invalid_entity");
  const base = {
    entityType,
    sourceId,
    contentVersion: `sha256:${digest({ entityType, sourceId, payload })}`,
    hashVersion: HASH_VERSION as typeof HASH_VERSION,
    operation: "upsert" as const,
    payload,
    provenance,
  };
  return { ...base, contentHash: digest(base), sourceUpdatedAt };
}

export function relationReferences(items: WireItem[]): number {
  let total = 0;
  for (const item of items) {
    for (const field of RELATIONS[item.entityType] ?? []) {
      const value = item.payload[field];
      if (typeof value === "string" && value.length > 0) total += 1;
    }
  }
  return total;
}

export function totalsOf(items: WireItem[]): Totals {
  const rowsByEntityType: Record<string, number> = {};
  const objects = new Set<string>();
  for (const item of items) {
    rowsByEntityType[item.entityType] = (rowsByEntityType[item.entityType] ?? 0) + 1;
    if ((item.entityType === "photo" || item.entityType === "document") && typeof item.payload.opaqueId === "string") {
      objects.add(item.payload.opaqueId);
    }
  }
  return { rowsByEntityType, relationReferences: relationReferences(items), distinctObjects: objects.size };
}
