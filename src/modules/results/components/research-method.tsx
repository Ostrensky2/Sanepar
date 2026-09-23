"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { formatNumber, formatProportionAsPercent } from "@/lib/number-format";
import { RESEARCH_METHOD_DOMAINS, type ResearchMethodDomain, type ResearchMethodTrace, type ResultsResearchResponse } from "@/lib/results-research-contract";
import { formatResultIndex } from "../format-index";
import { continuousResultColor } from "./result-visual";
import { scientificControl } from "./scientific-query-controls";

type Method = NonNullable<ResultsResearchResponse["method"]>;
type TraceSet = ResearchMethodTrace["sets"][number];

const index = (value: number | null | undefined) => formatResultIndex(value ?? null);
const percent = (value: number) => formatProportionAsPercent(value);
const DOMAIN_SHORT: Record<ResearchMethodDomain, string> = { Ambiental: "Ambiental", Operacional: "Operacional", "Saúde humana": "Saúde" };

/** Curva I = ln(1 + αQ)/ln(1 + α) com o conjunto escolhido marcado. Eixo de Q ajustado ao valor, para o ponto não ficar colado no zero. */
export function methodCurve(alpha: number, signal: number) {
  const qMax = signal <= 0.1 ? 0.1 : signal <= 0.3 ? 0.3 : 1;
  const x = (q: number) => 56 + (q / qMax) * 440, y = (value: number) => 196 - value * 176;
  const curve = (q: number) => Math.log1p(alpha * q) / Math.log1p(alpha);
  const path = Array.from({ length: 61 }, (_, step) => { const q = (qMax * step) / 60; return `${step ? "L" : "M"}${x(q).toFixed(1)} ${y(curve(q)).toFixed(1)}`; }).join(" ");
  return { qMax, path, x, y, curve };
}

function Step({ number, title, explanation, formula, variables, children }: { number: number; title: string; explanation: string; formula: string; variables: string; children?: ReactNode }) {
  return <li className="app-card grid gap-3 p-4 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
    <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-teal-soft)] font-bold text-[var(--brand-teal)]">{number}</span>
    <div className="min-w-0 space-y-3">
      <div>
        <h3 className="type-panel-title text-[var(--brand-navy-strong)]"><span className="sr-only">Passo {number}: </span>{title}</h3>
        <p className="type-body mt-1 max-w-[75ch] text-[var(--ink-soft)]">{explanation}</p>
      </div>
      {children}
      <details className="text-sm">
        <summary className="type-label min-h-11 cursor-pointer content-center text-[var(--brand-navy-strong)]">Ver fórmula</summary>
        <p className="overflow-x-auto rounded bg-[var(--surface-soft)] px-3 py-2 font-mono text-sm" tabIndex={0}>{formula}</p>
        <p className="type-metadata mt-1 max-w-[75ch] text-[var(--ink-soft)]">{variables}</p>
      </details>
    </div>
  </li>;
}

function Bar({ label, value, max = 1, text, color = "var(--brand-teal)", italic = false }: { label: ReactNode; value: number; max?: number; text: ReactNode; color?: string; italic?: boolean }) {
  return <div className="grid grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto] items-center gap-3 text-sm max-sm:grid-cols-[minmax(0,1fr)_auto]">
    <span className={`min-w-0 truncate ${italic ? "italic" : ""}`}>{label}</span>
    <span aria-hidden="true" className="h-2.5 rounded bg-[var(--surface-soft)] max-sm:order-3 max-sm:col-span-2"><span className="block h-full rounded" style={{ width: `${Math.min(100, Math.max(value > 0 ? 1 : 0, (value / max) * 100))}%`, background: color }} /></span>
    <span className="whitespace-nowrap text-right tabular-nums">{text}</span>
  </div>;
}

function ScoreChip({ score, active }: { score: number | null; active: boolean }) {
  return <span className={`inline-flex min-w-16 justify-center rounded-full px-2 py-0.5 text-xs font-bold ${active ? "ring-2 ring-[var(--brand-teal)]" : ""} ${score === null ? "bg-[var(--surface-soft)] text-[var(--ink-soft)]" : "bg-[var(--brand-teal-soft)] text-[var(--brand-navy-strong)]"}`}>{score === null ? "sem nota" : `nota ${score}`}</span>;
}

