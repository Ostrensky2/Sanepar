"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { ArrowRight, ChevronRight, CircleHelp, Download, MousePointerClick } from "lucide-react";
import { ResultsReviewDialog } from "@/components/results-review-dialog";
import { formatCaptureIndex } from "@/lib/capture-index/format";
import { defaultCampaigns } from "@/lib/campaign-management";
import { RESULTS_08_SCHEMA, RESULTS_08_POLICY, RESULTS_08_SOURCE_SHA256, type Results08HomeStatistics } from "@/lib/results-08-contract";
import { bandNames, bands } from "./capture-map-scale";
import { SiaPeek, peekMembers, useCampaignPoints, type PeekMetric } from "./sia-peek";
import styles from "./campaign-distribution.module.css";

const domains = { geral: "Índice geral", ambiental: "Ambiental", operacional: "Operacional", saude: "Saúde" };
type Domain = keyof typeof domains;
const metrics: Record<Domain, PeekMetric> = { geral: "overall", ambiental: "environmental", operacional: "operational", saude: "humanHealth" };
type Payload = { schema: string; politica: string; sourceSha256: string; campanhas: Record<string, Partial<Record<Domain, Results08HomeStatistics>>> };
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format;
const interval = (bin: number) => `${decimal(bin / 40)} a ${bin < 39 ? "<" : ""}${decimal((bin + 1) / 40)}`;
const season = (code: string) => defaultCampaigns[Number(code.slice(1)) - 1]?.title.split(" - ")[1] ?? "";

