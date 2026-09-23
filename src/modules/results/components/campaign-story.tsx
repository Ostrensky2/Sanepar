"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ResultsSourceAnalytics } from "@/lib/results-source-analytics-contract";
import type { SourcePreviewRow } from "@/lib/results-source-preview-contract";
import type { AnalyticalSet, ResultDomain, ResultPoint, ResultsCampaign } from "@/modules/results/types";
import { CampaignDataTable } from "./campaign-data-table";
import { completeStatistics, indexText, leadingCompletePoints } from "./campaign-overview";
import { readCampaignPreview } from "./campaign-source-table";
import { continuousResultColor } from "./result-visual";

// Narrativa (onde olhar → por quê → o que confirmar) sobre os índices publicados.
// Sem classes qualitativas: só valores 0–1 na mesma escala de cor do mapa.
export const DOMAIN_NAMES: Record<ResultDomain, string> = { environmental: "Ambiental", operational: "Operacional", humanHealth: "Saúde" };
export const SET_ORDER = ["cyanobacteria", "bacteria", "coi"] as const;
export const SET_SHORT: Record<AnalyticalSet, string> = { cyanobacteria: "Cianobactérias", bacteria: "Bactérias", coi: "Eucariotos COI" };
// Texto fixo por conjunto, não calculado por ponto nem derivado do índice.
export const CONFIRMATION_GUIDANCE: Record<AnalyticalSet, string> = {
  cyanobacteria: "microscopia com contagem de células e qPCR de genes de cianotoxinas (mcy, cyr, sxt); análise química de cianotoxinas se o sinal se repetir.",
  bacteria: "métodos normativos de indicadores (coliformes totais e E. coli) e cultura ou qPCR dirigida aos organismos de interesse sanitário.",
  coi: "identificação morfológica (microscopia ou lupa) e, para espécies exóticas ou invasoras, PCR específica.",
};
export type PointLeaders = ResultsSourceAnalytics["pointLeaders"][number]["bySet"];

const count = (value: number) => value.toLocaleString("pt-BR");
const rangeText = (range: { value: number | null; lower: number; upper: number }) => range.value === null ? `${indexText(range.lower)}–${indexText(range.upper)}` : indexText(range.value);
const place = (point: ResultPoint) => [point.municipality, point.siaCode].filter(Boolean).join(" · ");

const SET_CHIP: Record<AnalyticalSet, string> = { cyanobacteria: "Ciano", bacteria: "Bact", coi: "COI" };

/** Três selos fixos (Ciano · Bact · COI): qual conjunto entrou no cálculo e qual faltou. */
export function SetChips({ point, statusText }: { point: ResultPoint; statusText: (set: AnalyticalSet) => string }) {
  return <ul className="flex flex-wrap gap-1" aria-label="Conjuntos usados no cálculo">{SET_ORDER.map((set) => {
    const used = point.components[set].included;
    return <li key={set} title={`${SET_SHORT[set]}: ${used ? "usado no cálculo" : "não usado"} · ${statusText(set)}`}
      className={`rounded-full px-2 py-0.5 text-xs font-bold ${used ? "bg-[var(--status-success-soft)] text-[var(--status-success-strong)]" : "bg-[var(--status-danger-soft)] text-[var(--brand-danger)]"}`}>
      {SET_CHIP[set]} {used ? "✓" : "—"}<span className="sr-only">{used ? " usado" : " não usado"}</span>
    </li>;
  })}</ul>;
}

/** Faixa possível de um ponto parcial desenhada sobre a régua 0–1, com o texto ao lado. */
export function RangeBar({ lower, upper }: { lower: number; upper: number }) {
  return <span className="flex min-w-36 items-center gap-2">
    <span aria-hidden="true" className="relative h-2.5 flex-1 rounded bg-[var(--surface-soft)]">
      <span className="absolute inset-y-0 rounded border border-[var(--status-warning-strong)]" style={{ left: `${lower * 100}%`, width: `${Math.max(1, (upper - lower) * 100)}%`, background: `linear-gradient(to right, ${continuousResultColor(lower)}, ${continuousResultColor(upper)})` }} />
    </span>
    <span className="whitespace-nowrap text-xs tabular-nums">{indexText(lower)}–{indexText(upper)}</span>
  </span>;
}

