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
import { SiaPeek, peekMembers, useCampaignPoints, type PeekMetric } from "./sia-peek";
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
 * Um único gráfico de linhas para todas as campanhas, um índice por vez (Índice geral abre): maior ponto, média e
 * menor ponto de cada campanha, com a faixa entre o menor e o maior sombreada, na escala fixa de 0 a 1.
 * As campanhas são independentes: o gráfico só as coloca lado a lado, sem total nem média entre elas.
 */
export function CampaignRangeChart() {
  const { data, error } = useDistribution();
  const pointsByCampaign = useCampaignPoints();
  const [key, setKey] = useState<IndexKey>("geral");
  const index = indices.find((item) => item.key === key)!;
  const campaigns = Object.keys(data?.campanhas ?? {}).filter((code) => /^C[1-9]$/.test(code)).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const rows = campaigns.flatMap((code) => {
    const stat = data?.campanhas[code][key];
    if (!stat?.n || stat.minimo === null || stat.maximo === null || stat.media === null) return [];
    const scored = peekMembers(pointsByCampaign[code], index.metric).scored;
    return [{ code, stat: { min: stat.minimo, mean: stat.media, max: stat.maximo, n: stat.n }, low: scored.filter((point) => sameValue(point.value, stat.minimo)), high: scored.filter((point) => sameValue(point.value, stat.maximo)) }];
  });
  const x = (i: number) => ((i + 0.5) / Math.max(1, campaigns.length)) * 100;
  const y = (value: number) => (1 - value) * 100;
  const position = (code: string) => campaigns.indexOf(code);
  const path = (pick: (row: (typeof rows)[number]) => number) => rows.map((row, i) => `${i ? "L" : "M"}${x(position(row.code))} ${y(pick(row))}`).join(" ");
  const band = rows.length ? `${path((row) => row.stat.max)} ${[...rows].reverse().map((row) => `L${x(position(row.code))} ${y(row.stat.min)}`).join(" ")} Z` : "";
  const height = 340;
  const peek = (row: (typeof rows)[number], which: "low" | "high", children: React.ReactNode, className: string, top: number) => (
    <SiaPeek title={`${row.code} · ${index.label} · ${which === "high" ? "maior" : "menor"} índice ${formatCaptureIndex(which === "high" ? row.stat.max : row.stat.min)}`} campaign={Number(row.code.slice(1))} points={row[which]} className={`absolute z-[2] -translate-x-1/2 -translate-y-1/2 [&[data-peek]]:cursor-pointer ${className}`} style={{ left: `${x(position(row.code))}%`, top: `${top}%` }}>{children}</SiaPeek>
  );
  const valueTag = (text: string, top: number, left: number, strong = false) => <span aria-hidden className={`pointer-events-none absolute z-[3] -translate-y-1/2 whitespace-nowrap rounded bg-white/90 px-1 text-[11px] tabular-nums leading-tight ${strong ? "font-bold text-[var(--ink)]" : "text-[var(--ink-soft)]"}`} style={{ left: `calc(${left}% + 14px)`, top: `${top}%` }}>{text}</span>;
  return <section className="app-card flex min-w-0 flex-col gap-4 p-4 sm:p-6" aria-labelledby="campaign-range-title">
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <h2 id="campaign-range-title" className="heading-font type-section-title text-[var(--brand-navy-strong)]">Índices por campanha</h2>
          <ResultsInterpretationHelp title="Como ler o gráfico dos índices por campanha">
            <p>Cada campanha é uma posição no eixo horizontal. A linha de cima liga o maior índice entre os pontos de cada campanha, a do meio (mais grossa) liga a média e a de baixo liga o menor índice. A área sombreada vai do menor ao maior.</p>
            <p>Use os botões para trocar o índice: geral, ambiental, operacional ou saúde. A escala é fixa, de 0 a 1, a mesma da metodologia 0.8; as linhas horizontais são os limites das faixas.</p>
            <p>Passe o mouse ou toque no maior ou no menor valor para ver quais SIAs o formam. Clicar fixa a lista, e cada SIA abre a ficha do ponto.</p>
            <p>As campanhas são independentes: não há total nem média juntando campanhas. As linhas só ajudam a comparar uma campanha com a outra. Ponto sem estimativa fica fora do mínimo, da média e do máximo.</p>
          </ResultsInterpretationHelp>
        </div>
        <p className="type-metadata text-[var(--ink-soft)]">Menor, média e maior índice dos pontos · metodologia 0.8 · escala fixa 0 a 1</p>
      </div>
      {data && <div role="group" aria-label="Índice exibido" className={styles.segmented}>
        {indices.map((item) => <button type="button" key={item.key} aria-pressed={item.key === key} onClick={() => setKey(item.key)}>{item.label}</button>)}
      </div>}
    </header>
    {!data ? <p role="status" className="type-metadata">{error || "Carregando índices…"}</p> : <>
      <p className="flex items-center gap-1.5 type-caption text-[var(--ink-soft)]"><MousePointerClick aria-hidden className="size-4 shrink-0 text-[var(--brand-teal)]" />Passe o mouse no maior ou no menor valor para ver os SIAs.</p>
      <div className="grid grid-cols-[2.5rem_1fr] gap-x-2 pt-2" role="img" aria-label={`${index.label}: ${rows.map((row) => `${row.code} mínimo ${formatCaptureIndex(row.stat.min)}, média ${formatCaptureIndex(row.stat.mean)}, máximo ${formatCaptureIndex(row.stat.max)}`).join("; ")}`}>
        <div className="relative" style={{ height }} aria-hidden>
          {ticks.map((tick) => <span key={tick} className="absolute right-1.5 -translate-y-1/2 text-[11px] tabular-nums text-[var(--ink-soft)]" style={{ top: `${y(tick)}%` }}>{formatCaptureIndex(tick)}</span>)}
        </div>
        <div className="relative" style={{ height }}>
          {ticks.filter((tick) => tick > 0).map((tick) => <span key={tick} aria-hidden className="absolute inset-x-0 border-t border-dashed border-[var(--line-ghost)]" style={{ top: `${y(tick)}%` }} />)}
          {/* Eixos: vertical (índice, 0 a 1) à esquerda e horizontal (campanhas) no zero, com marcas em cada valor e campanha. */}
          <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 bg-[var(--ink-soft)]" />
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 translate-y-1/2 bg-[var(--ink-soft)]" />
          {ticks.map((tick) => <span key={`y${tick}`} aria-hidden className="absolute left-0 h-0.5 w-2 -translate-x-full -translate-y-1/2 bg-[var(--ink-soft)]" style={{ top: `${y(tick)}%` }} />)}
          {campaigns.map((code, i) => <span key={`x${code}`} aria-hidden className="absolute bottom-0 h-2 w-0.5 -translate-x-1/2 translate-y-full bg-[var(--ink-soft)]" style={{ left: `${x(i)}%` }} />)}
          <>
            <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              <path d={band} fill={index.color} opacity="0.12" />
              <path d={path((row) => row.stat.max)} fill="none" stroke={index.color} strokeWidth="2" strokeOpacity="0.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              <path d={path((row) => row.stat.min)} fill="none" stroke={index.color} strokeWidth="2" strokeOpacity="0.75" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              <path d={path((row) => row.stat.mean)} fill="none" stroke={index.color} strokeWidth="3.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
            {rows.map((row) => { const left = x(position(row.code)); return <div key={row.code}>
              {peek(row, "high", <span aria-hidden className="block size-3 rounded-full border-2 bg-white" style={{ borderColor: index.color }} />, "flex size-7 items-center justify-center rounded-full", y(row.stat.max))}
              {peek(row, "low", <span aria-hidden className="block size-3 rounded-full border-2 bg-white" style={{ borderColor: index.color }} />, "flex size-7 items-center justify-center rounded-full", y(row.stat.min))}
              <span aria-hidden className="absolute z-[2] size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white" style={{ left: `${left}%`, top: `${y(row.stat.mean)}%`, backgroundColor: index.color }} />
              {valueTag(`máx ${formatCaptureIndex(row.stat.max)}`, y(row.stat.max), left)}
              {valueTag(`média ${formatCaptureIndex(row.stat.mean)}`, y(row.stat.mean), left, true)}
              {valueTag(`mín ${formatCaptureIndex(row.stat.min)}`, y(row.stat.min), left)}
            </div>; })}
          </>
        </div>
        <span />
        <ul className="relative h-12" aria-hidden>
          {campaigns.map((code, i) => <li key={code} className="absolute -translate-x-1/2 pt-2 text-center" style={{ left: `${x(i)}%` }}><strong className="block type-label text-[var(--brand-navy-strong)]">{code}</strong><span className="block whitespace-nowrap type-caption text-[var(--ink-soft)]">{season(code)}</span></li>)}
        </ul>
      </div>
      <div className="mt-auto flex flex-wrap items-start justify-between gap-3 border-t border-[var(--line-ghost)] pt-3">
        <details className={`${styles.disclosure} min-w-0 max-sm:w-full sm:flex-1`}>
          <summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-[var(--brand-navy-strong)]"><ChevronRight aria-hidden className="size-4" />Ver em tabela</summary>
          <div className="mt-2 overflow-x-auto"><table className={styles.table}><caption className="sr-only">Mínimo, média e máximo por campanha e índice</caption>
            <thead><tr><th scope="col">Campanha · índice</th><th scope="col">Mínimo</th><th scope="col">Média</th><th scope="col">Máximo</th><th scope="col">Pontos</th></tr></thead>
            <tbody>{campaigns.flatMap((code) => indices.map((item) => { const stat = data.campanhas[code][item.key]; return <tr key={`${code}:${item.key}`}><th scope="row">{code} · {item.label}</th><td>{formatCaptureIndex(stat?.minimo ?? null)}</td><td>{formatCaptureIndex(stat?.media ?? null)}</td><td>{formatCaptureIndex(stat?.maximo ?? null)}</td><td>{stat?.n ?? "—"}</td></tr>; }))}</tbody>
          </table></div>
        </details>
        <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-4 font-semibold text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)] focus-visible:outline-2" href="/campanhas/resultados?vista=distribuicao">Ver a distribuição<ArrowRight aria-hidden className="size-4" /></Link>
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
  // No Início o contorno é sempre contínuo: a cobertura da curadoria (contorno tracejado ou pontilhado) fica no mapa de Resultados.
  const mapPoints = (code ? buildResultMapPoints(pointsByCampaign[code], "overall", campaignLabels) : []).map((point) => point.captureReading ? { ...point, captureReading: { ...point.captureReading, grade: "A" } } : point);
  const empty = code ? pointsByCampaign[code].filter((point) => point.overall.value === null) : [];
  const withoutEstimate = empty.filter((point) => point.estimateState === "sem estimativa").length;
  return <section className="app-card flex min-w-0 flex-col gap-3 p-4 sm:p-6" aria-labelledby="home-index-map-title">
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <h2 id="home-index-map-title" className="heading-font type-section-title text-[var(--brand-navy-strong)]">Mapa do índice geral</h2>
          <ResultsInterpretationHelp title="Como ler o mapa do índice geral">
            <p>Cada círculo é um ponto de captação (SIA) da campanha escolhida, na cor da faixa do seu índice geral, na escala fixa de 0 a 1.</p><p>Círculo vazado (sem cor) é ponto sem nota. “Sem estimativa”: há leitura do DNA no ponto, mas a nota não pode ser afirmada. “Sem medição”: não há leitura utilizável. Nenhum dos dois é zero. A legenda só mostra o vazado quando a campanha tem algum ponto assim.</p>
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
      {empty.length > 0 && <li className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-full border-2 border-[var(--ink-soft)]" /><strong className="text-[var(--ink)]">Vazado</strong> sem nota: {[withoutEstimate && `${withoutEstimate} sem estimativa`, empty.length - withoutEstimate && `${empty.length - withoutEstimate} sem medição`].filter(Boolean).join(" e ")}</li>}
    </ul>
    <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-xl bg-[var(--surface-soft)] max-sm:min-h-[340px]">
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
