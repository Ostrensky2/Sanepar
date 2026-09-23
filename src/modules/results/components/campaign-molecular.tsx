"use client";

import { useEffect, useState } from "react";
import type { ResultsSourceAnalytics, MolecularTaxonSummary } from "@/lib/results-source-analytics-contract";
import type { AnalyticalSet, ResultPoint, ResultsCampaign } from "@/modules/results/types";

export const setNames = { bacteria: "Bactérias", cyanobacteria: "Cianobactérias", coi: "Eucariotos COI" };
export const campaignControl = "min-h-11 min-w-0 max-w-full rounded border border-[var(--line-strong)] bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]";
export function useCampaignAnalytics(campaignCode: string, sourceHash: string | undefined, set: AnalyticalSet, options: Record<string, string> = {}, publicationId?: string) {
  const key = new URLSearchParams({ campaignCode, sourceHash: sourceHash ?? "", set, ...options, source: publicationId ? "published" : "local-corrected-preview", ...(publicationId ? { publicationId } : {}) }).toString();
  const [result, setResult] = useState<{ key: string; data?: ResultsSourceAnalytics; error?: string }>();
  useEffect(() => {
    if (!sourceHash) return;
    const controller = new AbortController();
    void fetch(`/api/imports/results/source-analytics?${key}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Agregações indisponíveis ou fonte alterada.");
      const data = await response.json() as ResultsSourceAnalytics;
      if (data.source.sha256.toLowerCase() !== sourceHash.toLowerCase() || data.campaignCode !== campaignCode || data.set !== set || data.source.published !== Boolean(publicationId) || data.source.kind !== (publicationId ? "published" : "local-corrected-preview") || (publicationId && data.source.publicationId !== publicationId)) throw new Error("Origem incompatível; recarregue a campanha.");
      if (!controller.signal.aborted) setResult({ key, data });
    }).catch(() => { if (!controller.signal.aborted) setResult({ key, error: "Consulta indisponível ou fonte alterada. Nenhum dado de outra origem foi utilizado." }); });
    return () => controller.abort();
  }, [key, sourceHash, campaignCode, set, publicationId]);
  return result?.key === key ? result : undefined;
}

function TaxonBars({ rows, frequency, onTaxon }: { rows: MolecularTaxonSummary[]; frequency?: boolean; onTaxon: (taxon: string) => void }) {
  const max = frequency ? rows[0]?.denominatorPoints ?? 1 : Math.max(1, ...rows.map((row) => row.reads));
  return <ol className="max-h-96 space-y-3 overflow-y-auto pr-2" tabIndex={0} aria-label={frequency ? "Frequência: lista com rolagem" : "Reads: lista com rolagem"}>{rows.map((row) => <li key={row.taxon}><button className="min-h-11 text-left text-sm italic underline decoration-[var(--line-strong)] underline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]" onClick={() => onTaxon(row.taxon)}>{row.taxon}</button><div className="grid grid-cols-[1fr_auto] items-center gap-3"><span className="h-3 bg-[var(--surface-soft)]" aria-hidden="true"><span className="block h-full bg-[var(--brand-teal)]" style={{ width: `${(frequency ? row.positivePoints : row.reads) / max * 100}%` }} /></span><strong className="text-sm tabular-nums">{frequency ? `${row.positivePoints}/${row.denominatorPoints} pontos` : `${row.reads.toLocaleString("pt-BR")} reads`}</strong></div></li>)}</ol>;
}

export function CampaignMolecular({ campaign, sourceHash, publicationId, set, onPoint }: { campaign: ResultsCampaign; sourceHash: string; publicationId?: string; set: AnalyticalSet; onPoint: (point: ResultPoint) => void }) {
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [sia, setSia] = useState("");
  const [top, setTop] = useState("10");
  const [pointOffset, setPointOffset] = useState(0);
  const [taxonOffset, setTaxonOffset] = useState(0);
  const result = useCampaignAnalytics(campaign.campaignCode, sourceHash, set, { q: applied, sia, topN: top, pointOffset: String(pointOffset), taxonOffset: String(taxonOffset), pageSize: "8" }, publicationId);
  const data = result?.data;
  const points = [...new Set(data?.heatmap.cells.map((cell) => cell.sia))];
  const taxa = [...new Set(data?.heatmap.cells.map((cell) => cell.taxon))];
  function apply(value: string) { setQuery(value); setApplied(value); setTaxonOffset(0); setPointOffset(0); }
  const filtered = Boolean(applied || sia || top !== "10");
  return <section className="space-y-4 min-w-0">
    {/* Gráficos primeiro; filtros recolhidos (abertos só quando há filtro aplicado). */}
    <details className="app-card p-3" open={filtered || undefined}><summary className="min-h-11 cursor-pointer content-center font-bold">Filtrar gráficos: táxon, ponto e quantidade{filtered ? ` · ${[applied && `“${applied}”`, sia, top !== "10" && `Top ${top}`].filter(Boolean).join(" · ")}` : ""}</summary>
    <form onSubmit={(event) => { event.preventDefault(); apply(query); }} className="mt-2 flex flex-wrap items-end gap-2">
      <label className="type-label flex min-w-48 flex-1 flex-col gap-1">Organismo (filtra gráficos e mapa de calor)<input className={campaignControl} type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label><button className={campaignControl}>Buscar</button>
      <label className="type-label flex flex-col gap-1">Ponto<select className={campaignControl} value={sia} onChange={(event) => { setSia(event.target.value); setPointOffset(0); }}><option value="">Todos</option>{campaign.points.map((point) => <option key={point.key} value={point.siaCode}>{point.siaCode}</option>)}</select></label>
      <label className="type-label flex flex-col gap-1">Top N<select className={campaignControl} value={top} onChange={(event) => setTop(event.target.value)}>{[10, 20, 50, 100].map((n) => <option key={n}>{n}</option>)}</select></label>
      <button className={campaignControl} type="button" onClick={() => { apply(""); setSia(""); setTop("10"); }}>Limpar</button>
    </form>
    </details>
    {!data ? <p role={result?.error ? "alert" : "status"}>{result?.error ?? "Carregando gráficos…"}</p> : <>
      <div className="grid gap-4 lg:grid-cols-2"><section className="app-card p-4"><h3 className="type-panel-title">Organismos com mais reads — {setNames[set]}</h3><p className="type-caption mb-2">Leituras de DNA somadas em todos os pontos.</p><TaxonBars rows={data.topReads} onTaxon={apply} /></section><section className="app-card p-4"><h3 className="type-panel-title">Frequência entre pontos</h3><p className="type-caption mb-2">Em quantos pontos o organismo apareceu.</p><TaxonBars rows={data.topFrequency} frequency onTaxon={apply} /></section></div>
      <p className="type-caption text-[var(--ink-soft)]" role="status">{data.taxaFiltered === data.taxaTotal ? `${data.taxaTotal} organismos` : `${data.taxaFiltered} de ${data.taxaTotal} organismos no filtro`}; os {top} primeiros nos gráficos. Frequência = em quantos dos {data.summary.pointsWithRecords} pontos com registros{sia ? ` (${sia})` : ""} o organismo apareceu. Filtrar não muda os totais.</p>
      <section className="app-card min-w-0 space-y-3 p-4"><h3 className="type-panel-title">Mapa de calor — ponto × táxon</h3><p className="type-metadata">Fatia de cada organismo nos reads do ponto (0 a 100%). Os organismos com mais reads na campanha vêm primeiro; “·” = não detectado naquele ponto.</p>
        <div className="overflow-x-auto" role="region" tabIndex={0} aria-label="Mapa de calor com rolagem horizontal"><table className="w-full text-xs"><thead><tr><th>Ponto</th>{taxa.map((taxon) => <th key={taxon} className="min-w-28 max-w-40 break-words p-2 font-normal italic">{taxon}</th>)}</tr></thead><tbody>{points.map((point) => <tr key={point}><th><button className="min-h-11 underline" onClick={() => { const found = campaign.points.find((item) => item.siaCode === point); if (found) onPoint(found); }}>{point}</button></th>{taxa.map((taxon) => { const cell = data.heatmap.cells.find((item) => item.sia === point && item.taxon === taxon)!; const value = cell.proportion === null ? null : cell.proportion * 100; const status = ({ absent: "Sem registros", unusable: "Não utilizável", "no-denominator": "Sem denominador", zero: "Sem registro positivo", observed: "Proporção observada" })[cell.state]; return <td key={taxon} className="relative border border-white p-2 text-center text-[var(--ink)]" style={{ background: cell.state === "zero" ? "white" : value === null ? "var(--surface-soft)" : `rgba(0,142,156,${0.08 + cell.proportion! * 0.55})` }}><span aria-hidden="true" className={value === null || cell.state === "zero" ? "text-[var(--ink-soft)]" : "font-bold"}>{cell.state === "zero" ? "·" : value === null ? status : `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`}</span><span className="sr-only"> — {point}; {taxon}; {cell.reads} reads / {cell.denominator}; proporção {cell.proportion ?? "indisponível"}; {status}</span></td>; })}</tr>)}</tbody></table></div>
        {!data.heatmap.cells.length && <p role="status">Nenhum táxon corresponde ao filtro; não equivale a ausência biológica.</p>}
        <p className="type-caption">“·” (não detectado) não confirma ausência biológica. Células cinza: o conjunto não tem registro ou não entrou no cálculo naquele ponto.</p>
        <div className="flex flex-wrap gap-2"><button className={campaignControl} disabled={pointOffset === 0} onClick={() => setPointOffset(Math.max(0, pointOffset - 8))}>Pontos anteriores</button><span className="self-center text-sm">Pontos {pointOffset + 1}–{Math.min(pointOffset + 8, data.heatmap.pointsTotal)} / {data.heatmap.pointsTotal}</span><button className={campaignControl} disabled={pointOffset + 8 >= data.heatmap.pointsTotal} onClick={() => setPointOffset(pointOffset + 8)}>Próximos pontos</button></div>
        <div className="flex flex-wrap gap-2"><button className={campaignControl} disabled={taxonOffset === 0} onClick={() => setTaxonOffset(Math.max(0, taxonOffset - 8))}>Táxons anteriores</button><span className="self-center text-sm">Táxons {data.taxaFiltered ? taxonOffset + 1 : 0}–{Math.min(taxonOffset + 8, data.taxaFiltered)} / {data.taxaFiltered}</span><button className={campaignControl} disabled={taxonOffset + 8 >= data.taxaFiltered} onClick={() => setTaxonOffset(taxonOffset + 8)}>Próximos táxons</button></div>
      </section>
    </>}
  </section>;
}