function Segmented<T extends string>({ label, options, value, onChange, render }: { label: string; options: readonly T[]; value: T; onChange: (value: T) => void; render?: (value: T) => string }) {
  return <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
    {options.map((option) => <button key={option} type="button" role="radio" aria-checked={value === option} onClick={() => onChange(option)}
      className="min-h-11 rounded-lg border border-[var(--line-strong)] px-3 text-sm font-bold text-[var(--ink)] aria-checked:border-[var(--brand-navy-strong)] aria-checked:bg-[var(--brand-navy-strong)] aria-checked:text-white focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]">{render ? render(option) : option}</button>)}
  </div>;
}

/**
 * Passo a passo do cálculo com os números de um ponto real, escolhido no topo.
 * Somente consulta: refaz a conta com a planilha publicada e mostra o valor publicado ao lado.
 */
export function ResearchMethod({ method, selectedSia, onSelectSia, pointHref }: { method: Method; selectedSia?: string; onSelectSia?: (sia: string) => void; pointHref?: (sia: string) => string }) {
  const trace = method.trace ?? null;
  const stage = (id: string) => method.stages.find((item) => item.id === id);
  const [setLabel, setSetLabel] = useState<string>("");
  const [domain, setDomain] = useState<ResearchMethodDomain>("Ambiental");
  const current: TraceSet | undefined = trace?.sets.find((item) => item.set === setLabel) ?? trace?.sets[0];
  const values = current?.domains[domain];
  const listed = current?.organisms ?? [];
  const listedSignal = listed.reduce((sum, organism) => { const score = organism.scores[domain]; return sum + (score === null ? 0 : organism.proportion * score / 3); }, 0);
  const others = current ? current.organismCount - listed.length : 0;
  const curve = values?.signal != null ? methodCurve(method.parameters.alpha, values.signal) : null;

  const steps: Array<{ id: string; body: ReactNode }> = [
    { id: "denominator", body: current && <div className="space-y-2">
      <p className="type-label">{current.set}: <strong className="tabular-nums">{formatNumber(current.totalReads)}</strong> reads de {formatNumber(current.organismCount)} organismos</p>
      <div className="space-y-1.5">{listed.map((organism) => <Bar key={organism.label} italic label={organism.label} value={organism.proportion} text={`${formatNumber(organism.reads)} · ${percent(organism.proportion)}`} />)}</div>
      {current.organismCount === 0 && <p className="type-metadata">Sem registros deste conjunto neste ponto.</p>}
      {others > 0 && <p className="type-caption text-[var(--ink-soft)]">+ {formatNumber(others)} organismos com menos reads, que também entram no total.</p>}
    </div> },
    { id: "score", body: current && <div className="overflow-x-auto" role="region" aria-label="Notas da literatura" tabIndex={0}><table className="w-full min-w-[30rem] text-left text-sm">
      <thead><tr className="text-[var(--ink-soft)]"><th scope="col" className="py-1 pr-3 font-semibold">Organismo</th>{RESEARCH_METHOD_DOMAINS.map((item) => <th key={item} scope="col" className="px-2 py-1 font-semibold">{DOMAIN_SHORT[item]}</th>)}</tr></thead>
      <tbody>{listed.map((organism) => <tr key={organism.label} className="border-t border-[var(--line-ghost)]"><td className="py-1.5 pr-3 italic">{organism.label}</td>{RESEARCH_METHOD_DOMAINS.map((item) => <td key={item} className="px-2 py-1.5"><ScoreChip score={organism.scores[item]} active={item === domain} /></td>)}</tr>)}</tbody>
    </table></div> },
    { id: "signal", body: current && values && <div className="space-y-1.5">
      {listed.filter((organism) => organism.scores[domain] !== null).map((organism) => {
        const score = organism.scores[domain] as number, product = organism.proportion * score / 3;
        return <Bar key={organism.label} italic label={organism.label} value={product} max={Math.max(values.signal ?? 0, product, 0.0001)} text={<>{percent(organism.proportion)} × {score}/3 = <strong>{index(product)}</strong></>} />;
      })}
      {!listed.some((organism) => organism.scores[domain] !== null) && <p className="type-metadata">Nenhum dos organismos com mais reads tem nota em {domain.toLocaleLowerCase("pt-BR")}.</p>}
      {values.signal !== null && values.signal - listedSignal > 0.0005 && <p className="type-caption text-[var(--ink-soft)]">Os demais organismos com nota somam {index(values.signal - listedSignal)}.</p>}
      <p className="type-label pt-1">Sinal do conjunto em {domain.toLocaleLowerCase("pt-BR")}: <strong className="tabular-nums">Q = {index(values.signal)}</strong></p>
    </div> },
    { id: "component", body: values && <div className="space-y-2">
      {curve && values.calculated !== null && <figure className="max-w-lg">
        <svg viewBox="0 0 520 232" className="h-auto w-full" role="img" aria-label={`Curva de 0 a 1: Q ${index(values.signal)} vira ${index(values.calculated)}`}>
          <line x1="56" y1="196" x2="500" y2="196" stroke="var(--line-strong)" />
          <line x1="56" y1="20" x2="56" y2="196" stroke="var(--line-strong)" />
          <line x1="56" y1="108" x2="500" y2="108" stroke="var(--line-ghost)" strokeDasharray="3 4" />
          {[[0, "0"], [0.5, "0,5"], [1, "1"]].map(([value, label]) => <text key={label} x="48" y={curve.y(value as number) + 4} textAnchor="end" fontSize="12" fill="var(--ink-soft)">{label}</text>)}
          {[0, 0.5, 1].map((share) => <text key={share} x={curve.x(curve.qMax * share)} y="214" textAnchor="middle" fontSize="12" fill="var(--ink-soft)">{formatResultIndex(curve.qMax * share).replace(/0+$/, "").replace(/,$/, "")}</text>)}
          <text x="278" y="230" textAnchor="middle" fontSize="12" fill="var(--ink-soft)">sinal do conjunto (Q)</text>
          <path d={curve.path} fill="none" stroke="var(--brand-teal)" strokeWidth="2.5" />
          <line x1={curve.x(values.signal as number)} y1="196" x2={curve.x(values.signal as number)} y2={curve.y(values.calculated)} stroke="var(--brand-navy-strong)" strokeDasharray="2 3" />
          <line x1="56" y1={curve.y(values.calculated)} x2={curve.x(values.signal as number)} y2={curve.y(values.calculated)} stroke="var(--brand-navy-strong)" strokeDasharray="2 3" />
          <circle cx={curve.x(values.signal as number)} cy={curve.y(values.calculated)} r="5" fill="var(--brand-navy-strong)" />
          <text x={Math.min(curve.x(values.signal as number) + 10, 380)} y={curve.y(values.calculated) - 10} fontSize="13" fontWeight="700" fill="var(--brand-navy-strong)">Q {index(values.signal)} → {index(values.calculated)}</text>
        </svg>
      </figure>}
      <p className="type-label">Valor do conjunto: <strong className="tabular-nums">{index(values.calculated)}</strong>{values.used !== null && Math.abs((values.used ?? 0) - (values.calculated ?? 0)) > 0.0005 ? <> · valor publicado {index(values.used)}</> : null}</p>
      {current?.included === false && <p className="type-metadata rounded bg-[var(--status-warning-soft)] px-3 py-2 text-[var(--status-warning-strong)]">Este conjunto não entrou no índice deste ponto{current.analyticalStatus ? ` (${current.analyticalStatus})` : ""}.</p>}
    </div> },
    { id: "aggregate", body: trace && <div className="space-y-3">
      <div className="overflow-x-auto" role="region" aria-label="Valores por conjunto e domínio" tabIndex={0}><table className="w-full min-w-[28rem] text-center text-sm">
        <thead><tr className="text-[var(--ink-soft)]"><th scope="col" className="py-1 text-left font-semibold">Conjunto</th>{RESEARCH_METHOD_DOMAINS.map((item) => <th key={item} scope="col" className="px-2 py-1 font-semibold">{DOMAIN_SHORT[item]}</th>)}</tr></thead>
        <tbody>{trace.sets.map((item) => <tr key={item.set} className="border-t border-[var(--line-ghost)]"><th scope="row" className="py-1.5 pr-2 text-left font-semibold">{item.set}</th>{RESEARCH_METHOD_DOMAINS.map((name) => {
          const used = item.included ? item.domains[name].used : null;
          return <td key={name} className="px-1 py-1"><span className="block rounded px-2 py-1 font-bold tabular-nums" style={used === null ? { background: "var(--surface-soft)", color: "var(--ink-soft)" } : { background: continuousResultColor(used), color: used > 0.55 ? "white" : "var(--ink)" }}>{used === null ? "fora" : index(used)}</span></td>;
        })}</tr>)}
          <tr className="border-t-2 border-[var(--line-strong)]"><th scope="row" className="py-1.5 pr-2 text-left">Domínio</th>{RESEARCH_METHOD_DOMAINS.map((name) => { const range = trace.domains[name]; return <td key={name} className="px-2 py-1.5 font-bold tabular-nums">{range.value !== null ? index(range.value) : `${index(range.lower)}–${index(range.upper)}`}</td>; })}</tr>
        </tbody>
      </table></div>
      {trace.sets.some((item) => !item.included) && <p className="type-caption text-[var(--ink-soft)]">“fora”: conjunto que não entrou no índice deste ponto ({trace.sets.filter((item) => !item.included).map((item) => `${item.set}: ${item.analyticalStatus ?? "situação não informada"}`).join("; ")}).</p>}
      <p className="type-label">{trace.overall.value !== null
        ? <>Índice geral: ({RESEARCH_METHOD_DOMAINS.map((name) => index(trace.domains[name].value)).join(" + ")}) ÷ 3 = <strong className="text-base tabular-nums">{index(trace.overall.value)}</strong>{trace.rank ? ` · ${trace.rank}º da campanha` : ""}</>
        : <>{3 - trace.usedSetCount === 1 ? "Faltou 1 conjunto" : `Faltaram ${3 - trace.usedSetCount} conjuntos`}: o índice geral fica na faixa <strong className="tabular-nums">{index(trace.overall.lower)}–{index(trace.overall.upper)}</strong> e o ponto não entra no ranking.</>}</p>
    </div> },
    { id: "coverage", body: current && <div className="space-y-1.5">
      {RESEARCH_METHOD_DOMAINS.map((name) => { const coverage = current.domains[name].coverage; return <Bar key={name} label={DOMAIN_SHORT[name]} value={coverage ?? 0} text={coverage === null ? "sem reads" : `${percent(coverage)} dos reads têm nota`} color="var(--brand-navy)" />; })}
    </div> },
  ];

  return <section className="space-y-4" aria-label="Como o índice é calculado">
    <section className="app-card space-y-3 p-4" aria-labelledby="method-point-title">
      <h2 id="method-point-title" className="heading-font type-section-title text-[var(--brand-navy-strong)]">Refaça o cálculo de um ponto</h2>
      <p className="type-metadata text-[var(--ink-soft)]">Escolha o ponto: cada passo abaixo passa a mostrar os números dele. A lista segue o ranking da campanha.</p>
      {method.points?.length ? <label className="type-label flex max-w-2xl flex-col gap-1">Ponto
        <select className={scientificControl} value={trace?.sia ?? selectedSia ?? ""} onChange={(event) => onSelectSia?.(event.target.value)}>
          {method.points.map((point) => <option key={point.sia} value={point.sia}>{point.rank ? `${point.rank}º · ` : "Parcial · "}{point.label}{point.overall !== null ? ` · ${index(point.overall)}` : ""}</option>)}
        </select>
      </label> : null}
      {trace ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line-ghost)] pt-3">
        <div className="min-w-0">
          <p className="heading-font text-lg font-bold text-[var(--brand-navy-strong)]">{trace.waterBody ?? trace.sia}</p>
          <p className="type-metadata text-[var(--ink-soft)]">{[trace.municipality, trace.sia, trace.campaign].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-right"><span className="type-caption block text-[var(--ink-soft)]">Índice geral</span><strong className="heading-font text-2xl tabular-nums text-[var(--brand-navy-strong)]">{trace.overall.value !== null ? index(trace.overall.value) : `${index(trace.overall.lower)}–${index(trace.overall.upper)}`}</strong></p>
          {pointHref && <Link href={pointHref(trace.sia)} className={`${scientificControl} inline-flex items-center font-bold`}>Ver na ficha do ponto</Link>}
        </div>
      </div> : <p role="status" className="type-metadata">Nenhum ponto com cálculo publicado nesta campanha.</p>}
      {trace && trace.sets.length > 0 && <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--line-ghost)] pt-3">
        <div><p className="type-caption mb-1 text-[var(--ink-soft)]">Conjunto usado nos passos 1 a 4 e 6</p><Segmented label="Conjunto" options={trace.sets.map((item) => item.set)} value={current?.set ?? ""} onChange={setSetLabel} /></div>
        <div><p className="type-caption mb-1 text-[var(--ink-soft)]">Domínio usado nos passos 3 e 4</p><Segmented label="Domínio" options={RESEARCH_METHOD_DOMAINS} value={domain} onChange={setDomain} render={(item) => DOMAIN_SHORT[item]} /></div>
      </div>}
    </section>
    <ol className="space-y-3">{steps.map(({ id, body }, position) => {
      const info = stage(id);
      return info ? <Step key={id} number={position + 1} title={info.title} explanation={info.explanation} formula={info.formula} variables={info.variables}>{body}</Step> : null;
    })}</ol>
    <p className="type-metadata text-[var(--ink-soft)]">Parâmetros do método: α = {method.parameters.alpha} · expoente e = {method.parameters.severityExponent} · {method.parameters.requiredSetCount} conjuntos · {method.parameters.domainCount} domínios. Esta tela só consulta; não altera o cálculo publicado.</p>
  </section>;
}