/** Índice de captação de cada campanha, lado a lado. Cada campanha é lida à parte: não há total nem média entre campanhas. */
export function CampaignDistribution() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [domain, setDomain] = useState<Domain>("geral");
  const [data, setData] = useState<Payload>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function read() {
      try {
        const response = await fetch("/api/results/campaign-distribution", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Acesso restrito." : "Distribuição indisponível.");
        const payload: Payload = await response.json();
        if (payload.schema !== RESULTS_08_SCHEMA || payload.politica !== RESULTS_08_POLICY || payload.sourceSha256 !== RESULTS_08_SOURCE_SHA256) throw new Error("Distribuição indisponível para a edição atual.");
        if (!controller.signal.aborted) setData(payload);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Distribuição indisponível.");
      }
    }
    void read();
    return () => controller.abort();
  }, []);
  const campaigns = Object.keys(data?.campanhas ?? {}).filter(c => /^C[1-9]$/.test(c)).sort();
  // Quais SIAs formam cada barra e cada número: as notas por ponto da mesma campanha e categoria.
  const pointsByCampaign = useCampaignPoints();
  const members = Object.fromEntries(campaigns.map(c => [c, peekMembers(pointsByCampaign[c], metrics[domain])]));
  // Mesma escala vertical nas três campanhas: vai até a coluna mais alta da categoria, não até 100%.
  const tallest = Math.max(0, ...campaigns.map(c => { const row = data?.campanhas[c][domain]; return row?.n ? Math.max(...row.colunas) / row.n : 0; }));
  const top = Math.max(0.1, Math.ceil(tallest * 10 - 1e-9) / 10);
  return <section className="app-card min-w-0 space-y-5 p-4 sm:p-6" aria-labelledby="campaign-distribution-title">
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <h2 id="campaign-distribution-title" className="heading-font type-section-title text-[var(--brand-navy-strong)]">Índice de captação por campanha</h2>
          <button type="button" aria-label="Como ler a distribuição por campanha" aria-haspopup="dialog" onClick={() => setHelpOpen(true)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--brand-teal)] hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]"><CircleHelp aria-hidden="true" className="h-5 w-5" /></button>
        </div>
        <p className="type-metadata text-[var(--ink-soft)]">Metodologia 3.0 · cada campanha lida à parte</p>
      </div>
      {data && <div role="group" aria-label="Categoria exibida" className={styles.segmented}>
        {(Object.keys(domains) as Domain[]).map(key => <button type="button" key={key} aria-pressed={domain === key} onClick={() => setDomain(key)}>{domains[key]}</button>)}
      </div>}
    </header>
    {!data ? <p role="status" className="type-metadata">{error || "Carregando distribuições…"}</p> : <>
      <p className="sr-only" role="status">Categoria exibida: {domains[domain]}. Cada campanha é lida à parte; não há total nem média entre campanhas.</p>
      <p className="flex items-center gap-1.5 type-caption text-[var(--ink-soft)]"><MousePointerClick aria-hidden className="size-4 shrink-0 text-[var(--brand-teal)]" />Passe o mouse ou toque em uma coluna, em uma linha ou em um número para ver os SIAs.</p>
      <div className="space-y-4">
        {campaigns.map(code => <CampaignChart key={code} code={code} row={data.campanhas[code][domain]} members={members[code]} domainLabel={domains[domain]} top={top} />)}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 type-caption text-[var(--ink-soft)]" aria-label="Faixas da escala fixa de 0 a 1">{bands.map((band, i) => <li key={band.label} className="inline-flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: band.color }} /><strong className="text-[var(--ink)]">{bandNames[i]}</strong> {band.label}</li>)}</ul>
      <div className="flex flex-wrap items-start justify-between gap-3 border-t border-[var(--line-ghost)] pt-3">
      <details className={`${styles.disclosure} min-w-0 max-sm:w-full sm:flex-1`}>
        <summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-[var(--brand-navy-strong)]"><ChevronRight aria-hidden className="size-4" />Ver as contagens em tabela</summary>
        <div className="mt-2 overflow-x-auto"><table className={styles.table}><caption className="sr-only">Pontos por faixa · {domains[domain]}</caption>
          <thead><tr><th scope="col">Faixa</th>{campaigns.map(c => <th scope="col" key={c}>{c}</th>)}</tr></thead>
          <tbody>{bands.map((band, i) => <tr key={band.label}><th scope="row"><span aria-hidden className={styles.swatch} style={{ backgroundColor: band.color }} />{bandNames[i]} <span className="font-normal text-[var(--ink-soft)]">{band.label}</span></th>{campaigns.map(c => { const stat = data.campanhas[c][domain]; return <td key={c}>{stat?.n ? <SiaPeek className={styles.cellPeek} title={`${c} · ${bandNames[i]} · ${domains[domain]}`} campaign={Number(c.slice(1))} points={members[c].bands[i]} expected={stat.faixas[i]}>{stat.faixas[i]}</SiaPeek> : "—"}</td>; })}</tr>)}</tbody></table></div>
        <details className="disclosure mt-2"><summary className="flex min-h-11 cursor-pointer items-center type-metadata font-semibold">Contagens dos 40 intervalos</summary>
          <div className="overflow-x-auto"><table className={styles.table}><caption className="sr-only">Contagens por intervalo · {domains[domain]}</caption><thead><tr><th scope="col">Intervalo</th>{campaigns.map(c => <th scope="col" key={c}>{c}</th>)}</tr></thead><tbody>{Array.from({ length: 40 }, (_, i) => <tr key={i}><th scope="row">{interval(i)}</th>{campaigns.map(c => { const stat = data.campanhas[c][domain]; return <td key={c}>{stat?.n ? <SiaPeek className={styles.cellPeek} title={`${c} · ${interval(i)} · ${domains[domain]}`} campaign={Number(c.slice(1))} points={members[c].intervals[i]} expected={stat.colunas[i]}>{stat.colunas[i]}</SiaPeek> : "—"}</td>; })}</tr>)}</tbody></table></div>
        </details>
      </details>
        <a className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-4 font-semibold text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)] focus-visible:outline-2" href="/api/results/aggregate-export"><Download aria-hidden className="size-4" />Baixar por campanha (CSV)</a>
      </div>
    </>}
    {helpOpen && <ResultsReviewDialog title="Como ler a distribuição por campanha" closeLabel="Fechar ajuda da distribuição" onClose={() => setHelpOpen(false)}>
      <p className="type-metadata">Cada gráfico mostra uma campanha. O eixo horizontal é o índice, de 0 a 1, em 40 intervalos de 0,025. A altura da coluna é a parte dos pontos com nota que está naquele intervalo, e o número em cima é a quantidade de pontos. A escala vertical é a mesma nas três campanhas e vai até a coluna mais alta.</p>
      <p className="type-metadata mt-2">As linhas verticais marcam o menor índice, a média e o maior índice da campanha. A cor da coluna é a faixa da escala fixa:</p>
      <ul className="mt-2 space-y-1 type-metadata">{bands.map((band, i) => <li key={band.label} className="flex items-center gap-2"><span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: band.color }} /><strong>{bandNames[i]}</strong> {band.label}</li>)}</ul>
      <p className="type-metadata mt-2">A média resume as notas da campanha e pode esconder uma captação com índice alto. O maior índice é o de uma captação; não representa toda a campanha. As faixas orientam investigação, não confirmam dano.</p>
      <p className="type-metadata mt-2">Passe o mouse em uma coluna, nas linhas de mínimo e máximo ou em um número da tabela para ver quais SIAs estão ali. Clicar ou tocar fixa a lista, e cada SIA abre a ficha do ponto.</p>
      <p className="type-metadata mt-2">As campanhas são independentes: não há total nem média juntando campanhas. Ponto sem estimativa fica fora da média, das colunas e das porcentagens.</p>
      <p className="mt-2"><a className="underline" href="/resultados/calculos/3-0">Consultar o método 3.0</a></p>
    </ResultsReviewDialog>}
  </section>;
}

const ticks = [0, 0.05, 0.15, 0.35, 0.7, 1];
const bandOfBin = (bin: number) => [2, 6, 14, 28, 40].findIndex(end => bin < end);

