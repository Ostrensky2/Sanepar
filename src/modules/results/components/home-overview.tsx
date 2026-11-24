"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronRight, MousePointerClick } from "lucide-react";
import { CampaignHydroMap } from "@/components/campaign-hydro-map";
import { formatCaptureIndex } from "@/lib/capture-index/format";
import { defaultCampaigns } from "@/lib/campaign-management";
import { RESULTS_08_POLICY, RESULTS_08_SCHEMA, RESULTS_08_SOURCE_SHA256, type Results08HomeStatistics } from "@/lib/results-08-contract";
import { bandNames, bands } from "./capture-map-scale";
import { buildResultMapPoints } from "./results-index-dashboard";
import { ResultsInterpretationHelp } from "./results-interpretation-help";
import { SiaPeek, peekMembers, useCampaignPoints, type PeekMetric, type PeekPoint } from "./sia-peek";
import styles from "./campaign-distribution.module.css";

/** Os quatro índices, sempre nesta ordem e com a mesma cor em todas as campanhas. */
const indices = [
  { key: "geral", label: "Índice geral", metric: "overall", color: "#2a78d6" },
  { key: "ambiental", label: "Ambiental", metric: "environmental", color: "#eb6834" },
  { key: "operacional", label: "Operacional", metric: "operational", color: "#1baf7a" },
  { key: "saude", label: "Saúde", metric: "humanHealth", color: "#eda100" },
] as const satisfies ReadonlyArray<{ key: string; label: string; metric: PeekMetric; color: string }>;
type IndexKey = (typeof indices)[number]["key"];
type Payload = { schema: string; politica: string; sourceSha256: string; campanhas: Record<string, Partial<Record<IndexKey, Results08HomeStatistics>>> };

const campaignLabels: Record<string, string> = Object.fromEntries(defaultCampaigns.map((item, i) => [`C${i + 1}`, item.title]));
const season = (code: string) => defaultCampaigns[Number(code.slice(1)) - 1]?.title.split(" - ")[1] ?? "";
/** Linhas da grade: os limites das faixas da escala fixa. */
const ticks = [0, 0.15, 0.35, 0.7, 1];
const sameValue = (a: number | null, b: number | null) => a !== null && b !== null && formatCaptureIndex(a) === formatCaptureIndex(b);

function useDistribution() {
  const [data, setData] = useState<Payload>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/results/campaign-distribution", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Acesso restrito." : "Resumo indisponível.");
        const payload: Payload = await response.json();
        if (payload.schema !== RESULTS_08_SCHEMA || payload.politica !== RESULTS_08_POLICY || payload.sourceSha256 !== RESULTS_08_SOURCE_SHA256) throw new Error("Resumo indisponível para a edição atual.");
        if (!controller.signal.aborted) setData(payload);
      })
      .catch((reason: unknown) => { if (!controller.signal.aborted && !(reason instanceof DOMException)) setError(reason instanceof Error ? reason.message : "Resumo indisponível."); });
    return () => controller.abort();
  }, []);
  return { data, error };
}

/**
 * Um único gráfico para todas as campanhas: em cada campanha, uma coluna por índice, do menor ao maior ponto,
 * com a média marcada. Escala fixa de 0 a 1. As campanhas ficam lado a lado, sem total nem média entre elas.
 */
