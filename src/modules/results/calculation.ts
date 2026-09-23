import {
  ANALYTICAL_SETS,
  RESULT_DOMAINS,
  type AnalyticalSet,
  type ResultCompleteness,
  type ResultDomain,
  type ResultRange,
} from "./types";

export const RESULTS_ALPHA = 100;

export function calculateComponentIndex(weightedSignal: number, alpha = RESULTS_ALPHA) {
  assertUnitInterval(weightedSignal, "sinal ponderado");
  if (alpha < 0) throw new Error("A curvatura alfa não pode ser negativa.");
  return alpha === 0 ? weightedSignal : Math.log1p(alpha * weightedSignal) / Math.log1p(alpha);
}

export function calculateWeightedSignal(
  rows: ReadonlyArray<{ reads: number; score: number | null }>,
) {
  for (const row of rows) {
    if (!Number.isFinite(row.reads) || row.reads < 0) throw new Error("Reads devem ser finitos e não negativos.");
  }
  const totalReads = rows.reduce((sum, row) => sum + row.reads, 0);
  if (!(totalReads > 0)) return { totalReads, scoredReads: 0, coverage: null, signal: null, index: null };
  let scoredReads = 0;
  let weighted = 0;
  for (const row of rows) {
    if (row.score === null) continue;
    if (![1, 2, 3].includes(row.score)) throw new Error(`Score bibliográfico inválido: ${row.score}.`);
    scoredReads += row.reads;
    weighted += row.reads * (row.score / 3);
  }
  const signal = weighted / totalReads;
  return {
    totalReads,
    scoredReads,
    coverage: scoredReads / totalReads,
    signal,
    index: calculateComponentIndex(signal),
  };
}

export function calculateAggregates(
  components: Record<AnalyticalSet, Record<ResultDomain, number | null>>,
) {
  const usedSets = ANALYTICAL_SETS.filter((set) =>
    RESULT_DOMAINS.every((domain) => components[set][domain] !== null),
  );
  const k = usedSets.length;
  const domains = Object.fromEntries(
    RESULT_DOMAINS.map((domain) => {
      const squareSum = usedSets.reduce((sum, set) => sum + (components[set][domain] as number) ** 2, 0);
      const lower = k === 0 ? 0 : Math.sqrt(squareSum / 3);
      const upper = k === 0 ? 1 : Math.sqrt((squareSum + 3 - k) / 3);
      return [domain, { value: k === 3 ? lower : null, lower, upper } satisfies ResultRange];
    }),
  ) as Record<ResultDomain, ResultRange>;
  const overallLower = mean(RESULT_DOMAINS.map((domain) => domains[domain].lower));
  const overallUpper = mean(RESULT_DOMAINS.map((domain) => domains[domain].upper));
  return {
    usedSetCount: k,
    completeness: completenessFor(k),
    domains,
    overall: {
      value: k === 3 ? mean(RESULT_DOMAINS.map((domain) => domains[domain].value as number)) : null,
      lower: overallLower,
      upper: overallUpper,
    },
  };
}

export function competitionRanks<T>(rows: readonly T[], value: (row: T) => number) {
  return new Map(rows.map((row) => [row, 1 + rows.filter((other) => value(other) > value(row)).length]));
}

export function completenessFor(k: number): ResultCompleteness {
  if (k === 3) return "complete";
  if (k === 2) return "partial_2";
  if (k === 1) return "partial_1";
  if (k === 0) return "unavailable";
  throw new Error(`Quantidade inválida de conjuntos utilizados: ${k}.`);
}

function mean(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function assertUnitInterval(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label} fora da escala 0–1: ${value}.`);
  }
}
