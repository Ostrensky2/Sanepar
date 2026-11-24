"use client";

import { useState } from "react";
import { MousePointerClick } from "lucide-react";
import { formatCaptureIndex } from "@/lib/capture-index/format";
import { defaultCampaigns } from "@/lib/campaign-management";
import type { ResultPoint } from "@/modules/results";
import { bandNames, bands } from "./capture-map-scale";
import { indices, type IndexKey } from "./home-overview";
import { ResultsInterpretationHelp } from "./results-interpretation-help";
import { SiaPeek, peekMembers, useCampaignPoints, type PeekMetric } from "./sia-peek";
import styles from "./campaign-distribution.module.css";

/** Um tom por campanha, do mais claro (primeira) ao mais escuro (mais recente): a ordem das campanhas se lê pela cor. */
const campaignRamp = ["#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281"];
const campaignColor = (position: number, total: number) => campaignRamp[total <= 1 ? 4 : Math.round((position / (total - 1)) * (campaignRamp.length - 1))];
const season = (code: string) => defaultCampaigns[Number(code.slice(1)) - 1]?.title.split(" - ")[1] ?? "";
const decimal = (value: number) => value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const valueOf = (point: ResultPoint, metric: PeekMetric) => metric === "overall" ? point.overall.value : point.domains[metric].value;
const axis = "bg-[var(--ink-soft)]";

function useCampaigns() {
  const pointsByCampaign = useCampaignPoints();
  const codes = Object.keys(pointsByCampaign).filter((code) => /^C[1-9]$/.test(code) && pointsByCampaign[code].length).sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return { pointsByCampaign, codes };
}

function IndexSwitch({ value, onChange }: { value: IndexKey; onChange: (key: IndexKey) => void }) {
  return <div role="group" aria-label="Índice exibido" className={styles.segmented}>
    {indices.map((item) => <button type="button" key={item.key} aria-pressed={item.key === value} onClick={() => onChange(item.key)}>{item.label}</button>)}
  </div>;
}

/** Linhas de grade e eixos de um gráfico de colunas; `top` é o valor do alto do eixo vertical. */
function Frame({ top, ticks, format, height, children, labels }: { top: number; ticks: number[]; format: (tick: number) => string; height: number; children: React.ReactNode; labels: React.ReactNode }) {
  return <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2 pt-2">
    <div className="relative" style={{ height }} aria-hidden>
      {ticks.map((tick) => <span key={tick} className="absolute right-1.5 -translate-y-1/2 text-[11px] tabular-nums text-[var(--ink-soft)]" style={{ top: `${(1 - tick / top) * 100}%` }}>{format(tick)}</span>)}
    </div>
    <div className="relative" style={{ height }}>
      {ticks.filter((tick) => tick > 0).map((tick) => <span key={tick} aria-hidden className="absolute inset-x-0 border-t border-dashed border-[var(--line-ghost)]" style={{ top: `${(1 - tick / top) * 100}%` }} />)}
      <span aria-hidden className={`absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 ${axis}`} />
      <span aria-hidden className={`absolute inset-x-0 bottom-0 h-0.5 translate-y-1/2 ${axis}`} />
      {ticks.map((tick) => <span key={`t${tick}`} aria-hidden className={`absolute left-0 h-0.5 w-2 -translate-x-full -translate-y-1/2 ${axis}`} style={{ top: `${(1 - tick / top) * 100}%` }} />)}
      {children}
    </div>
    <span />
    {labels}
  </div>;
}

/** Valores "redondos" para o eixo: 4 ou 5 marcas até o primeiro passo acima do maior valor. */
function niceScale(max: number, steps: number[]) {
  const step = steps.find((candidate) => max / candidate <= 5) ?? steps[steps.length - 1];
  const top = Math.max(step, Math.ceil(max / step - 1e-9) * step);
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Number((i * step).toFixed(4))) };
}