export function CampaignRangeChart() {
  const { data, error } = useDistribution();
  const pointsByCampaign = useCampaignPoints();
  const campaigns = Object.keys(data?.campanhas ?? {}).filter((code) => /^C[1-9]$/.test(code)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const members = Object.fromEntries(campaigns.flatMap((code) => indices.map((index) => [`${code}:${index.key}`, peekMembers(pointsByCampaign[code], index.metric).scored] as const)));
  const height = 300;
  const y = (value: number) => `${(1 - value) * 100}%`;
  return <section className="app-card min-w-0 space-y-4 p-4 sm:p-6" aria-labelledby="campaign-range-title">
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <h2 id="campaign-range-title" className="heading-font type-section-title text-[var(--brand-navy-strong)]">Índices por campanha</h2>
          <ResultsInterpretationHelp title="Como ler o gráfico dos índices por campanha">
            <p>Cada grupo é uma campanha. Dentro dele, uma coluna para cada índice: geral, ambiental, operacional e saúde, sempre nesta ordem e com a mesma cor.</p>
            <p>A coluna vai do menor ao maior índice entre os pontos da campanha. O ponto marca a média, e o número ao lado é essa média.</p>
            <p>A escala é fixa, de 0 a 1, a mesma da metodologia 0.8. As linhas horizontais são os limites das faixas: sinal muito baixo, sinal fraco, atenção, prioridade e prioridade máxima.</p>
            <p>Passe o mouse ou toque na ponta de cima ou de baixo de uma coluna para ver quais SIAs têm o maior ou o menor índice. Clicar fixa a lista, e cada SIA abre a ficha do ponto.</p>
            <p>As campanhas são independentes: não há total nem média juntando campanhas. Ponto sem estimativa fica fora do mínimo, da média e do máximo. O detalhe de cada campanha está em Resultados.</p>
          </ResultsInterpretationHelp>
        </div>
        <p className="type-metadata text-[var(--ink-soft)]">Mínimo, média e máximo dos pontos · metodologia 0.8 · escala fixa 0 a 1</p>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 type-metadata" aria-label="Índices">
        {indices.map((index) => <li key={index.key} className="inline-flex items-center gap-1.5 font-semibold text-[var(--ink)]"><span aria-hidden className="h-3 w-2 rounded-sm" style={{ backgroundColor: index.color }} />{index.label}</li>)}
      </ul>
    </header>
    {!data ? <p role="status" className="type-metadata">{error || "Carregando índices…"}</p> : <>
      <p className="flex items-center gap-1.5 type-caption text-[var(--ink-soft)]"><MousePointerClick aria-hidden className="size-4 shrink-0 text-[var(--brand-teal)]" />Passe o mouse na ponta de uma coluna para ver os SIAs do menor e do maior índice.</p>
      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-max grid-cols-[2.5rem_1fr] gap-x-2 pt-2" style={{ minWidth: `${campaigns.length * 17 + 3}rem` }}>
          {/* Eixo vertical com os limites das faixas */}
          <div className="relative" style={{ height }} aria-hidden>
            {ticks.map((tick) => <span key={tick} className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-[var(--ink-soft)]" style={{ top: y(tick) }}>{formatCaptureIndex(tick)}</span>)}
          </div>
          <div className="relative" style={{ height }}>
            {ticks.map((tick) => <span key={tick} aria-hidden className={`absolute inset-x-0 border-t ${tick === 0 ? "border-[var(--line-strong)]" : "border-dashed border-[var(--line-ghost)]"}`} style={{ top: y(tick) }} />)}
            <ul className="relative flex h-full">
              {campaigns.map((code, ci) => <li key={code} className={`flex h-full flex-1 justify-center gap-3 px-2 ${ci ? "border-l border-[var(--line-ghost)]" : ""}`} aria-label={`${code} · ${season(code)}`}>
                {indices.map((index) => {
                  const stat = data.campanhas[code][index.key];
                  const scored = members[`${code}:${index.key}`] ?? [];
                  if (!stat?.n || stat.minimo === null || stat.maximo === null || stat.media === null) return <span key={index.key} className="w-12" aria-label={`${index.label}: sem pontos com nota`} />;
                  const low: PeekPoint[] = scored.filter((point) => sameValue(point.value, stat.minimo));
                  const high: PeekPoint[] = scored.filter((point) => sameValue(point.value, stat.maximo));
                  const label = `${code} · ${index.label}: mínimo ${formatCaptureIndex(stat.minimo)}, média ${formatCaptureIndex(stat.media)}, máximo ${formatCaptureIndex(stat.maximo)}, ${stat.n} pontos`;
                  return <div key={index.key} role="img" aria-label={label} title={label} className="relative h-full w-12">
                    {/* Faixa do menor ao maior ponto */}
                    <span aria-hidden className="absolute left-1/2 w-3.5 -translate-x-1/2 rounded-[4px] opacity-30" style={{ top: y(stat.maximo), bottom: `${stat.minimo * 100}%`, minHeight: 4, backgroundColor: index.color }} />
                    <SiaPeek title={`${code} · ${index.label} · maior índice ${formatCaptureIndex(stat.maximo)}`} campaign={Number(code.slice(1))} points={high} className="absolute left-1/2 z-[1] block h-3 w-8 -translate-x-1/2 -translate-y-1/2 rounded-sm [&[data-peek]]:cursor-pointer" style={{ top: y(stat.maximo) }}>
                      <span aria-hidden className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ backgroundColor: index.color }} />
                    </SiaPeek>
                    <SiaPeek title={`${code} · ${index.label} · menor índice ${formatCaptureIndex(stat.minimo)}`} campaign={Number(code.slice(1))} points={low} className="absolute left-1/2 z-[1] block h-3 w-8 -translate-x-1/2 -translate-y-1/2 rounded-sm [&[data-peek]]:cursor-pointer" style={{ top: y(stat.minimo) }}>
                      <span aria-hidden className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full" style={{ backgroundColor: index.color }} />
                    </SiaPeek>
                    {/* Média: ponto com anel branco e o valor ao lado */}
                    <span aria-hidden className="absolute left-1/2 z-[2] size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ top: y(stat.media), backgroundColor: index.color }} />
                    <span aria-hidden className="pointer-events-none absolute left-1/2 z-[2] ml-2.5 -translate-y-1/2 whitespace-nowrap rounded bg-white/90 px-0.5 text-[11px] font-bold tabular-nums leading-tight text-[var(--ink)]" style={{ top: y(stat.media) }}>{formatCaptureIndex(stat.media)}</span>
                  </div>;
                })}
              </li>)}
            </ul>
          </div>
          <span />
          <ul className="flex" aria-hidden>
            {campaigns.map((code) => <li key={code} className="flex-1 px-2 pt-2 text-center"><strong className="block type-label text-[var(--brand-navy-strong)]">{code}</strong><span className="block type-caption text-[var(--ink-soft)]">{season(code)}</span></li>)}
          </ul>
        </div>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3 border-t border-[var(--line-ghost)] pt-3">
        <details className={`${styles.disclosure} min-w-0 max-sm:w-full sm:flex-1`}>
          <summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-[var(--brand-navy-strong)]"><ChevronRight aria-hidden className="size-4" />Ver os números em tabela</summary>
          <div className="mt-2 overflow-x-auto"><table className={styles.table}><caption className="sr-only">Mínimo, média e máximo por campanha e índice</caption>
            <thead><tr><th scope="col">Campanha · índice</th><th scope="col">Mínimo</th><th scope="col">Média</th><th scope="col">Máximo</th><th scope="col">Pontos</th></tr></thead>
            <tbody>{campaigns.flatMap((code) => indices.map((index) => { const stat = data.campanhas[code][index.key]; return <tr key={`${code}:${index.key}`}><th scope="row"><span aria-hidden className={styles.swatch} style={{ backgroundColor: index.color }} />{code} · {index.label}</th><td>{formatCaptureIndex(stat?.minimo ?? null)}</td><td>{formatCaptureIndex(stat?.media ?? null)}</td><td>{formatCaptureIndex(stat?.maximo ?? null)}</td><td>{stat?.n ?? "—"}</td></tr>; }))}</tbody>
          </table></div>
        </details>
        <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-4 font-semibold text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)] focus-visible:outline-2" href="/campanhas/resultados?vista=distribuicao">Ver a distribuição em Resultados<ArrowRight aria-hidden className="size-4" /></Link>
      </div>
    </>}
  </section>;
}

