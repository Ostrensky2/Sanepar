import { resolveCanonicalCampaign } from "@/lib/campaign-identity";

type Coordinate = { lat: number; lon: number } | null;
export type FieldReference = {
  campaign: number; sia: string; originalSia: string;
  identityStatus: "exact" | "ambiguous";
  original: Coordinate; effective: Coordinate;
  source: string; sourceId: string; sourceFileName: string; sourcePointId: string;
  sourceKind: "field_workbook" | "historical_snapshot";
  sourceQualification: "persisted_unverified" | "historical_context";
  dateNature: "declared_reference";
  verificationBasis: string;
  sourceDate: string; sourceDateRaw: string; datePrecision: "civil_day" | "unknown";
  sourceDateField: "points.date"; sourceCell: null;
  waterBody: string; municipality: string;
  samplesReplicasEdna: string; zooplanktonId: string; collectionTime: string; executionStatus: string;
};
export type FieldImportSource = { id: string; file_name: string; created_at: string; points: unknown; campaign_key?: string | null };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

// Persisted calendar strings are not instants: never apply a timezone conversion.
export function fieldCivilDay(value: unknown): string {
  const raw = text(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (!iso && !br) return "";
  const [year, month, day] = iso ? iso.slice(1).map(Number) : [Number(br![3]), Number(br![2]), Number(br![1])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1000 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function coordinate(value: unknown): Coordinate {
  const v = record(value);
  return v && typeof v.lat === "number" && typeof v.lon === "number" && Number.isFinite(v.lat) && Number.isFinite(v.lon) && Math.abs(v.lat) <= 90 && Math.abs(v.lon) <= 180 ? { lat: v.lat, lon: v.lon } : null;
}

// Union of typed workbook evidence, not a latest-row winner. Different visits,
// dates and source IDs remain observable to the collection reconciliation layer.
export function readFieldReferences(sources: FieldImportSource[], campaign: number, kind: FieldReference["sourceKind"] = "field_workbook"): FieldReference[] {
  const target = resolveCanonicalCampaign(campaign);
  if (!target) return [];
  return [...sources].sort((a, b) => a.id.localeCompare(b.id)).flatMap((source) => {
    const name = text(source.file_name);
    if (kind === "field_workbook" && (name.startsWith("__") || !/\.xls[xm]$/i.test(name))) return [];
    if (!Array.isArray(source.points)) return [];
    return source.points.flatMap((value) => {
      const point = record(value);
      if (!point || resolveCanonicalCampaign(point.campaign)?.id !== target.id) return [];
      // A contradictory row-level campaign is not silently overridden by its points.
      if (source.campaign_key && resolveCanonicalCampaign(source.campaign_key)?.id !== target.id) return [];
      const originalSia = text(point.code);
      if (!originalSia) return [];
      const exact = /^(?:SIA[\s-]*)?0*(\d+)$/i.exec(originalSia);
      const sourceDateRaw = text(point.date), sourceDate = fieldCivilDay(sourceDateRaw);
      return [{ campaign, sia: exact ? `SIA-${exact[1].padStart(4, "0")}` : originalSia, originalSia,
        identityStatus: exact ? "exact" as const : "ambiguous" as const,
        original: coordinate(point.original), effective: coordinate(point.effective),
        source: `${kind === "field_workbook" ? "campaign_imports" : "Snapshot histórico"} ${source.id}: ${name}`,
        sourceId: source.id, sourceFileName: name, sourcePointId: text(point.id), sourceKind: kind,
        sourceQualification: kind === "field_workbook" ? "persisted_unverified" as const : "historical_context" as const,
        dateNature: "declared_reference" as const,
        verificationBasis: kind === "field_workbook"
          ? "Dataset persistido sem digest do XLSX original nem cadeia de importação verificável; nome e data não comprovam execução ou vínculo molecular."
          : "Integridade do snapshot histórico conferida; não comprova visita executada ou vínculo molecular.",
        sourceDate, sourceDateRaw, datePrecision: sourceDate ? "civil_day" as const : "unknown" as const,
        sourceDateField: "points.date" as const, sourceCell: null,
        waterBody: text(point.waterBody) || text(point.point), municipality: text(point.municipality),
        samplesReplicasEdna: text(point.samplesReplicasEdna), zooplanktonId: text(point.zooplanktonId),
        collectionTime: text(point.collectionTime), executionStatus: text(point.executionStatus),
      }];
    });
  });
}
