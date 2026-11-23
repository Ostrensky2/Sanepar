"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  return <section className="app-card min-w-0 space-y-5 p-4 sm:p-6" aria-labelledby="campaign-distribution-title">
    <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <h2 id="campaign-distribution-title" className="heading-font type-section-title text-[var(--brand-navy-strong)]">Índice de captação por campanha</h2>
          <button type="button" aria-label="Como ler a distribuição por campanha" aria-haspopup="dialog" onClick={() => setHelpOpen(true)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--brand-teal)] hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]"><CircleHelp aria-hidden="true" className="h-5 w-5" /></button>
        </div>
        <p className="type-metadata text-[var(--ink-soft)]">Metodologia 0.8 · cada campanha lida à parte</p>
      </div>
      {data && <div role="group" aria-label="Categoria exibida" className={styles.segmented}>
        {(Object.keys(domains) as Domain[]).map(key => <button type="button" key={key} aria-pressed={domain === key} onClick={() => setDomain(key)}>{domains[key]}</button>)}
      </div>}
    </header>
    {!data ? <p role="status" className="type-metadata">{error || "Carregando distribuições…"}</p> : <>
      <p className="sr-only" role="status">Categoria exibida: {domains[domain]}. Cada campanha é lida à parte; não há total nem média entre campanhas.</p>
      <p className="flex items-center gap-1.5 type-caption text-[var(--ink-soft)]"><MousePointerClick aria-hidden className="size-4 shrink-0 text-[var(--brand-teal)]" />Passe o mouse ou toque em uma barra ou número para ver os SIAs.</p>
      <div className="grid gap-4 lg:grid-cols-3">
        {campaigns.map(code => <CampaignCard key={code} code={code} row={data.campanhas[code][domain]} members={members[code]} domainLabel={domains[domain]} />)}
      </div>
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
      <p className="type-metadata">Cada cartão mostra uma campanha. As barras contam quantos pontos da campanha estão em cada faixa do índice, na escala fixa de 0 a 1. A porcentagem é sobre os pontos com nota naquela campanha.</p>
      <ul className="mt-2 space-y-1 type-metadata">{bands.map((band, i) => <li key={band.label} className="flex items-center gap-2"><span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: band.color }} /><strong>{bandNames[i]}</strong> {band.label}</li>)}</ul>
      <p className="type-metadata mt-2">A média resume as notas da campanha e pode esconder uma captação com índice alto. O maior índice é o de uma captação; não representa toda a campanha. As faixas orientam investigação, não confirmam dano.</p>
      <p className="type-metadata mt-2">Passe o mouse em uma barra, no maior índice ou em um número da tabela para ver quais SIAs estão ali. Clicar ou tocar fixa a lista, e cada SIA abre a ficha do ponto.</p>
      <p className="type-metadata mt-2">As campanhas são independentes: não há total nem média juntando campanhas. Ponto sem estimativa fica fora da média e das colunas.</p>
      <p className="mt-2"><a className="underline" href="/resultados/calculos/0-8">Consultar o método 0.8</a></p>
    </ResultsReviewDialog>}
  </section>;
}

function CampaignCard({ code, row, members, domainLabel }: { code: string; row?: Results08HomeStatistics; members: ReturnType<typeof peekMembers>; domainLabel: string }) {
  const number = code.slice(1), campaign = Number(number);
  const head = <div className="flex items-start justify-between gap-3">
    <div className="min-w-0"><p className="type-eyebrow text-[var(--text-teal)]">Campanha {number}</p><h3 className="heading-font type-panel-title text-[var(--brand-navy-strong)]">{season(code) || code}</h3></div>
    {row && <span className="shrink-0 rounded-full bg-[var(--surface-soft)] px-3 py-1 type-caption font-semibold text-[var(--ink)]" data-stat="com-nota">{row.n} de {row.observados} pontos</span>}
  </div>;
  if (!row || row.n === 0) return <article className={styles.card} data-campaign={code} aria-label={`Campanha ${number}`}>{head}<p className="type-metadata text-[var(--ink-soft)]">{row ? "Sem notas nesta categoria; não é zero." : "Série indisponível para esta categoria."}</p></article>;
  const attention = row.faixas.slice(2).reduce((sum, count) => sum + count, 0);
  return <article className={styles.card} data-campaign={code} aria-label={`Campanha ${number}`}>
    {head}
    <dl className="grid grid-cols-3 gap-2">
      {([
        ["media", "Média", formatCaptureIndex(row.media), [], undefined],
        // O maior índice é de uma captação: o balão diz qual. Só aparece se a nota do ponto é a mesma do quadro.
        ["maximo", "Maior", formatCaptureIndex(row.maximo), members.top.filter(point => formatCaptureIndex(point.value) === formatCaptureIndex(row.maximo)), undefined],
        ["atencao", "Atenção ou acima", String(attention), members.attention, attention],
      ] as const).map(([key, label, value, points, expected]) => <div key={key} className="min-w-0">
        <dt className="type-caption text-[var(--ink-soft)]">{label}</dt>
        <dd className="heading-font text-2xl font-extrabold tabular-nums text-[var(--brand-navy-strong)]" data-stat={key}><SiaPeek className={styles.statPeek} title={`C${number} · ${label} · ${domainLabel}`} campaign={campaign} points={[...points]} expected={expected}>{value}</SiaPeek></dd>
      </div>)}
    </dl>
    {/* Uma barra por faixa: lê-se de relance, sem amontoar colunas perto do zero. */}
    <ul className={styles.bands} aria-label={`Pontos por faixa na campanha ${number}`}>
      {bands.map((band, i) => {
        const count = row.faixas[i], share = count / row.n;
        return <li key={band.label}>
          <SiaPeek className={styles.bandRow} title={`C${number} · ${bandNames[i]} · ${domainLabel}`} campaign={campaign} points={members.bands[i]} expected={count}>
            <span className={styles.bandName}><i aria-hidden style={{ backgroundColor: band.color }} />{bandNames[i]}</span>
            <span className={styles.track} aria-hidden><b style={{ width: count ? `max(4px, ${100 * share}%)` : 0, backgroundColor: band.color }} /></span>
            <span className={styles.bandValue}><strong>{count}</strong> · {Math.round(100 * share)}%</span>
          </SiaPeek>
        </li>;
      })}
    </ul>
    {row.nulos > 0 && <p className="type-caption text-[var(--ink-soft)]"><SiaPeek className={styles.inlinePeek} title={`C${number} · sem estimativa · ${domainLabel}`} campaign={campaign} points={members.missing} expected={row.nulos}>{row.nulos} ponto{row.nulos > 1 ? "s" : ""} sem estimativa</SiaPeek>, fora da média.</p>}
    <Link href={`/campanhas/resultados?campaign=${number}&vista=campanha`} className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-4 font-semibold text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)] focus-visible:outline-2">Abrir a campanha {number}<ArrowRight aria-hidden className="size-4" /></Link>
  </article>;
}
