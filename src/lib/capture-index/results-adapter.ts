import "server-only";
import type { AnalyticalSet, AnalyticalStatus, ResultDomain, ResultPoint, ResultsCampaign } from "@/modules/results/types";
import { captureIndexMeta, captureIndexRows, captureIndexView, type CaptureIndexRow } from "./index";

/** Ponte entre o índice de captação (IR-CAPTACAO) e o formato que as telas de resultados já consomem.
 * Nada é recalculado: cada número vem da saída versionada. As telas passam a mostrar o índice novo sem mudar de estrutura. */
export type CapturePointPlace = { latitude: number; longitude: number; waterBody: string | null; municipality: string | null };

const domainOf = { environmental: "Ambiental", operational: "Operacional", humanHealth: "Saúde humana" } as const;
// Os três "conjuntos" das telas: bactérias (16S), algas pelo cloroplasto (no lugar do antigo conjunto de cianobactérias) e COI.
const componentOf = { bacteria: "16S", cyanobacteria: "ALGAS", coi: "COI" } as const;
const statusOf = (status: string): AnalyticalStatus =>
  status === "disponível" ? "approved" : status === "inconclusivo" ? "inconclusive" : status === "ausente" ? "not_performed" : "missing_records";
export const canonicalSia = (value: string) => value.replace(/^0+(?=\d)/, "").trim();
const perDomain = <T,>(pick: (domain: ResultDomain) => T) =>
  ({ environmental: pick("environmental"), operational: pick("operational"), humanHealth: pick("humanHealth") });

function toPoint(row: CaptureIndexRow, place?: CapturePointPlace): ResultPoint {
  const measured = row.general !== null, view = captureIndexView(row), code = `C${row.campaign}`;
  const component = (set: AnalyticalSet) => {
    const name = componentOf[set], source = row.components[name], included = source.status === "disponível";
    const score = (domain: ResultDomain) => { const item = row.scores[domainOf[domain]]; return item && item.component === name ? item.score : null; };
    return { set, status: statusOf(source.status), sourceStatus: source.status, reason: included ? null : `${view.components.find(item => item.status === source.status)?.name ?? name}: ${source.status}`,
      totalReads: source.observedReads, recordCount: 0, included, calculated: perDomain(score), used: perDomain(score),
      bibliographicCoverage: perDomain(domain => row.scores[domainOf[domain]]?.evaluatedByComponent?.[name] ?? null) };
  };
  const used = (["bacteria", "cyanobacteria", "coi"] as const).filter(set => row.components[componentOf[set]].status === "disponível");
  const point = {
    key: `${code}|${row.sia}`, campaignCode: code, siaCode: row.sia,
    waterBody: place?.waterBody ?? null, municipality: place?.municipality ?? null,
    coordinates: place ? { latitude: place.latitude, longitude: place.longitude, source: "workbook_metadata" } : null,
    calculationVersion: captureIndexMeta.version, catalogVersion: captureIndexMeta.version,
    // Todo ponto com biblioteca utilizável tem as três notas e o índice geral; a falta do COI aparece nos conjuntos e na condição de uso.
    completeness: measured ? "complete" : "unavailable",
    availableSetCount: used.length, usedSetCount: used.length, unavailableSets: (["bacteria", "cyanobacteria", "coi"] as const).filter(set => !used.includes(set)),
    conditionOfUse: measured ? `Medição: ${view.coverage}. ${view.elevated}.` : "Sem medição: nenhuma biblioteca utilizável.",
    impactedRecordCount: Object.values(row.scores).reduce((sum, score) => sum + (score?.contributions.length ?? 0), 0),
    observations: row.alerts.length ? `${row.alerts.length} ponto(s) de atenção, sem efeito na nota.` : null,
    domains: perDomain(domain => { const score = row.scores[domainOf[domain]]; return { value: score?.score ?? null, lower: score?.floor ?? 0, upper: score?.ceiling ?? 0 }; }),
    overall: { value: row.general, lower: row.generalFloor ?? 0, upper: row.generalCeiling ?? 0, rank: row.rank },
    bibliographicCoverage: perDomain(domain => row.scores[domainOf[domain]]?.evaluated ?? null),
    components: { bacteria: component("bacteria"), cyanobacteria: component("cyanobacteria"), coi: component("coi") },
  };
  return point as unknown as ResultPoint; // as versões de cálculo e catálogo são as do índice novo, não as constantes do contrato antigo
}

export function captureIndexResultsCampaigns(places: ReadonlyMap<string, CapturePointPlace> = new Map()): ResultsCampaign[] {
  return [1, 2, 3].flatMap(campaign => {
    const rows = captureIndexRows(campaign);
    if (!rows.length) return [];
    const points = [...rows].sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)).map(row => toPoint(row, places.get(canonicalSia(row.sia))));
    const complete = points.filter(point => point.completeness === "complete").length;
    return [{ campaignCode: `C${campaign}`, points, counts: { total: points.length, complete, partialWithTwoSets: 0, partialWithOneSet: 0, unavailable: points.length - complete } }];
  });
}
