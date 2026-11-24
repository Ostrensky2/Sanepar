"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { scientificControl } from "./scientific-query-controls";

/** Ficha do cadastro, já com o tipo de efeito do quadro de Resultados quando ela pertence a um. */
export type CatalogFicha = { id: string; taxon: string; level: string; domain: string; severity: number | null; applicability: number | null; contested: boolean;
  source: string; rationale: string; scores: boolean; note: string | null; used: boolean; theme: string | null; effect: { id: string; title: string } | null };

const PAGE = 50;
const levelLabels: Record<string, string> = { genus: "gênero", family: "família", clade: "grupo", species: "espécie exótica" };
const domainLabels: Record<string, string> = { Ambiental: "Ambiental", Operacional: "Operacional", "Saúde humana": "Saúde" };
const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function applicability(ficha: CatalogFicha) {
  if (!ficha.scores) return "não pontua";
  const value = ficha.applicability;
  return value === 1 ? "todo o táxon (1)" : value === 0.5 ? "parte substancial (0,5)" : value === 0.1 ? "minoria (0,1)" : "sem efeito sustentado (0)";
}

/** Catálogo de impactos: o cadastro completo de fichas de efeito, a base das notas. Organismos em gênero, família ou grupo; espécie só para exóticas. */
export function EffectsCatalog({ fichas, initialQuery = "" }: { fichas: CatalogFicha[]; initialQuery?: string }) {
  const [domain, setDomain] = useState("");
  const [status, setStatus] = useState<"" | "pontua" | "registrada">("");
  const [onlyUsed, setOnlyUsed] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(0);
  const counts = useMemo(() => ({ total: fichas.length, organisms: new Set(fichas.map(ficha => ficha.taxon)).size, used: fichas.filter(ficha => ficha.used).length,
    scoring: fichas.filter(ficha => ficha.scores).length }), [fichas]);
  const filtered = useMemo(() => {
    const term = normalize(query.trim());
    const found = fichas.filter(ficha => (!domain || ficha.domain === domain) && (!status || (status === "pontua") === ficha.scores) && (!onlyUsed || ficha.used)
      && (!term || normalize(`${ficha.taxon} ${ficha.theme ?? ""} ${ficha.effect?.title ?? ""} ${ficha.rationale}`).includes(term)));
    // Na busca, primeiro as fichas do próprio organismo; depois as que só o citam na justificativa.
    return term ? [...found.filter(ficha => normalize(ficha.taxon).includes(term)), ...found.filter(ficha => !normalize(ficha.taxon).includes(term))] : found;
  }, [fichas, domain, status, onlyUsed, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE)), current = Math.min(page, pages - 1);
  const rows = filtered.slice(current * PAGE, current * PAGE + PAGE);
  const change = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setPage(0); };

  return <div className="min-w-0 space-y-4">
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {([["Fichas no cadastro", counts.total], ["Organismos", counts.organisms], ["Entram na nota", counts.scoring], ["Usadas nas campanhas", counts.used]] as const).map(([label, value]) =>
        <div key={label} className="app-card p-3"><dt className="type-metadata text-[var(--ink-soft)]">{label}</dt><dd className="heading-font text-2xl font-bold tabular-nums text-[var(--brand-navy-strong)]">{value.toLocaleString("pt-BR")}</dd></div>)}
    </dl>
    <div className="app-card flex flex-wrap items-end gap-3 p-3">
      <label className="type-label flex min-w-[12rem] flex-1 flex-col gap-1">Pesquisar
        <input type="search" className={`${scientificControl} w-full`} value={query} placeholder="Organismo, efeito ou termo da justificativa" onChange={event => change(setQuery)(event.target.value)} /></label>
      <label className="type-label flex flex-col gap-1">Categoria
        <select className={scientificControl} value={domain} onChange={event => change(setDomain)(event.target.value)}>
          <option value="">Todas</option>{Object.entries(domainLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="type-label flex flex-col gap-1">Situação
        <select className={scientificControl} value={status} onChange={event => change(setStatus)(event.target.value as "" | "pontua" | "registrada")}>
          <option value="">Todas</option><option value="pontua">Entram na nota</option><option value="registrada">Registradas, sem nota</option></select></label>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={onlyUsed} onChange={event => change(setOnlyUsed)(event.target.checked)} />Só as usadas nas campanhas</label>
    </div>
    <p role="status" className="type-metadata">{filtered.length.toLocaleString("pt-BR")} {filtered.length === 1 ? "ficha" : "fichas"}</p>
    <div className="overflow-x-auto rounded border border-[var(--line-ghost)]" role="region" aria-label="Catálogo de fichas: tabela com rolagem horizontal" tabIndex={0}>
      <table className="w-full text-left text-sm">
        <thead className="bg-[var(--surface-soft)]"><tr>
          <th scope="col" className="px-3 py-3">Organismo</th>
          <th scope="col" className="px-3 py-3">Categoria</th>
          <th scope="col" className="px-3 py-3">Efeito</th>
          <th scope="col" className="px-3 py-3 text-right">Gravidade</th>
          <th scope="col" className="px-3 py-3">Aplicabilidade</th>
          <th scope="col" className="px-3 py-3">Fonte</th>
        </tr></thead>
        <tbody>{rows.map(ficha => {
          const href = /^https:\/\/[^\s;]+$/.test(ficha.source) ? ficha.source : null;
          return <tr key={ficha.id} id={`ficha-${ficha.id}`} className="scroll-mt-24 border-t border-[var(--line-ghost)] align-top target:bg-[var(--surface-soft)]">
            <th scope="row" className="px-3 py-2 font-semibold text-[var(--brand-navy-strong)]"><em>{ficha.taxon}</em>
              <span className="block text-xs font-normal not-italic text-[var(--ink-soft)]">{levelLabels[ficha.level] ?? ficha.level}{ficha.used ? " · nas campanhas" : ""}</span></th>
            <td className="px-3 py-2">{domainLabels[ficha.domain] ?? ficha.domain}</td>
            <td className="max-w-[30rem] px-3 py-2">
              {ficha.effect ? <Link className="font-semibold underline underline-offset-4" href={`/campanhas/resultados?vista=efeitos&effect=${ficha.effect.id}`}>{ficha.effect.title}</Link> : ficha.theme ? <span className="font-semibold">{ficha.theme}</span> : null}
              <details className="mt-1"><summary className="min-h-11 cursor-pointer content-center text-[var(--ink-soft)]">Justificativa</summary><p className="break-words pb-2">{ficha.rationale}</p></details>
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{ficha.severity ?? "—"}</td>
            <td className="px-3 py-2">{applicability(ficha)}{!ficha.scores && ficha.note ? <span className="mt-1 block text-xs text-[var(--ink-soft)]">{ficha.note}</span> : null}</td>
            <td className="max-w-[14rem] px-3 py-2">{href ? <a className="break-all underline underline-offset-4" href={href} target="_blank" rel="noreferrer">{href.replace(/^https?:\/\/(doi\.org\/|pubmed\.ncbi\.nlm\.nih\.gov\/)?/, "")}</a> : <span className="break-words">{ficha.source || "—"}</span>}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {!filtered.length && <p role="status">Nenhuma ficha corresponde aos filtros.</p>}
    {pages > 1 && <nav aria-label="Páginas do catálogo" className="flex items-center justify-between gap-2">
      <button type="button" className={scientificControl} disabled={current === 0} onClick={() => setPage(current - 1)}>Anterior</button>
      <span className="type-metadata">Página {current + 1} de {pages}</span>
      <button type="button" className={scientificControl} disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Próxima</button>
    </nav>}
  </div>;
}
