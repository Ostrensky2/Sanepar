"use client";

import { useState } from "react";
import { campaignControl, useCampaignAnalytics } from "./campaign-molecular";
import { indexText } from "./campaign-overview";
import { defaultCampaigns } from "@/lib/campaign-management";
import { continuousResultColor } from "./result-visual";

const SET_LABELS: Record<string, string> = { cyanobacteria: "Cianobactérias", bacteria: "Bactérias", coi: "Eucariotos COI" };
const campaignName = (code: string) => { const index = Number(code.match(/^C(\d+)$/)?.[1]); return index ? `${defaultCampaigns[index - 1]?.title.split(" - ")[1] ?? code} (${code})` : code; };
/** "56 completos · 17 parciais" — só as categorias que existem. */
export function historyCompleteness(counts: { complete: number; partialWithTwoSets: number; partialWithOneSet: number; unavailable: number }) {
  return [[counts.complete, "completos"], [counts.partialWithTwoSets, "parciais (2 de 3)"], [counts.partialWithOneSet, "parciais (1 de 3)"], [counts.unavailable, "indisponíveis"]].filter(([count]) => Number(count) > 0).map(([count, label]) => `${count} ${label}`).join(" · ");
}

export function CampaignHistory({ campaignCode, sourceHash, publicationId }: { campaignCode: string; sourceHash: string; publicationId?: string }) {
  const [sia, setSia] = useState("");
  const result = useCampaignAnalytics(campaignCode, sourceHash, "bacteria", { sia }, publicationId);
  const data = result?.data;
  const versions = new Set(data?.history.map((item) => `${item.calculationVersion}|${item.catalogVersion}`));
  return <section className="space-y-4"><header><h3 className="type-section-title">Evolução entre campanhas</h3><p className="type-metadata mt-2">Médias das campanhas publicadas na mesma planilha. Os pontos analisados mudam de uma campanha para outra, então diferenças na média não indicam, sozinhas, tendência.</p></header>
    <label className="type-label block">Ponto no histórico<select className={`${campaignControl} ml-2`} value={sia} onChange={(event) => setSia(event.target.value)}><option value="">Média dos pontos completos</option>{[...new Set(data?.history.flatMap((item) => item.siaUniverse))].sort().map((key) => <option key={key}>{key}</option>)}</select></label>
    {!data ? <p role={result?.error ? "alert" : "status"}>{result?.error ?? "Carregando histórico…"}</p> : <>
      {versions.size !== 1 && <p role="status">Métodos de cálculo diferentes entre as campanhas: não foi traçada comparação gráfica.</p>}
      <div className="app-card space-y-4 p-4" aria-label="Índice geral no histórico, escala fixa zero a um">{data.history.map((item) => {
        const available = !sia || (item.point && item.point.completeness !== "unavailable");
        const value = sia ? item.point?.overall.value ?? null : item.mean;
        const lower = sia ? item.point?.overall.lower : undefined;
        const upper = sia ? item.point?.overall.upper : undefined;
        return <div key={item.campaignCode}><p className="type-label">{campaignName(item.campaignCode)} · {sia || `média de ${item.included} pontos completos${item.excluded ? ` (${item.excluded} fora da média)` : ""}`}</p><p className="font-bold tabular-nums">{!available ? "Sem resultado" : value !== null ? indexText(value) : lower !== undefined && upper !== undefined ? `${indexText(lower)}–${indexText(upper)} (faixa possível; ponto parcial)` : "Não disponível"}</p><div className="relative mt-1 h-5 border border-[var(--line-strong)] bg-[var(--surface-soft)]" aria-hidden="true">{versions.size === 1 && available && (value !== null ? <span className="block h-full" style={{ width: `${value * 100}%`, background: continuousResultColor(value) }} /> : lower !== undefined && upper !== undefined ? <span className="absolute h-full border-2 border-[var(--brand-navy)]" style={{ left: `${lower * 100}%`, width: `${(upper - lower) * 100}%` }} /> : null)}</div><div className="flex justify-between text-xs"><span>0</span><span>1</span></div></div>;
      })}</div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="text-left font-bold">Pontos e reads de cada campanha</caption><thead><tr><th>Campanha</th><th>Média / mediana</th><th>Pontos</th><th>Reads por conjunto</th></tr></thead><tbody>{data.history.map((item) => <tr key={item.campaignCode} className="border-t border-[var(--line-ghost)]"><th className="py-3 pr-3">{campaignName(item.campaignCode)}</th><td className="tabular-nums">{indexText(item.mean)} / {indexText(item.median)}</td><td>{historyCompleteness(item.counts)}</td><td>{["cyanobacteria", "bacteria", "coi"].filter((set) => item.readsBySet[set] !== undefined).map((set) => <p key={set}>{SET_LABELS[set]}: {item.readsBySet[set].toLocaleString("pt-BR")}</p>)}</td></tr>)}</tbody></table></div>
      <p className="type-metadata">Nenhuma comparação ponto a ponto nem tendência foi calculada. Para ver um ponto específico, escolha-o acima.</p>
    </>}
  </section>;
}
