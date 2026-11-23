"use client";

import { RESULTS_08_SCHEMA, RESULTS_08_POLICY, RESULTS_08_SOURCE_SHA256, type Results08HomeStatistics } from "@/lib/results-08-contract";
import { useEffect, useState } from "react";
import { CircleHelp } from "lucide-react";
import { ResultsReviewDialog } from "@/components/results-review-dialog";
import styles from "./campaign-distribution.module.css";


const domains = { geral: "Geral", ambiental: "Ambiental", operacional: "Operacional", saude: "Saúde" };
type Domain = keyof typeof domains;
type Payload = { schema: string; politica: string; sourceSha256: string; campanhas: Record<string, Partial<Record<Domain, Results08HomeStatistics>>> };
const bounds = [0, 2, 6, 14, 28, 40];
const colors = ["#687782", "#16804d", "#d5a917", "#c04136", "#72419b"];
const format = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format;
const markers = [["minimo", "Mínimo", "solid", 1], ["media", "Média", "dashed", 2], ["maximo", "Máximo", "dotted", 4]] as const;
const bandFor = (bin: number) => bounds.slice(1).findIndex(end => bin < end);

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
  const [selected, setSelected] = useState<Record<string, number>>({});
  const campaigns = Object.keys(data?.campanhas ?? {}).filter(c => /^C[1-9]$/.test(c)).sort();
  return <section className={`app-card space-y-4 ${styles.panel}`} aria-labelledby="campaign-distribution-title">
    <header><div className="flex items-center gap-2"><h2 id="campaign-distribution-title" className="type-section-title">Distribuição do índice por campanha</h2>
      <button type="button" aria-label="Como ler a distribuição por campanha" aria-haspopup="dialog" onClick={() => setHelpOpen(true)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--brand-teal)] hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]"><CircleHelp aria-hidden="true" className="h-5 w-5" /></button></div>
      <p className="type-metadata">Método 0.8 · distribuição de cada campanha</p></header>
    {!data ? <p role="status">{error || "Carregando distribuições…"}</p> : <>
      <label className="type-label">Domínio <select className={styles.select} value={domain} onChange={e => setDomain(e.target.value as Domain)}>
        {(Object.keys(domains) as Domain[]).map(key => <option key={key} value={key}>{domains[key]}</option>)}
      </select></label>
      <p role="status">Domínio {domains[domain]} · cada campanha é lida à parte; não há total nem média entre campanhas.</p>
      <p className="type-metadata">A média e os percentuais consideram somente as captações com estimativa numérica no domínio selecionado. As contagens por faixa também excluem os registros sem estimativa.</p>
      <div className={styles.keys} aria-label="Legenda das linhas">{markers.map(([key,label,style,width]) => <span key={key}><i style={{ borderLeftStyle: style, borderLeftWidth: width }} />{label}</span>)}</div>
      
      {campaigns.map(c => {
        const row = data.campanhas[c][domain];
        const heading = <h3 className="type-panel-title">{c}</h3>;
        if (!row) return <article key={c} className={styles.row} aria-label={c}>{heading}<p>Série indisponível para este domínio.</p></article>;
        const coverage = <p className="type-metadata">Medidos: {row.observados} · Com estimativa: {row.n} · Sem estimativa: {row.nulos}</p>;
        if (row.n === 0) return <article key={c} className={styles.row} aria-label={c}>{heading}{coverage}<p>Sem estimativas numéricas para calcular estatísticas ou percentuais.</p></article>;
        const index = selected[c] ?? 0;
        return <article key={c} className={styles.row} aria-label={c}>
          {heading}{coverage}
          <div className={styles.plot}><div className={styles.yAxis} aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
          <div className={styles.chart} role="group" aria-label={`Intervalos de ${c}`}>{row.colunas.map((count,i) => {
            const percentage = 100 * count / row.n;
            return <button type="button" key={i} tabIndex={index === i ? 0 : -1}
              aria-pressed={index === i} aria-label={`Intervalo ${i+1}: ${count} de ${row.n}, ${format(percentage)}%`}
              onClick={() => setSelected(s => ({...s,[c]:i}))}
              onKeyDown={event => {
                const positions: Record<string, number> = {ArrowLeft: Math.max(0,i-1), ArrowRight: Math.min(39,i+1), Home: 0, End: 39};
                const next = positions[event.key];
                if (next === undefined) return;
                event.preventDefault();
                setSelected(s => ({...s,[c]:next}));
                event.currentTarget.parentElement?.querySelectorAll("button")[next]?.focus();
              }}>
              <span style={{ height: `${percentage}%`, backgroundColor: colors[bandFor(i)] }} />
            </button>;
          })}
            {markers.map(([key,,style,width]) => {
              const value = row[key];
              if (value === null) return null;
              const shared = markers.filter(([other]) => row[other] === row[key]);
              const lane = shared.findIndex(([other]) => other === key);
              return <i aria-hidden="true" key={key} style={{ left: `${100*value}%`, top: `${100*lane/shared.length}%`, height: `${100/shared.length}%`, borderLeftStyle: style, borderLeftWidth: width }} />;
            })}
          </div></div>
          <p aria-live="polite" className="type-metadata">Intervalo {format(index/40)} a {index<39?"< ":""}{format((index+1)/40)} · {row.colunas[index]} de {row.n} · {format(100*row.colunas[index]/row.n)}%</p>
          <div className={styles.axis} aria-hidden="true">{["0","0,25","0,50","0,75","1"].map(x=><span key={x}>{x}</span>)}</div>
          <p className="type-metadata">{markers.map(([key,label]) => label+" "+(row[key] === null ? "indisponível" : format(row[key]))).join(" · ")}</p>
        </article>;
      })}
      <div className={styles.tableFrame}><table className={styles.table}><caption>Frequências por faixa do índice</caption><thead><tr><th scope="col">Faixa</th>{campaigns.map(c=><th scope="col" key={c}>{c}</th>)}</tr></thead>
        <tbody>{colors.map((color,i)=><tr key={color}><th scope="row"><b style={{backgroundColor:color}} />{format(bounds[i]/40)} a {i<4?"< ":""}{format(bounds[i+1]/40)}</th>{campaigns.map(c=><td key={c}>{data.campanhas[c][domain]?.n ? data.campanhas[c][domain]!.colunas.slice(bounds[i],bounds[i+1]).reduce((a,b)=>a+b,0) : "—"}</td>)}</tr>)}</tbody></table></div>
      <details><summary className={styles.summary}>Consultar frequências dos 40 intervalos</summary><div className={styles.tableFrame}><table className={styles.table}><caption>Contagens por intervalo · {domains[domain]}</caption><thead><tr><th scope="col">Intervalo</th>{campaigns.map(c=><th scope="col" key={c}>{c}</th>)}</tr></thead><tbody>{Array.from({length:40},(_,i)=><tr key={i}><th scope="row">{format(i/40)} a {i<39?"< ":""}{format((i+1)/40)}</th>{campaigns.map(c=><td key={c}>{data.campanhas[c][domain]?.n ? data.campanhas[c][domain]!.colunas[i] : "—"}</td>)}</tr>)}</tbody></table></div></details>
      <a className="inline-flex min-h-11 items-center font-semibold underline" href="/api/results/aggregate-export">Baixar resultados 0.8 por campanha (CSV)</a>
      <footer className="type-metadata">A média pode esconder picos. O máximo é a maior nota observada, não a condição de toda a campanha. As faixas orientam investigação; não confirmam dano.</footer>
    </>}
    {helpOpen && <ResultsReviewDialog title="Como ler a distribuição por campanha" closeLabel="Fechar ajuda da distribuição" onClose={() => setHelpOpen(false)}>
      <p className="type-metadata">A régua mostra frequências, sem composição nominal das faixas. Escala vertical comum de 0 a 100% das captações com estimativa no domínio em cada campanha. Selecione uma coluna para consultar a frequência. Use as setas para percorrer os intervalos.</p>
      <p className="type-metadata mt-2">A média resume as estimativas numéricas e pode esconder uma captação com índice alto. O máximo é o maior índice observado em uma captação; não representa toda a campanha. As faixas orientam investigação, não confirmam dano.</p>
      <p className="type-metadata mt-2">O marcador e o banco de referência limitam a confiança no nome. Parentesco pode motivar investigação; não atribui grau.</p>
      <p className="mt-2"><a className="underline" href="/resultados/calculos/0-8">Consultar o método 0.8</a></p>
    </ResultsReviewDialog>}
  </section>;
}