/** Valor de domínio numa tabela: número + barra na escala de cor do mapa; faixa se parcial. */
export function DomainCell({ range }: { range: { value: number | null; lower: number; upper: number } }) {
  if (range.value === null) return <RangeBar lower={range.lower} upper={range.upper} />;
  return <span className="flex min-w-24 items-center gap-2"><strong className="w-10 tabular-nums">{indexText(range.value)}</strong><span aria-hidden="true" className="h-2 flex-1 rounded bg-[var(--surface-soft)]"><span className="block h-full rounded" style={{ width: `${Math.max(2, range.value * 100)}%`, background: continuousResultColor(range.value) }} /></span></span>;
}

export function IndexSwatch({ value }: { value: number | null }) {
  return <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ background: value === null ? "var(--surface-soft)" : continuousResultColor(value) }} />;
}

export function IndexBar({ value }: { value: number | null }) {
  return <span className="flex min-w-32 items-center gap-2"><strong className="tabular-nums">{indexText(value, "—")}</strong><span aria-hidden="true" className="h-2 flex-1 rounded bg-[var(--surface-soft)]">{value !== null && <span className="block h-full rounded" style={{ width: `${Math.max(2, value * 100)}%`, background: continuousResultColor(value) }} />}</span></span>;
}

export function DomainChips({ point }: { point: ResultPoint }) {
  if (point.completeness === "unavailable") return <span className="type-caption">Domínios indisponíveis</span>;
  return <ul className="flex flex-wrap gap-1.5" aria-label="Índice por domínio (0–1)">{(Object.keys(DOMAIN_NAMES) as ResultDomain[]).map((domain) => <li key={domain} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-white px-2 py-0.5 text-xs"><IndexSwatch value={point.domains[domain].value} /><span>{DOMAIN_NAMES[domain]}</span><strong className="tabular-nums">{rangeText(point.domains[domain])}</strong></li>)}</ul>;
}

/** Índices por domínio em linhas alinhadas (mesma posição em todos os cartões). */
export function DomainRows({ point }: { point: ResultPoint }) {
  return <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 border-t border-[var(--line-ghost)] pt-2 text-xs" aria-label="Índice por domínio (0–1)">{(Object.keys(DOMAIN_NAMES) as ResultDomain[]).map((domain) => <div key={domain} className="contents"><dt className="flex items-center gap-1.5 text-[var(--ink-soft)]"><IndexSwatch value={point.domains[domain].value} />{DOMAIN_NAMES[domain]}</dt><dd className="text-right font-bold tabular-nums">{rangeText(point.domains[domain])}</dd></div>)}</dl>;
}
export function CampaignKpiCards({ campaign, taxaCount }: { campaign: ResultsCampaign; taxaCount?: number }) {
  const stats = completeStatistics(campaign.points);
  const distinct = (key: "municipality" | "waterBody") => new Set(campaign.points.map((point) => point[key]?.trim()).filter(Boolean)).size;
  const records = campaign.points.reduce((sum, point) => sum + SET_ORDER.reduce((total, set) => total + point.components[set].recordCount, 0), 0);
  const partial = campaign.counts.partialWithTwoSets + campaign.counts.partialWithOneSet;
  const cards = [
    ["Pontos", count(campaign.points.length), `${campaign.counts.complete} completos · ${partial} parciais${campaign.counts.unavailable ? ` · ${campaign.counts.unavailable} indisponíveis` : ""}`],
    // A média usa só os pontos completos; o número de pontos entra como informação secundária.
    ["Índice médio — pontos completos", indexText(stats.mean, "—"), `${stats.included} pontos completos · mediana ${indexText(stats.median, "—")}`],
    ["Municípios", count(distinct("municipality")), `${distinct("waterBody")} mananciais`],
    ["Táxons distintos", taxaCount === undefined ? "…" : count(taxaCount), `${count(records)} registros`],
  ];
  return <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(([label, value, detail]) => <div key={label} className="app-card p-4"><dt className="type-label text-[var(--ink-soft)]">{label}</dt><dd className="heading-font type-kpi font-bold tabular-nums text-[var(--brand-navy-strong)]">{value}</dd><dd className="type-caption text-[var(--ink-soft)]">{detail}</dd></div>)}</dl>;
}

export function CampaignQuickRead({ campaign, campaignLabel, cyanoTop, onPoint }: { campaign: ResultsCampaign; campaignLabel: string; cyanoTop?: ResultsSourceAnalytics["topReads"][number] | null; onPoint: (point: ResultPoint) => void }) {
  const complete = campaign.points.filter((point) => point.completeness === "complete" && point.overall.value !== null);
  const top = leadingCompletePoints(campaign.points, 1)[0];
  const health = [...complete].sort((a, b) => (b.domains.humanHealth.value ?? -1) - (a.domains.humanHealth.value ?? -1))[0];
  const missing = SET_ORDER.map((set) => ({ set, points: campaign.points.filter((point) => point.components[set].recordCount === 0).length })).filter((item) => item.points).sort((a, b) => b.points - a.points);
  const partial = campaign.counts.partialWithTwoSets + campaign.counts.partialWithOneSet;
  const link = (point: ResultPoint, text: string) => <button type="button" className="text-left font-bold text-[var(--brand-navy-strong)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]" onClick={() => onPoint(point)}>{text}</button>;
  const items: [string, ReactNode][] = [
    ...(top ? [["Maior índice", <>{link(top, `${top.siaCode} · ${top.waterBody || "manancial não informado"}`)}, {top.municipality || "município não informado"} · <strong className="tabular-nums">{indexText(top.overall.value)}</strong></>] as [string, ReactNode]] : []),
    ...(health ? [["Maior índice de saúde", <>{link(health, `${health.siaCode} · ${health.municipality || "município não informado"}`)} · <strong className="tabular-nums">{indexText(health.domains.humanHealth.value)}</strong></>] as [string, ReactNode]] : []),
    ["Cianobactéria com mais reads", cyanoTop === undefined ? "Carregando…" : cyanoTop ? <><i>{cyanoTop.taxon}</i> · {count(cyanoTop.reads)} reads, em {cyanoTop.positivePoints} de {cyanoTop.denominatorPoints} pontos com registros</> : "Sem registros de cianobactérias"],
    ["Conjuntos ausentes", missing.length ? missing.map((item) => `${SET_SHORT[item.set]} sem registros em ${item.points} ${item.points === 1 ? "ponto" : "pontos"}`).join("; ") : "Os três conjuntos têm registros em todos os pontos"],
    ["Pontos parciais", partial ? `${partial} · aparecem só com a faixa possível, fora do ranking` : "Nenhum; todos os pontos com resultado são completos"],
  ];
  return <section className="app-card p-4"><h3 className="type-panel-title">Leitura rápida · {campaignLabel}</h3><dl className="mt-3 divide-y divide-[var(--line-ghost)]">{items.map(([label, value]) => <div key={label} className="grid gap-1 py-2 sm:grid-cols-[13rem_1fr]"><dt className="type-label text-[var(--ink-soft)]">{label}</dt><dd className="type-body">{value}</dd></div>)}</dl></section>;
}

// Cartões enxutos: identificação, índices alinhados e acesso à ficha. Os organismos ficam na ficha.
export function PriorityCards({ points, onPoint }: { points: ResultPoint[]; onPoint: (point: ResultPoint) => void }) {
  if (!points.length) return <p role="status">Nenhum ponto completo para ordenar nesta campanha.</p>;
  return <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Maiores índices gerais entre os pontos completos">{points.map((point) => <li key={point.key}><button type="button" onClick={() => onPoint(point)} className="app-card flex h-full w-full flex-col gap-2 border-t-4 p-3 text-left transition hover:shadow-[var(--shadow-soft)] focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]" style={{ borderTopColor: continuousResultColor(point.overall.value ?? 0) }}>
    <span className="flex items-start justify-between gap-2"><span className="heading-font text-2xl font-bold text-[var(--ink-soft)]">{point.overall.rank ?? "—"}</span><span className="heading-font type-kpi font-bold tabular-nums text-[var(--brand-navy-strong)]">{indexText(point.overall.value)}</span></span>
    <span><strong className="block leading-tight text-[var(--brand-navy-strong)]">{point.waterBody || "Manancial não informado"}</strong><span className="type-caption text-[var(--ink-soft)]">{place(point)}</span></span>
    <DomainRows point={point} />
    <span className="mt-auto type-label text-[var(--brand-navy-strong)] underline underline-offset-4">Abrir ficha</span>
  </button></li>)}</ol>;
}

