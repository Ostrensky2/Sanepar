"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { formatCaptureShare } from "@/lib/capture-index/format";
import { ORGANISM_LEVELS, exoticCategoryLabels, organismLevelLabels, organismMarkerLabels, type OrganismLevel, type OrganismMarker, type OrganismOccurrences, type OrganismSummary } from "@/lib/results-organisms/contract";
import { ResultsInterpretationHelp } from "./results-interpretation-help";
import { ScientificViews, scientificControl } from "./scientific-query-controls";
import { SiaPeek, useCampaignPoints } from "./sia-peek";

type Row = OrganismSummary & { effects: { id: string; domain: string }[] };
type MarkerSummary = { points: number; usablePoints: number; inconclusive: string[]; runs: string[] };
type ListResponse = { campaign: number; source: string; marker: OrganismMarker; level: OrganismLevel; summary: Record<OrganismMarker, MarkerSummary>; rows: Row[] };
const PAGE = 25;
const count = (value: number) => value.toLocaleString("pt-BR");
const unit: Record<OrganismLevel, [string, string]> = { risco: ["grupo de risco", "grupos de risco"], exoticas: ["exótica", "exóticas"], genero: ["gênero", "gêneros"], familia: ["família", "famílias"] };
const domainShort: Record<string, string> = { Ambiental: "Ambiental", Operacional: "Operacional", "Saúde humana": "Saúde" };
const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Resultados › Organismos. Lê só a planilha unificada da campanha (matrizes por SIA do laboratório): grupo de risco, gênero e família; espécie só nas exóticas do COI. */
export function OrganismsBrowser({ campaign }: { campaign: number }) {
  const [marker, setMarker] = useState<OrganismMarker>("16S");
  const [level, setLevel] = useState<OrganismLevel>("risco");
  const [query, setQuery] = useState("");
  const [unresolved, setUnresolved] = useState(false);
  const [onlyEffects, setOnlyEffects] = useState(false);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const url = `/api/results/organisms?${new URLSearchParams({ campaign: String(campaign), marker, level })}`;
  const [state, setState] = useState<{ url: string; data?: ListResponse; error?: string }>();
  const [detail, setDetail] = useState<{ key: string; data?: OrganismOccurrences; error?: boolean }>();
  const places = useCampaignPoints()[`C${campaign}`];
  const placeOf = useMemo(() => new Map((places ?? []).map(point => [point.siaCode, point.municipality || point.waterBody || null])), [places]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(url, { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json() as ListResponse & { error?: string };
      if (!response.ok) throw new Error([401, 403].includes(response.status) ? "Seu perfil não tem acesso a este resultado." : body.error || "Não foi possível carregar os organismos.");
      if (!controller.signal.aborted) setState({ url, data: body });
    }).catch((error: Error) => { if (!controller.signal.aborted) setState({ url, error: error.message }); });
    return () => controller.abort();
  }, [url]);

  const detailKey = open ? `${url}&taxon=${encodeURIComponent(open)}` : "";
  useEffect(() => {
    if (!detailKey) return;
    const controller = new AbortController();
    void fetch(detailKey, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const body = await response.json() as OrganismOccurrences;
      if (!controller.signal.aborted) setDetail({ key: detailKey, data: body });
    }).catch(() => { if (!controller.signal.aborted) setDetail({ key: detailKey, error: true }); });
    return () => controller.abort();
  }, [detailKey]);

  const data = state?.url === url ? state.data : undefined;
  const error = state?.url === url ? state.error : undefined;
  const hasUnresolved = !!data?.rows.some(row => row.unresolved);
  const filtered = useMemo(() => {
    const term = normalize(query.trim());
    return (data?.rows ?? []).filter(row => (unresolved || !row.unresolved) && (!onlyEffects || row.effects.length > 0) && (!term || normalize(row.name).includes(term)));
  }, [data, query, unresolved, onlyEffects]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages - 1);
  const rows = filtered.slice(current * PAGE, current * PAGE + PAGE);
  const info = data?.summary[marker];
  const reset = () => { setPage(0); setOpen(null); };
  function changeMarker(value: string) { const next = value as OrganismMarker; setMarker(next); setLevel(ORGANISM_LEVELS[next][0]); setQuery(""); setOnlyEffects(false); reset(); }
  const exotic = level === "exoticas", risk = level === "risco";
  const columns = 5 + (exotic ? 1 : 0) + (risk ? 0 : 1);

  return <section className="min-w-0 space-y-4" aria-labelledby="organisms-title">
    <div className="flex flex-wrap items-center gap-1">
      <h2 id="organisms-title" className="type-section-title">Organismos detectados · C{campaign}</h2>
      <ResultsInterpretationHelp title="Como ler os organismos">
        <p><strong>De onde vem:</strong> da planilha unificada da campanha, guardada em Central de dados › Planilhas de resultados, com as matrizes por SIA da reanálise do laboratório. É a mesma base das notas do índice. A planilha antiga não é usada.</p>
        <p><strong>Nível:</strong> os resultados são tratados por grupo de risco, gênero e família. Espécie aparece só nas exóticas do COI, quando o laboratório sustenta a identificação. “Candidata” quer dizer que o gênero foi visto, mas a espécie não foi resolvida. “Status regional pendente” ainda não é exótica confirmada.</p>
        <p><strong>Grupos de risco (16S):</strong> toxinas, gosto e odor, patogenicidade, nitrificação, ferro e manganês, enxofre e corrosão, biofilmes. Um mesmo read pode entrar em mais de um grupo, por isso os grupos não se somam.</p>
        <p><strong>Pontos:</strong> em quantos SIAs da campanha o organismo teve reads. Passe o mouse no número para ver quais.</p>
        <p><strong>Maior participação:</strong> a maior fatia dos reads do marcador que o organismo alcançou num ponto. Proporção de reads não mede quantidade de organismos.</p>
        <p><strong>Efeito no índice:</strong> marca os organismos que têm ficha de efeito e entram na nota, inclusive as fichas provisórias. Sem marca, o organismo foi detectado, mas não pontua. O clique abre as fichas dele em Impactos potenciais.</p>
        <p>No COI, só entram organismos de água doce. Cada ponto usa a mesma corrida que deu a nota do índice: na C3, a NextSeq e, quando ela não tem leitura utilizável, a MiSeq. As campanhas nunca são somadas.</p>
      </ResultsInterpretationHelp>
    </div>
    <div className="app-card flex flex-wrap items-end gap-3 p-3">
      <div className="flex min-w-0 flex-col gap-1"><span className="type-label">Marcador</span>
        <ScientificViews views={(["16S", "COI"] as const).map(value => ({ value, label: organismMarkerLabels[value] }))} selected={marker} onChange={changeMarker} /></div>
      <div className="flex min-w-0 flex-col gap-1"><span className="type-label">Nível</span>
        <ScientificViews views={ORGANISM_LEVELS[marker].map(value => ({ value, label: organismLevelLabels[value] }))} selected={level} onChange={value => { setLevel(value as OrganismLevel); setOnlyEffects(false); reset(); }} /></div>
      {!risk && <label className="type-label flex min-w-[12rem] flex-1 flex-col gap-1">Pesquisar
        <input type="search" className={`${scientificControl} w-full`} value={query} placeholder={exotic ? "Nome da espécie" : `Nome ${level === "genero" ? "do gênero" : "da família"}`} onChange={event => { setQuery(event.target.value); reset(); }} /></label>}
      {!risk && !exotic && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={onlyEffects} onChange={event => { setOnlyEffects(event.target.checked); reset(); }} />Só com efeito no índice</label>}
      {hasUnresolved && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={unresolved} onChange={event => { setUnresolved(event.target.checked); reset(); }} />Incluir reads sem {level === "genero" ? "gênero" : "família"}</label>}
    </div>
    {error ? <p role="alert" className="app-card p-4">{error}</p> : !data || !info ? <div className="app-card h-64 animate-pulse bg-[var(--surface-soft)]" role="status" aria-label="Carregando organismos" /> : <>
      <p role="status" className="type-metadata">
        {count(filtered.length)} {unit[level][filtered.length === 1 ? 0 : 1]} · {count(info.usablePoints)} {info.usablePoints === 1 ? "ponto" : "pontos"} com {marker}
        {info.runs.length > 1 || campaign === 3 ? ` · ${info.runs.join(" e ")}` : ""}
        {info.inconclusive.length > 0 && marker === "COI" ? ` · ${info.inconclusive.length} ${info.inconclusive.length === 1 ? "biblioteca inconclusiva" : "bibliotecas inconclusivas"}` : ""}
      </p>
      <div className="overflow-x-auto rounded border border-[var(--line-ghost)]" role="region" aria-label="Organismos detectados: tabela com rolagem horizontal" tabIndex={0}>
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-soft)]"><tr>
            <th scope="col" className="px-3 py-3">{risk ? "Grupo de risco" : exotic ? "Espécie" : level === "genero" ? "Gênero" : "Família"}</th>
            {exotic && <th scope="col" className="px-3 py-3">Situação</th>}
            <th scope="col" className="px-3 py-3 text-right">Pontos</th>
            <th scope="col" className="px-3 py-3 text-right">Reads</th>
            <th scope="col" className="px-3 py-3 text-right">Maior participação</th>
            {!risk && <th scope="col" className="px-3 py-3">Efeito no índice</th>}
            <th scope="col" className="px-3 py-3"><span className="sr-only">Onde ocorre</span></th>
          </tr></thead>
          <tbody>{rows.map(row => {
            const expanded = open === row.name;
            const occurrences = expanded && detail?.key === detailKey ? detail : undefined;
            return <Fragment key={row.name}>
              <tr className="border-t border-[var(--line-ghost)] hover:bg-[var(--surface-soft)]">
                <th scope="row" className="px-3 py-2 font-semibold text-[var(--brand-navy-strong)]">
                  {exotic || (!risk && !row.unresolved) ? <em>{row.name}</em> : row.name}
                  {row.unresolved && <span className="ml-2 font-normal not-italic text-[var(--ink-soft)]">não resolvido neste nível</span>}
                </th>
                {exotic && <td className="px-3 py-2">{row.category ? exoticCategoryLabels[row.category] : ""}</td>}
                <td className="px-3 py-2 text-right tabular-nums">
                  <SiaPeek title={`C${campaign} · ${row.name}`} campaign={campaign} expected={row.points} className="rounded px-1 font-semibold underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]"
                    points={row.sias.map(sia => ({ sia, value: null, place: placeOf.get(sia) ?? null }))}>{count(row.points)}</SiaPeek>
                  <span className="text-[var(--ink-soft)]"> de {count(info.points)}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{count(row.reads)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCaptureShare(row.maxShare)} <span className="text-[var(--ink-soft)]">no SIA {row.maxShareSia}</span></td>
                {!risk && <td className="px-3 py-2">{row.effects.length ? <span className="flex flex-wrap gap-1">{row.effects.map(effect =>
                  <Link key={effect.id} href={`/resultados/impactos?q=${encodeURIComponent(row.name.split(" ")[0])}`} className="rounded-full border border-[var(--brand-teal)] px-2 py-0.5 text-xs font-semibold text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)]">{domainShort[effect.domain] ?? effect.domain}</Link>)}</span>
                  : <span className="text-[var(--ink-soft)]">—</span>}</td>}
                <td className="px-3 py-1 text-right"><button type="button" className={`${scientificControl} whitespace-nowrap`} aria-expanded={expanded} onClick={() => setOpen(expanded ? null : row.name)}>{expanded ? "Fechar" : "Onde ocorre"}</button></td>
              </tr>
              {expanded && <tr className="border-t border-[var(--line-ghost)] bg-[var(--surface-soft)]"><td colSpan={columns} className="px-3 py-3">
                {occurrences?.error ? <p role="alert">Não foi possível carregar os pontos deste organismo.</p> : !occurrences?.data ? <p role="status">Carregando pontos…</p> :
                  <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">{occurrences.data.rows.map(item => <li key={item.sia} className="flex items-baseline justify-between gap-3 border-b border-[var(--line-ghost)] py-1">
                    <Link className="min-w-0 truncate font-semibold text-[var(--brand-navy-strong)] underline-offset-4 hover:underline" href={`/campanhas/resultados?vista=ponto&campaign=${campaign}&sia=${encodeURIComponent(item.sia)}`}>SIA {item.sia}{placeOf.get(item.sia) ? <span className="ml-2 font-normal text-[var(--ink-soft)]">{placeOf.get(item.sia)}</span> : null}</Link>
                    <span className="shrink-0 tabular-nums">{count(item.reads)} reads · {formatCaptureShare(item.share)}{item.inconclusive ? " · inconclusiva" : ""}</span>
                  </li>)}</ul>}
              </td></tr>}
            </Fragment>;
          })}</tbody>
        </table>
      </div>
      {!filtered.length && <p role="status">Nenhum organismo corresponde à pesquisa nesta campanha.</p>}
      {pages > 1 && <nav aria-label="Páginas dos organismos" className="flex items-center justify-between gap-2">
        <button type="button" className={scientificControl} disabled={current === 0} onClick={() => { setPage(current - 1); setOpen(null); }}>Anterior</button>
        <span className="type-metadata">Página {current + 1} de {pages}</span>
        <button type="button" className={scientificControl} disabled={current >= pages - 1} onClick={() => { setPage(current + 1); setOpen(null); }}>Próxima</button>
      </nav>}
    </>}
  </section>;
}