/**
 * Os 10 pontos (SIAs) com a maior soma do índice ao longo das campanhas. Cada coluna é um ponto, empilhada por campanha:
 * o total mostra o acúmulo e cada parte continua sendo a nota daquela campanha, sem misturar campanhas nem recalcular nota.
 */
export function TopCumulativeChart() {
  const { pointsByCampaign, codes } = useCampaigns();
  const [key, setKey] = useState<IndexKey>("geral");
  const index = indices.find((item) => item.key === key)!;
  const bySia = new Map<string, { sia: string; place: string | null; values: Record<string, number> }>();
  for (const code of codes) for (const point of pointsByCampaign[code]) {
    const value = valueOf(point, index.metric);
    const row = bySia.get(point.siaCode) ?? { sia: point.siaCode, place: point.municipality || point.waterBody || null, values: {} };
    if (value !== null && Number.isFinite(value)) row.values[code] = value;
    bySia.set(point.siaCode, row);
  }
  const rows = [...bySia.values()]
    .map((row) => { const list = Object.values(row.values); const total = list.reduce((sum, value) => sum + value, 0); return { ...row, total, count: list.length, mean: list.length ? total / list.length : 0 }; })
    .filter((row) => row.count > 0 && row.total > 0)
    .sort((a, b) => b.total - a.total || a.sia.localeCompare(b.sia, "pt-BR", { numeric: true }))
    .slice(0, 10);
  const scale = niceScale((rows[0]?.total ?? 1) * 1.14, [0.1, 0.2, 0.25, 0.5, 1, 2]);
  const height = 300;
  return <section className="app-card flex min-w-0 flex-col gap-4 p-4 sm:p-6" aria-labelledby="top-cumulative-title">
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <h2 id="top-cumulative-title" className="heading-font type-section-title text-[var(--brand-navy-strong)]">10 pontos com maior índice acumulado</h2>
          <ResultsInterpretationHelp title="Como ler o índice acumulado por ponto">
            <p>Cada coluna é um ponto de captação (SIA). A altura é a soma do índice do ponto em todas as campanhas, por isso passa de 1: é uma pontuação acumulada, não uma porcentagem nem uma probabilidade. Quanto maior, mais vezes e com mais intensidade o ponto chamou atenção.</p>
            <p>A coluna é dividida por campanha, da mais antiga (tom claro) à mais recente (tom escuro). Cada parte é a nota do método 3.0 daquele ponto naquela campanha, sem alteração. Passe o mouse ou toque em uma parte para ver a nota e abrir a ficha do ponto na campanha.</p>
            <p>O número em cima é o total; “média” é esse total dividido pelas campanhas em que o ponto tem nota.</p>
            <p><strong>Cuidado:</strong> a soma favorece quem foi coletado em mais campanhas. Ponto que ficou sem nota em alguma campanha aparece com o aviso “sem C…”, e a média ajuda a comparar com os demais.</p>
            <p>Use os botões para trocar o índice: geral, ambiental, operacional ou saúde. A lista dos 10 muda conforme o índice.</p>
          </ResultsInterpretationHelp>
        </div>
        <p className="type-metadata text-[var(--ink-soft)]">Soma do índice do ponto nas campanhas · metodologia 3.0</p>
      </div>
      <IndexSwitch value={key} onChange={setKey} />
    </header>
    {!codes.length ? <p role="status" className="type-metadata">Carregando pontos…</p> : !rows.length ? <p role="status" className="type-metadata">Nenhum ponto com nota acima de zero neste índice.</p> : <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="flex items-center gap-1.5 type-caption text-[var(--ink-soft)]"><MousePointerClick aria-hidden className="size-4 shrink-0 text-[var(--brand-teal)]" />Passe o mouse em uma parte da coluna para ver a nota da campanha.</p>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 type-caption" aria-label="Campanhas">
          {codes.map((code, i) => <li key={code} className="inline-flex items-center gap-1.5 text-[var(--ink)]"><span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: campaignColor(i, codes.length) }} /><strong>{code}</strong> {season(code).split(" ")[0]}</li>)}
        </ul>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="min-w-[26rem]">
          <Frame top={scale.top} ticks={scale.ticks} format={decimal} height={height} labels={
            <ul className="flex pt-2">
              {rows.map((row, position) => <li key={row.sia} className="min-w-0 flex-1 px-0.5 text-center">
                <strong className="block type-caption text-[var(--brand-navy-strong)]"><span className="text-[var(--ink-soft)]">{position + 1}º</span> SIA {row.sia}</strong>
                <span className="block truncate text-[10px] leading-tight text-[var(--ink-soft)]" title={row.place ?? undefined}>{row.place ?? ""}</span>
                {row.count < codes.length && <span className="block text-[10px] font-semibold leading-tight text-[var(--ink)]">sem {codes.filter((code) => row.values[code] === undefined).join(", ")}</span>}
              </li>)}
            </ul>}>
            <ul className="absolute inset-0 flex items-end">
              {rows.map((row) => <li key={row.sia} className="relative flex h-full min-w-0 flex-1 flex-col-reverse items-center gap-0.5 px-1" aria-label={`SIA ${row.sia}: soma ${decimal(row.total)}, média ${decimal(row.mean)}`}>
                {codes.map((code, i) => {
                  const value = row.values[code];
                  if (value === undefined || value <= 0) return null;
                  return <SiaPeek key={code} title={`SIA ${row.sia} · ${code} ${season(code)} · ${index.label}`} label={`${code}: ${formatCaptureIndex(value)}`} campaign={Number(code.slice(1))} points={[{ sia: row.sia, value, place: row.place }]}
                    className="block w-full max-w-10 shrink-0 rounded-[3px] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand-navy-strong)] [&[data-peek]]:cursor-pointer [&[data-peek]:hover]:brightness-95"
                    style={{ height: `${Math.max((value / scale.top) * 100, 0.8)}%`, backgroundColor: campaignColor(i, codes.length) }}>
                    <span className="sr-only">{code}: {formatCaptureIndex(value)}</span>
                  </SiaPeek>;
                })}
                <span className="pointer-events-none order-last mb-0.5 text-center leading-tight" aria-hidden><strong className="block text-xs tabular-nums text-[var(--ink)]">{decimal(row.total)}</strong><span className="block text-[10px] tabular-nums text-[var(--ink-soft)]">média {decimal(row.mean)}</span></span>
              </li>)}
            </ul>
          </Frame>
        </div>
      </div>
    </>}
  </section>;
}

