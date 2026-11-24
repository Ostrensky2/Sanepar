import type { ResultDomain, ResultPoint } from "../types";
import { distribution } from "@/lib/capture-index/distribution";
export { distribution };

export type Metric = "overall" | ResultDomain;
export const domains = { environmental: "Ambiental", operational: "Operacional", humanHealth: "Saúde humana" };
export const bands = [
  { start: 0, label: "0 a <0,05", color: "#99caca" },
  { start: 0.05, label: "0,05 a <0,15", color: "#55a6a8" },
  { start: 0.15, label: "0,15 a <0,35", color: "#e9ad44" },
  { start: 0.35, label: "0,35 a <0,70", color: "#d7191c" },
  { start: 0.70, label: "0,70 a 1", color: "#762a83" },
];
/** Nome de cada faixa, na ordem de `bands`. Faixa não é classe de risco comprovada. */
export const bandNames = ["Sinal muito baixo", "Sinal fraco", "Atenção", "Prioridade", "Prioridade máxima"] as const;
export function fixedBandIndex(value: number | null) {
  if (value === null || !Number.isFinite(value) || value < 0 || value > 1) return -1;
  return bands.reduce((found, band, index) => value >= band.start ? index : found, -1);
}
export const relativeBands = [
  { label: "Até a mediana", color: "#c1d8e5" },
  { label: "Acima da mediana até P90", color: "#6dabc3" },
  { label: "Acima do P90", color: "#245d83" },
];

export function reading(point: ResultPoint, metric: Metric, relative?: ReturnType<typeof distribution>) {
  const value = metric === "overall" ? point.overall.value : point.domains[metric].value;
  const keys = Object.keys(domains) as ResultDomain[];
  // Na 0.8 o geral pode superar a maior categoria: a categoria determinante é a de maior nota (o piso).
  const top = keys.reduce<number | null>((best, k) => { const v = point.domains[k].value; return v !== null && (best === null || v > best) ? v : best; }, null);
  const winners = keys.filter(k => value !== null && point.domains[k].value === (metric === "overall" ? top : value));
  const domain = metric === "overall" ? [...winners].sort((a,b) =>
    (point.bibliographicCoverage?.[a] ?? -1) - (point.bibliographicCoverage?.[b] ?? -1))[0] : metric;
  const coverage = domain ? point.bibliographicCoverage?.[domain] : null;
  const grade = coverage == null ? "?" : coverage >= 0.5 ? "A" : coverage >= 0.2 ? "B" : "C";
  const band = relative && relative.median !== null && relative.p90 !== null
    ? relativeBands[value !== null && value > relative.p90 ? 2 : value !== null && value > relative.median ? 1 : 0]
    : bands[fixedBandIndex(value)];
  return {color: value === null ? null : band?.color ?? null, label: value === null ? (point.estimateState === "sem estimativa" ? "Sem estimativa" : "Sem medição") : band?.label, grade, domain, coverage, winners};
}
