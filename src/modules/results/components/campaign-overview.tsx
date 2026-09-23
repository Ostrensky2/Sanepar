"use client";

import { useState } from "react";
import { CampaignHydroMap } from "@/components/campaign-hydro-map";
import type { ResultPoint, ResultsCampaign } from "@/modules/results/types";
import { buildResultMapPoints } from "./results-index-dashboard";
import { ResultMarkerLegend } from "./result-marker-legend";
import { ResultsInterpretationHelp } from "./results-interpretation-help";
import { continuousResultColor } from "./result-visual";

export { formatResultIndex as indexText } from "../format-index";
import { formatResultIndex as indexText } from "../format-index";
import { countLabel } from "@/lib/number-format";
export function completeStatistics(points: ResultPoint[]) {
  const values = points.filter((point) => point.completeness === "complete" && Number.isFinite(point.overall.value)).map((point) => point.overall.value!).sort((a, b) => a - b);
  const bins = Array.from({ length: 5 }, (_, i) => ({ lower: i / 5, upper: (i + 1) / 5, count: values.filter((value) => value >= i / 5 && (i === 4 ? value <= 1 : value < (i + 1) / 5)).length }));
  return { included: values.length, excluded: points.length - values.length, mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, median: values.length ? (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2 : null, bins };
}
export function leadingCompletePoints(points: ResultPoint[], count = 3) {
  const sorted = points.filter((point) => point.completeness === "complete" && Number.isFinite(point.overall.value)).sort((a, b) => b.overall.value! - a.overall.value!);
  const cutoff = sorted[Math.min(count, sorted.length) - 1]?.overall.value;
  return cutoff === undefined ? [] : sorted.filter((point) => point.overall.value! >= cutoff!);
}
export function campaignLocationIssue(point: ResultPoint) {
  return /^SIA-0*770$/.test(point.siaCode) && (point.campaignCode === "C1" || point.campaignCode === "C2") && point.coordinates !== null && point.coordinates.latitude === point.coordinates.longitude;
}

/** Só aparece quando falta município ou manancial em algum ponto. */
function missingIdentity(campaign: ResultsCampaign) {
  const municipality = campaign.points.filter((point) => !point.municipality?.trim()).length;
  const waterBody = campaign.points.filter((point) => !point.waterBody?.trim()).length;
  return [municipality ? `${countLabel(municipality, "ponto", "pontos")} sem município` : "", waterBody ? `${countLabel(waterBody, "ponto", "pontos")} sem manancial` : ""].filter(Boolean).join(" · ");
}

export function CampaignOverview({ campaign }: { campaign: ResultsCampaign }) {
  const stats = completeStatistics(campaign.points);
  return <section className="app-card space-y-3 p-4">
    <div className="flex items-center gap-1">
      <h3 className="type-panel-title">Distribuição do índice geral (0–1)</h3>
      <ResultsInterpretationHelp title="Como ler a distribuição">
        <p>Cada barra conta quantos pontos completos caíram naquela faixa do índice. A média e a mediana também usam só os {stats.included} completos; {stats.excluded} parciais ou indisponíveis ficam de fora.</p>
        <p>A tabela abaixo mostra, para cada conjunto, em quantos pontos houve registro e em quantos ele entrou no cálculo.</p>
        {missingIdentity(campaign) ? <p>{missingIdentity(campaign)}</p> : null}
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left font-bold">Conjuntos nos {campaign.points.length} pontos</caption><thead><tr><th>Conjunto</th><th>Com registros</th><th>Utilizados</th><th>Sem registros</th></tr></thead><tbody>{(["bacteria", "cyanobacteria", "coi"] as const).map((set) => <tr key={set} className="border-t border-[var(--line-ghost)]"><th className="py-2">{{ bacteria: "Bactérias", cyanobacteria: "Cianobactérias", coi: "COI" }[set]}</th><td>{campaign.points.filter((point) => point.components[set].recordCount > 0).length}</td><td>{campaign.points.filter((point) => point.components[set].included).length}</td><td>{campaign.points.filter((point) => point.components[set].recordCount === 0).length}</td></tr>)}</tbody></table></div>
      </ResultsInterpretationHelp>
    </div>
    <p className="type-caption text-[var(--ink-soft)]">Só pontos completos ({stats.included}) · média {indexText(stats.mean)} · mediana {indexText(stats.median)}</p>
    <ul className="space-y-2">{stats.bins.map((bin) => <li key={bin.lower} className="grid grid-cols-[6rem_1fr_2rem] items-center gap-3 text-sm"><span className="tabular-nums">{bin.lower.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}–{bin.upper.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}</span><span className="h-4 bg-[var(--surface-soft)]" aria-hidden="true"><span className="block h-full" style={{ width: `${stats.included ? bin.count / stats.included * 100 : 0}%`, background: continuousResultColor((bin.lower + bin.upper) / 2) }} /></span><strong className="tabular-nums">{bin.count}</strong></li>)}</ul>
  </section>;
}

// Só valores completos ordenam; parciais não entram em ranking (nem pelo limite superior).
export function municipalityGroups(points: ResultPoint[]) {
  const nameOf = (point: ResultPoint) => point.municipality?.trim() || "Município não informado";
  const completeValue = (point: ResultPoint) => point.completeness === "complete" ? point.overall.value : null;
  return [...points.reduce((groups, point) => groups.set(nameOf(point), [...(groups.get(nameOf(point)) ?? []), point]), new Map<string, ResultPoint[]>())]
    .map(([name, items]) => {
      const values = items.map(completeValue).filter((value): value is number => value !== null);
      return { name, items: [...items].sort((a, b) => (completeValue(b) ?? -1) - (completeValue(a) ?? -1) || a.siaCode.localeCompare(b.siaCode)), max: values.length ? Math.max(...values) : null };
    })
    .sort((a, b) => (b.max ?? -1) - (a.max ?? -1) || a.name.localeCompare(b.name, "pt-BR"));
}

export function CampaignOnlyMap({ points, photos, onPoint }: { points: ResultPoint[]; photos: Record<string, string>; onPoint: (point: ResultPoint) => void }) {
  const [selected, setSelected] = useState<string>();
  const [municipality, setMunicipality] = useState<string>();
  const municipalities = municipalityGroups(points);
  const active = municipalities.find((item) => item.name === municipality);
  const shown = active ? active.items : points;
  const mappable = shown.filter((point) => !campaignLocationIssue(point));
  const mapPoints = buildResultMapPoints(mappable, "overall", {}, photos);
  const selectedPoint = shown.find((point) => point.key === selected);
  return <section className="app-card overflow-hidden p-0">
    <header className="flex flex-wrap items-start justify-between gap-3 p-4"><div className="min-w-0"><h3 className="type-panel-title">Mapa e municípios</h3><p className="type-metadata">{mapPoints.length} de {shown.length} pontos no mapa{active ? ` · ${active.name}` : ""}. Clique num ponto ou num município.</p></div>{selectedPoint && <button type="button" className="min-h-11 rounded border border-[var(--line-strong)] px-3 font-bold" onClick={() => onPoint(selectedPoint)}>Abrir ficha de {selectedPoint.siaCode}</button>}</header>
    <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="relative h-[400px] sm:h-[480px]"><CampaignHydroMap points={mapPoints} markerMode="resultIndex" zoomOnSelect={false} selectedPointId={selected} onSelectPoint={(marker) => { const point = shown.find((item) => item.key === marker.id); if (point) { setSelected(point.key); } }} layers={{ roadMap: true, basins: true, dailyRoutes: false, dayTransitions: false, planned: false, effective: true, displacement: false }} showPointTooltip caption="Índice geral · escala fixa 0–1 · anel: conjuntos utilizados" /></div>
      <nav aria-label="Municípios da campanha" className="max-h-[480px] overflow-y-auto border-t border-[var(--line-ghost)] lg:border-l lg:border-t-0">
        <button type="button" aria-pressed={!active} className="flex min-h-11 w-full items-center justify-between gap-2 border-b border-[var(--line-ghost)] px-3 text-left text-sm font-bold aria-pressed:bg-[var(--surface-soft)]" onClick={() => { setMunicipality(undefined); setSelected(undefined); }}><span>Todos os municípios</span><span className="tabular-nums text-[var(--ink-soft)]">{municipalities.length}</span></button>
        {/* Com índice completo: maior índice geral entre os pontos completos do município (decrescente).
            Só parciais: grupo separado, em ordem alfabética, para não sugerir menor prioridade. */}
        {[
          { key: "ranked", title: "Ordenados pelo maior índice geral entre seus pontos completos", items: municipalities.filter((item) => item.max !== null) },
          { key: "partial", title: "Somente resultados parciais — ordem alfabética", items: municipalities.filter((item) => item.max === null) },
        ].filter((group) => group.items.length).map((group) => <section key={group.key} aria-label={group.title}>
          <h4 className="type-caption border-b border-[var(--line-ghost)] bg-[var(--surface-soft)] px-3 py-2 font-bold text-[var(--ink-soft)]">{group.title}</h4>
          <ul>{group.items.map((item) => <li key={item.name} className="border-b border-[var(--line-ghost)]">
            <button type="button" aria-pressed={item.name === municipality} className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm aria-pressed:bg-[var(--surface-soft)] aria-pressed:font-bold" onClick={() => { setMunicipality(item.name === municipality ? undefined : item.name); setSelected(undefined); }}><span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full border border-[var(--line-strong)]" style={{ background: item.max === null ? "var(--surface-soft)" : continuousResultColor(item.max) }} /><span className="min-w-0 flex-1 truncate">{item.name}</span><span className="tabular-nums text-[var(--ink-soft)]">{item.items.length} {item.items.length === 1 ? "ponto" : "pontos"}{item.max === null ? "" : <> · maior {indexText(item.max)}</>}</span></button>
            {item.name === municipality && <ul className="bg-[var(--surface-soft)] pb-1">{item.items.map((point) => <li key={point.key}><button type="button" className="flex min-h-11 w-full items-center justify-between gap-2 px-6 text-left text-sm underline-offset-4 hover:underline" onClick={() => onPoint(point)}><span className="min-w-0 truncate">{point.siaCode} · {point.waterBody || "manancial não informado"}</span><span className="tabular-nums">{point.overall.value === null ? `${indexText(point.overall.lower)}–${indexText(point.overall.upper)}` : indexText(point.overall.value)}</span></button></li>)}</ul>}
          </li>)}</ul>
        </section>)}
      </nav>
    </div>
    <div className="px-4 pb-4"><ResultMarkerLegend />{shown.some(campaignLocationIssue) && <p role="status" className="type-metadata">SIA-0770: localização a conferir — longitude efetiva repete latitude nesta fonte. Não plotado; permanece nos totais, tabelas e ficha.</p>}</div>
  </section>;
}