export function usePointLeaders(analytics: { data?: ResultsSourceAnalytics } | undefined) {
  return analytics?.data ? Object.fromEntries(analytics.data.pointLeaders.map((item) => [item.sia, item.bySet])) as Record<string, PointLeaders> : undefined;
}

const ALERT_DOMAINS = [["Ambiental", "Ambiental"], ["Operacional", "Operacional"], ["Saúde humana", "Saúde"]] as const;
const literal = (value: unknown) => typeof value === "string" && value.trim() && !/^não identificado/i.test(value.trim()) ? value.trim() : "";

export function CampaignAlertsByPoint({ campaign, sourceHash, publicationId, onPoint }: { campaign: ResultsCampaign; sourceHash?: string; publicationId?: string; onPoint: (point: ResultPoint) => void }) {
  const requestKey = `${campaign.campaignCode}|${sourceHash}|${publicationId}`;
  const [loaded, setLoaded] = useState<{ key: string; rows?: SourcePreviewRow[]; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ campaignCode: campaign.campaignCode, section: "alerts", groupBy: "point", limit: "500" });
    if (publicationId) { params.set("source", "published"); params.set("publicationId", publicationId); }
    if (sourceHash) params.set("sourceHash", sourceHash);
    void readCampaignPreview(params, controller.signal).then((data) => { if (!controller.signal.aborted) setLoaded({ key: requestKey, rows: data.rows }); }).catch((error: unknown) => { if (!controller.signal.aborted) setLoaded({ key: requestKey, error: error instanceof Error ? error.message : "Alertas indisponíveis." }); });
    return () => controller.abort();
  }, [campaign.campaignCode, publicationId, requestKey, sourceHash]);
  const result = loaded?.key === requestKey ? loaded : undefined;
  if (!result) return <p role="status">Carregando os pontos com associação documentada…</p>;
  if (!result.rows) return <p role="alert">{result.error}</p>;
  const pointOf = (row: SourcePreviewRow) => campaign.points.find((point) => point.siaCode === row["Cód. SIA"]);
  const rows = result.rows.flatMap((row) => { const point = pointOf(row); return point ? [{ row, point }] : []; });
  const domainsText = ({ row }: (typeof rows)[number]) => ALERT_DOMAINS.filter(([key]) => Number(row[key]) > 0).map(([, label]) => label).join(" + ") || "Sem domínio";
  return <CampaignDataTable
    title={`${rows.length} de ${campaign.points.length} pontos com associação documentada`}
    rows={rows}
    population={campaign.points.length}
    rowKey={({ point }) => point.key}
    initialSort="index"
    initialDescending
    filter={{ label: "Domínios", value: domainsText }}
    onDetail={({ point }) => onPoint(point)}
    detailLabel="Ver ponto"
    columns={[
      { key: "point", label: "Ponto", value: ({ point }) => `${point.siaCode} ${point.waterBody ?? ""} ${point.municipality ?? ""}`, render: ({ point }) => <><strong className="block">{point.waterBody || point.siaCode}</strong><span className="type-caption">{place(point)}</span></> },
      { key: "domains", label: "Táxons associados por domínio", value: domainsText, render: ({ row }) => <ul className="flex flex-wrap gap-1">{ALERT_DOMAINS.filter(([key]) => Number(row[key]) > 0).map(([key, label]) => <li key={key} className="rounded-full border border-[var(--line-strong)] px-2 py-0.5 text-xs font-bold">{label} {String(row[key])}</li>)}</ul> },
      { key: "organisms", label: "Táxons associados (total)", value: ({ row }) => Number(row["Organismos com associação"]) },
      { key: "reason", label: "Destaque", value: ({ row }) => `${row["Organismo em destaque"]} ${row["Efeito documentado"] ?? ""}`, render: ({ row }) => <span className="block min-w-56"><i>{String(row["Organismo em destaque"])}</i> <span className="text-[var(--ink-soft)]">({count(Number(row["Reads do destaque"]) || 0)} reads, {String(row["Conjunto do destaque"]).toLocaleLowerCase("pt-BR")}; score bibliográfico {String(row["Maior score bibliográfico"])})</span>{literal(row["Efeito documentado"]) && <>: {literal(row["Efeito documentado"])}</>}{literal(row["Toxina ou composto"]) && <> Composto: {String(literal(row["Toxina ou composto"])).replace(/\.+$/, "")}.</>}</span> },
      { key: "index", label: "Índice geral", value: ({ point }) => point.overall.value, render: ({ point }) => point.overall.value === null ? <span className="tabular-nums">{point.completeness === "unavailable" ? "Indisponível" : rangeText(point.overall)}</span> : <IndexBar value={point.overall.value} /> },
    ]}
  />;
}