/** Histograma de uma campanha: 40 intervalos de 0 a 1, com mínimo, média e máximo. Colunas e linhas dizem quais SIAs representam. */
function CampaignChart({ code, row, members, domainLabel, top }: { code: string; row?: Results08HomeStatistics; members: ReturnType<typeof peekMembers>; domainLabel: string; top: number }) {
  const number = code.slice(1), campaign = Number(number);
  const head = <div className="flex flex-wrap items-start justify-between gap-2">
    <div className="min-w-0"><p className="type-eyebrow text-[var(--text-teal)]">Campanha {number}</p><h3 className="heading-font type-panel-title text-[var(--brand-navy-strong)]">{season(code) || code}</h3></div>
    {row && <span className="shrink-0 rounded-full bg-[var(--surface-soft)] px-3 py-1 type-caption font-semibold text-[var(--ink)]" data-stat="com-nota">{row.n} de {row.observados} pontos</span>}
  </div>;
  if (!row || row.n === 0) return <article className={styles.card} data-campaign={code} aria-label={`Campanha ${number}`}>{head}<p className="type-metadata text-[var(--ink-soft)]">{row ? "Sem notas nesta categoria; não é zero." : "Série indisponível para esta categoria."}</p></article>;
  const same = (value: number | null, official: number | null) => formatCaptureIndex(value) === formatCaptureIndex(official);
  const lowest = members.scored.filter(point => point.value === members.scored.at(-1)?.value);
  // O ponto só aparece na linha quando a nota dele é a mesma do quadro oficial.
  const highestPoints = members.top.filter(point => same(point.value, row.maximo));
  const lowestPoints = lowest.filter(point => same(point.value, row.minimo));
  const lines = [
    { key: "minimo", label: "mín", name: "Menor índice", value: row.minimo, points: lowestPoints, lane: 1, style: "solid" },
    { key: "media", label: "média", name: "Média", value: row.media, points: [], lane: 0, style: "dashed" },
    { key: "maximo", label: "máx", name: "Maior índice", value: row.maximo, points: highestPoints, lane: 1, style: "dotted" },
  ] as const;
  return <article className={styles.card} data-campaign={code} aria-label={`Campanha ${number}`}>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0"><p className="type-eyebrow text-[var(--text-teal)]">Campanha {number}</p><h3 className="heading-font type-panel-title text-[var(--brand-navy-strong)]">{season(code) || code}</h3></div>
        <span className="shrink-0 rounded-full bg-[var(--surface-soft)] px-3 py-1 type-caption font-semibold text-[var(--ink)]" data-stat="com-nota">{row.n} de {row.observados} pontos</span>
        {row.nulos > 0 && <p className="type-caption text-[var(--ink-soft)]"><SiaPeek className={styles.inlinePeek} title={`C${number} · sem estimativa · ${domainLabel}`} campaign={campaign} points={members.missing} expected={row.nulos}>{row.nulos} ponto{row.nulos > 1 ? "s" : ""} sem estimativa</SiaPeek>, fora do gráfico</p>}
      </div>
      <Link href={`/campanhas/resultados?campaign=${number}&vista=campanha`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-4 font-semibold text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)] focus-visible:outline-2">Abrir a campanha {number}<ArrowRight aria-hidden className="size-4" /></Link>
    </div>
    <div className={styles.plotArea}>
      <div className={styles.yAxis} aria-hidden>{[top, top / 2, 0].map(value => <span key={value}>{Math.round(value * 100)}%</span>)}</div>
      <div className={styles.plot}>
        <div className={styles.bars} role="group" aria-label={`Intervalos do índice na campanha ${number}`}>
          {bands.map((band, i) => <i key={band.label} aria-hidden className={styles.zone} style={{ left: `${100 * (i ? ticks[i] : 0)}%`, width: `${100 * (ticks[i + 1] - ticks[i])}%`, backgroundColor: band.color }} />)}
          <i aria-hidden className={styles.gridLine} style={{ bottom: "calc((100% - 15px) * 0.5)" }} /><i aria-hidden className={styles.gridLine} style={{ bottom: "calc(100% - 15px)" }} />
          {row.colunas.map((count, i) => <SiaPeek key={i} className={styles.bin} style={{ "--h": count / row.n / top } as CSSProperties}
            title={`C${number} · ${interval(i)} · ${domainLabel}`} label={count ? `Índice de ${interval(i)}: ${count} ${count === 1 ? "ponto" : "pontos"}` : undefined}
            campaign={campaign} points={members.intervals[i]} expected={count}>
            {count > 0 && <><small>{count}</small><b style={{ backgroundColor: bands[bandOfBin(i)].color }} /></>}
          </SiaPeek>)}
        </div>
        <div className={styles.lines}>
          {lines.map(line => line.value === null ? null : <span key={line.key} className={styles.line} data-line={line.key} style={{ left: `${100 * line.value}%`, top: `${line.lane * 1.35}rem`, borderLeftStyle: line.style }}>
            <SiaPeek className={`${styles.lineChip} ${line.value < 0.07 ? styles.chipStart : line.value > 0.93 ? styles.chipEnd : ""}`} title={`C${number} · ${line.name} · ${domainLabel}`} campaign={campaign} points={[...line.points]}>{line.label} <strong data-stat={line.key}>{formatCaptureIndex(line.value)}</strong></SiaPeek>
          </span>)}
        </div>
        <div className={styles.ticks} aria-hidden>{ticks.map(value => <span key={value} style={{ left: `${100 * value}%` }}>{decimal(value)}</span>)}</div>
      </div>
    </div>
  </article>;
}