/** Mapa geral do índice de uma campanha por vez (a mais recente abre). O mapa detalhado fica em Resultados > Mapa. */
export function HomeIndexMap() {
  const pointsByCampaign = useCampaignPoints();
  const codes = Object.keys(pointsByCampaign).filter((code) => /^C[1-9]$/.test(code) && pointsByCampaign[code].length).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const [chosen, setChosen] = useState<string>();
  const code = chosen && codes.includes(chosen) ? chosen : codes[codes.length - 1];
  const mapPoints = code ? buildResultMapPoints(pointsByCampaign[code], "overall", campaignLabels) : [];
  return <section className="app-card min-w-0 space-y-3 p-4 sm:p-6" aria-labelledby="home-index-map-title">
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <h2 id="home-index-map-title" className="heading-font type-section-title text-[var(--brand-navy-strong)]">Mapa do índice geral</h2>
          <ResultsInterpretationHelp title="Como ler o mapa do índice geral">
            <p>Cada círculo é um ponto de captação (SIA) da campanha escolhida, na cor da faixa do seu índice geral, na escala fixa de 0 a 1. Círculo vazado é ponto sem estimativa ou sem medição; não é zero.</p>
            <p>O mapa mostra uma campanha por vez; as campanhas não se misturam. Abre na campanha mais recente.</p>
            <p>Para ver as categorias, a posição relativa e a ficha de cada ponto, use “Ver detalhes no mapa de Resultados”.</p>
          </ResultsInterpretationHelp>
        </div>
        <p className="type-metadata text-[var(--ink-soft)]">Um ponto por SIA · metodologia 0.8 · escala fixa 0 a 1</p>
      </div>
      {codes.length > 0 && <div role="group" aria-label="Campanha do mapa" className={styles.segmented}>
        {codes.map((item) => <button type="button" key={item} aria-pressed={item === code} onClick={() => setChosen(item)}>{item} · {season(item).split(" ")[0]}</button>)}
      </div>}
    </header>
    <ul className="flex flex-wrap gap-x-4 gap-y-1 type-caption text-[var(--ink-soft)]" aria-label="Faixas da escala fixa de 0 a 1">
      {bands.map((band, i) => <li key={band.label} className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: band.color }} /><strong className="text-[var(--ink)]">{bandNames[i]}</strong> {band.label}</li>)}
      <li className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-full border-2 border-[var(--ink-soft)]" /><strong className="text-[var(--ink)]">Vazado</strong> sem estimativa ou sem medição</li>
    </ul>
    <div className="relative h-[460px] overflow-hidden rounded-xl bg-[var(--surface-soft)] max-sm:h-[340px]">
      {code ? <CampaignHydroMap
        key={code}
        points={mapPoints}
        layers={{ roadMap: true, basins: true, dailyRoutes: false, dayTransitions: false, planned: false, effective: true, displacement: false }}
        markerMode="resultIndex"
        zoomOnSelect={false}
        showPointTooltip
        caption={`${code} · índice geral · escala fixa 0–1`}
      /> : <p role="status" className="p-4 type-metadata">Carregando o mapa…</p>}
    </div>
    {code && <div className="flex justify-end">
      <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-4 font-semibold text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)] focus-visible:outline-2" href={`/campanhas/resultados?vista=mapa&campaign=${code.slice(1)}`}>Ver detalhes no mapa de Resultados<ArrowRight aria-hidden className="size-4" /></Link>
    </div>}
  </section>;
}