/**
 * Quantos pontos estão em Atenção, Prioridade ou Prioridade máxima em cada campanha.
 * Uma coluna por campanha, empilhada pelas três faixas; cada parte lista os SIAs. As campanhas não se somam.
 */
export function AttentionChart() {
  const { pointsByCampaign, codes } = useCampaigns();
  const [key, setKey] = useState<IndexKey>("geral");
  const index = indices.find((item) => item.key === key)!;
  const watched = [2, 3, 4];
  const rows = codes.map((code) => {
    const members = peekMembers(pointsByCampaign[code], index.metric);
    return { code, scored: members.scored.length, groups: watched.map((band) => members.bands[band]), total: watched.reduce((sum, band) => sum + members.bands[band].length, 0) };
  });
  const scale = niceScale(Math.max(1, ...rows.map((row) => row.total)) * 1.14, [1, 2, 5, 10, 20, 50]);
  const height = 300;
  return <section className="app-card flex min-w-0 flex-col gap-4 p-4 sm:p-6" aria-labelledby="attention-title">
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <h2 id="attention-title" className="heading-font type-section-title text-[var(--brand-navy-strong)]">Pontos que pedem atenção</h2>
          <ResultsInterpretationHelp title="Como ler os pontos que pedem atenção">
            <p>Cada coluna é uma campanha. A altura é o número de pontos de captação com índice a partir de 0,15, separados em três faixas da escala fixa: Atenção (0,15 a &lt;0,35), Prioridade (0,35 a &lt;0,70) e Prioridade máxima (0,70 a 1).</p>
            <p>O número em cima é o total da campanha e, abaixo, quantos pontos com nota a campanha tem. Passe o mouse ou toque em uma parte da coluna para ver quais SIAs estão ali; clicar fixa a lista, e cada SIA abre a ficha do ponto.</p>
            <p>As campanhas são independentes e não se somam: o mesmo ponto pode aparecer em mais de uma coluna. As faixas orientam a investigação; não confirmam dano.</p>
            <p>Use os botões para trocar o índice: geral, ambiental, operacional ou saúde.</p>
          </ResultsInterpretationHelp>
        </div>
        <p className="type-metadata text-[var(--ink-soft)]">Pontos com índice a partir de 0,15, por campanha · metodologia 3.0</p>
      </div>
      <IndexSwitch value={key} onChange={setKey} />
    </header>
    {!codes.length ? <p role="status" className="type-metadata">Carregando pontos…</p> : <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="flex items-center gap-1.5 type-caption text-[var(--ink-soft)]"><MousePointerClick aria-hidden className="size-4 shrink-0 text-[var(--brand-teal)]" />Passe o mouse em uma parte da coluna para ver os SIAs.</p>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 type-caption" aria-label="Faixas">
          {watched.map((band) => <li key={band} className="inline-flex items-center gap-1.5 text-[var(--ink)]"><span aria-hidden className="size-2.5 rounded-sm" style={{ backgroundColor: bands[band].color }} /><strong>{bandNames[band]}</strong> <span className="text-[var(--ink-soft)]">{bands[band].label}</span></li>)}
        </ul>
      </div>
      <Frame top={scale.top} ticks={scale.ticks} format={String} height={height} labels={
        <ul className="flex pt-2" aria-hidden>
          {rows.map((row) => <li key={row.code} className="min-w-0 flex-1 text-center"><strong className="block type-label text-[var(--brand-navy-strong)]">{row.code}</strong><span className="block type-caption text-[var(--ink-soft)]">{season(row.code)}</span></li>)}
        </ul>}>
        <ul className="absolute inset-0 flex items-end">
          {rows.map((row) => <li key={row.code} className="relative flex h-full min-w-0 flex-1 flex-col-reverse items-center gap-0.5 px-2" aria-label={`${row.code}: ${row.total} de ${row.scored} pontos com índice a partir de 0,15`}>
            {row.groups.map((group, i) => group.length ? <SiaPeek key={watched[i]} title={`${row.code} · ${bandNames[watched[i]]} · ${index.label}`} label={`${bandNames[watched[i]]}: ${group.length} ${group.length === 1 ? "ponto" : "pontos"}`} campaign={Number(row.code.slice(1))} points={group} expected={group.length}
              className="flex w-full max-w-24 shrink-0 items-center justify-center rounded-[3px] text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--brand-navy-strong)] [&[data-peek]]:cursor-pointer [&[data-peek]:hover]:brightness-95"
              style={{ height: `${(group.length / scale.top) * 100}%`, backgroundColor: bands[watched[i]].color, color: watched[i] >= 3 ? "#fff" : "var(--ink)" }}>
              {(group.length / scale.top) * height >= 16 ? group.length : ""}
            </SiaPeek> : null)}
            <span className="pointer-events-none order-last mb-0.5 text-center leading-tight" aria-hidden><strong className="block text-sm tabular-nums text-[var(--ink)]">{row.total}</strong><span className="block text-[10px] text-[var(--ink-soft)]">de {row.scored} com nota</span></span>
          </li>)}
        </ul>
      </Frame>
    </>}
  </section>;
}
