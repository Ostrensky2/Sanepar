"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpenText, ExternalLink, Search } from "lucide-react";
import { ResultsReviewDialog } from "@/components/results-review-dialog";
import { effectTypeOf, effectTypes, type EffectTypeId } from "./ficha-effect-types";
import styles from "./campaign-distribution.module.css";

/** Ficha do cadastro, já com o tipo de efeito do quadro de Resultados quando ela pertence a um. */
export type CatalogFicha = { id: string; taxon: string; level: string; domain: string; code: string; severity: number | null; applicability: number | null; contested: boolean;
  source: string; rationale: string; scores: boolean; note: string | null; used: boolean; theme: string | null; effect: { id: string; title: string } | null };

const levelLabels: Record<string, string> = { genus: "gênero", family: "família", clade: "grupo", species: "espécie exótica" };
/** Nível das fichas de conhecimento (antigo Acervo científico), que também trazem espécies nativas, comunidades e grupos ecológicos. */
const knowledgeLevels: Record<string, string> = { genus: "gênero", family: "família", species: "espécie", linhagem: "linhagem", comunidade: "comunidade", "grupo ecológico": "grupo ecológico" };
/** Ficha de conhecimento sobre o organismo: o que a literatura registra sobre ele (não é efeito e não entra na nota). */
type KnowledgeCard = { id: string; taxon: string; rank: string; topic: string; finding: string; limits: string; sourceIds: string[] };
type KnowledgeLibrary = { cards: KnowledgeCard[]; sources: { id: string; citation: string; url: string }[] };
const NO_EFFECT = "sem-efeito";
/** As três categorias do índice, na ordem e nas cores usadas nos gráficos do Início. */
const domains = [
  { key: "Ambiental", label: "Ambiental", color: "#eb6834" },
  { key: "Operacional", label: "Operacional", color: "#1baf7a" },
  { key: "Saúde humana", label: "Saúde", color: "#eda100" },
] as const;
const domainOf = (key: string) => domains.find(domain => domain.key === key);
const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });
const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const severityLabels = ["", "1 de 3 · leve", "2 de 3 · moderada", "3 de 3 · grave"];
function applicability(ficha: CatalogFicha) {
  if (!ficha.scores) return "não pontua";
  const value = ficha.applicability;
  return value === 1 ? "1 · todo o grupo carrega o efeito" : value === 0.5 ? "0,5 · parte grande do grupo" : value === 0.1 ? "0,1 · só uma minoria do grupo" : "0 · sem efeito sustentado";
}

type Source = { label: string; href: string | null };
/** Fontes da ficha: o endereço principal e as citadas na descrição (PMID, DOI ou URL), sem repetir. */
export function fichaSources(ficha: Pick<CatalogFicha, "source" | "rationale">): Source[] {
  const cited = ficha.rationale.match(/Fontes: (.*?)(?:\. Revisão bibliográfica|\.?$)/)?.[1] ?? "";
  const seen = new Set<string>(), sources: Source[] = [];
  for (const raw of [...ficha.source.split(/;\s*/), ...cited.split(/;\s*/)]) {
    const text = raw.trim().replace(/\.$/, "");
    if (!text || /^não informadas?$/i.test(text)) continue;
    const pmid = text.match(/^PMID:\s*(\d+)$/i)?.[1] ?? text.match(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)\/?$/)?.[1];
    const doi = text.match(/^DOI:\s*(10\.\S+)$/i)?.[1] ?? text.match(/^https:\/\/doi\.org\/(10\.\S+)$/)?.[1];
    const url = text.replace(/^URL:\s*/i, "");
    const source: Source = pmid ? { label: `PubMed ${pmid}`, href: `https://pubmed.ncbi.nlm.nih.gov/${pmid}` }
      : doi ? { label: `DOI ${doi}`, href: `https://doi.org/${doi}` }
      : /^https:\/\/[^\s]+$/.test(url) ? { label: url.replace(/^https:\/\/(www\.)?/, ""), href: url }
      : { label: text, href: null };
    const key = source.href ?? source.label;
    if (!seen.has(key)) { seen.add(key); sources.push(source); }
  }
  return sources;
}
/** Descrição da ficha sem a lista de fontes, que aparece à parte como links. */
const description = (rationale: string) => rationale.replace(/\s*Fontes: .*?(?=\. Revisão bibliográfica|\.?$)\.?/, "").trim();

type Organism = { taxon: string; level: string; fichas: CatalogFicha[]; cards: KnowledgeCard[] };

/**
 * Catálogo de impactos: o cadastro de fichas de efeito, a base das notas do índice.
 * Escolhe-se a categoria e o tipo de efeito; os organismos ligados aparecem em quadrinhos iguais, em ordem alfabética.
 * O clique abre as fichas do organismo, com gravidade, aplicabilidade, descrição e fontes.
 */
export function EffectsCatalog({ fichas, initialQuery = "" }: { fichas: CatalogFicha[]; initialQuery?: string }) {
  const [domain, setDomain] = useState("");
  const [type, setType] = useState<EffectTypeId | typeof NO_EFFECT | "">("");
  // Fichas de conhecimento (o antigo Acervo científico). Quem não tem acesso a elas vê só as fichas de efeito.
  const [library, setLibrary] = useState<KnowledgeLibrary>();
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/results/curation/library", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(response => (response.ok ? response.json() : null))
      .then((payload: KnowledgeLibrary | null) => { if (payload && !controller.signal.aborted) setLibrary(payload); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  // Cada ficha de conhecimento vai para o organismo de mesmo nome; a de uma espécie vai para o gênero, quando o gênero tem ficha de efeito.
  const knowledge = useMemo(() => {
    const names = new Set(fichas.map(ficha => ficha.taxon)), groups = new Map<string, KnowledgeCard[]>();
    for (const card of library?.cards ?? []) {
      const genus = card.taxon.split(" ")[0];
      const key = names.has(card.taxon) ? card.taxon : names.has(genus) ? genus : card.taxon;
      groups.set(key, [...(groups.get(key) ?? []), card]);
    }
    return groups;
  }, [fichas, library]);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<"" | "pontua" | "registrada">("");
  const [onlyUsed, setOnlyUsed] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);

  const typed = useMemo(() => fichas.map(ficha => ({ ficha, type: effectTypeOf(ficha.code, ficha.domain) })), [fichas]);
  // Filtros que valem para tudo, antes de escolher o tipo de efeito: é sobre este conjunto que os efeitos são contados.
  const base = useMemo(() => {
    const term = normalize(query.trim());
    return typed.filter(({ ficha }) => (!domain || ficha.domain === domain) && (!status || (status === "pontua") === ficha.scores) && (!onlyUsed || ficha.used) && (!term || normalize(ficha.taxon).includes(term)));
  }, [typed, domain, status, onlyUsed, query]);
  const typeOptions = useMemo(() => {
    const organisms = new Map<EffectTypeId, Set<string>>();
    for (const item of base) (organisms.get(item.type) ?? organisms.set(item.type, new Set()).get(item.type)!).add(item.ficha.taxon);
    return (Object.keys(effectTypes) as EffectTypeId[]).filter(id => organisms.has(id)).map(id => ({ id, label: effectTypes[id], count: organisms.get(id)!.size }))
      .sort((a, b) => collator.compare(a.label, b.label));
  }, [base]);
  // Organismos que só têm ficha de conhecimento: aparecem quando nenhum filtro de efeito está em uso.
  const knowledgeOnly = useMemo(() => {
    if (domain || status || onlyUsed) return [];
    const names = new Set(fichas.map(ficha => ficha.taxon)), term = normalize(query.trim());
    return [...knowledge.entries()].filter(([taxon]) => !names.has(taxon) && (!term || normalize(taxon).includes(term)))
      .map(([taxon, cards]): Organism => ({ taxon, level: knowledgeLevels[cards[0].rank] ?? cards[0].rank, fichas: [], cards }));
  }, [knowledge, fichas, domain, status, onlyUsed, query]);
  const activeType = type === NO_EFFECT ? (knowledgeOnly.length ? NO_EFFECT : "") : type && typeOptions.some(option => option.id === type) ? type : "";
  const organisms = useMemo(() => {
    const groups = new Map<string, Organism>();
    for (const { ficha, type: fichaType } of base) {
      if (activeType && fichaType !== activeType) continue;
      const group = groups.get(ficha.taxon) ?? { taxon: ficha.taxon, level: levelLabels[ficha.level] ?? ficha.level, fichas: [], cards: knowledge.get(ficha.taxon) ?? [] };
      group.fichas.push(ficha); groups.set(ficha.taxon, group);
    }
    const withEffect = activeType === NO_EFFECT ? [] : [...groups.values()];
    return [...withEffect, ...(activeType && activeType !== NO_EFFECT ? [] : knowledgeOnly)].sort((a, b) => collator.compare(a.taxon, b.taxon));
  }, [base, activeType, knowledge, knowledgeOnly]);
  const all = useMemo(() => new Set(base.map(item => item.ficha.taxon)).size + knowledgeOnly.length, [base, knowledgeOnly]);
  // Na ficha aberta, primeiro o que corresponde ao filtro escolhido; depois as outras fichas do mesmo organismo.
  const matches = (ficha: CatalogFicha) => (!domain || ficha.domain === domain) && (!activeType || effectTypeOf(ficha.code, ficha.domain) === activeType) ? 0 : 1;
  const openedCards = opened ? knowledge.get(opened) ?? [] : [];
  const openedFichas = opened ? fichas.filter(ficha => ficha.taxon === opened).sort((a, b) => matches(a) - matches(b) || domains.findIndex(d => d.key === a.domain) - domains.findIndex(d => d.key === b.domain)) : [];
  // A janela abre com o foco no botão de fechar, que fica no fim: volta ao começo para a ficha ser lida do início.
  useEffect(() => {
    if (!opened) return;
    const frame = requestAnimationFrame(() => document.querySelectorAll("dialog[open], dialog[open] *").forEach(node => { if (node.scrollTop) node.scrollTop = 0; }));
    return () => cancelAnimationFrame(frame);
  }, [opened]);
  const extras = (status ? 1 : 0) + (onlyUsed ? 1 : 0) + (query.trim() ? 1 : 0);
  const chip = (active: boolean) => `inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)] ${active ? "border-[var(--brand-navy-strong)] bg-[var(--brand-navy-strong)] text-white" : "border-[var(--line-strong)] bg-white text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)]"}`;

  return <div className="min-w-0 space-y-4">
    <section className="app-card space-y-4 p-4 sm:p-5" aria-label="Filtros do catálogo">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="type-label w-28 shrink-0 text-[var(--ink-soft)]">Categoria</span>
        <div role="group" aria-label="Categoria" className={styles.segmented}>
          <button type="button" aria-pressed={!domain} onClick={() => setDomain("")}>Todas</button>
          {domains.map(item => <button type="button" key={item.key} aria-pressed={domain === item.key} onClick={() => setDomain(item.key)}>
            <span aria-hidden className="mr-1.5 inline-block size-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</button>)}
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <span className="type-label w-28 shrink-0 pt-2.5 text-[var(--ink-soft)]">Tipo de efeito</span>
        <div role="group" aria-label="Tipo de efeito" className="flex min-w-0 flex-1 flex-wrap gap-2">
          <button type="button" aria-pressed={!activeType} className={chip(!activeType)} onClick={() => setType("")}>Todos <span className="font-normal opacity-80">{all}</span></button>
          {typeOptions.map(option => <button type="button" key={option.id} aria-pressed={activeType === option.id} className={chip(activeType === option.id)} onClick={() => setType(option.id)}>
            {option.label} <span className="font-normal opacity-80">{option.count}</span></button>)}
          {knowledgeOnly.length > 0 && <button type="button" aria-pressed={activeType === NO_EFFECT} className={chip(activeType === NO_EFFECT)} onClick={() => setType(NO_EFFECT)}>
            Sem efeito registrado <span className="font-normal opacity-80">{knowledgeOnly.length}</span></button>}
        </div>
      </div>
      <details className="disclosure" open={Boolean(initialQuery) || undefined}>
        <summary className="inline-flex min-h-11 cursor-pointer items-center type-metadata font-semibold text-[var(--ink-soft)]">Mais filtros e busca por nome{extras ? ` (${extras} em uso)` : ""}</summary>
        <div className="flex flex-wrap items-end gap-3 pt-1">
          <label className="type-label flex min-w-[12rem] flex-col gap-1">Nome do organismo
            <span className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-3"><Search aria-hidden className="size-4 text-[var(--ink-soft)]" />
              <input type="search" className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} placeholder="Ex.: Microcystis" onChange={event => setQuery(event.target.value)} /></span></label>
          <label className="type-label flex flex-col gap-1">Situação
            <select className="min-h-11 rounded-lg border border-[var(--line-strong)] bg-white px-3 text-sm" value={status} onChange={event => setStatus(event.target.value as "" | "pontua" | "registrada")}>
              <option value="">Todas</option><option value="pontua">Entram na nota</option><option value="registrada">Registradas, sem nota</option></select></label>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={onlyUsed} onChange={event => setOnlyUsed(event.target.checked)} />Só os detectados nas campanhas</label>
          {extras > 0 && <button type="button" className="min-h-11 rounded-lg border border-[var(--line-strong)] bg-white px-3 text-sm font-semibold text-[var(--brand-navy-strong)]" onClick={() => { setQuery(""); setStatus(""); setOnlyUsed(false); }}>Limpar</button>}
        </div>
      </details>
    </section>

    <p role="status" className="type-metadata">
      <strong className="text-[var(--ink)]">{organisms.length.toLocaleString("pt-BR")} {organisms.length === 1 ? "organismo" : "organismos"}</strong>
      {activeType === NO_EFFECT ? " sem efeito registrado, só com o que se sabe sobre eles" : activeType ? ` com efeito de ${effectTypes[activeType].toLocaleLowerCase("pt-BR")}` : ""}{domain ? ` na categoria ${domainOf(domain)?.label}` : ""}, em ordem alfabética. Clique em um quadrinho para abrir a ficha.
    </p>

    <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6" aria-label="Organismos do catálogo">
      {organisms.map(organism => {
        const shown = domains.filter(item => organism.fichas.some(ficha => ficha.domain === item.key));
        return <li key={organism.taxon}>
          <button type="button" aria-haspopup="dialog" onClick={() => setOpened(organism.taxon)}
            className="flex h-[5.5rem] w-full flex-col justify-between rounded-xl border border-[var(--line-ghost)] bg-white p-3 text-left shadow-sm transition hover:border-[var(--brand-teal)] hover:shadow focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]">
            <em className="line-clamp-2 min-h-0 break-words font-semibold leading-snug text-[var(--brand-navy-strong)]">{organism.taxon}</em>
            <span className="flex items-center justify-between gap-2 text-xs text-[var(--ink-soft)]">
              <span className="min-w-0 truncate">{organism.level}{organism.fichas.length > 1 ? ` · ${organism.fichas.length} fichas` : ""}{!organism.fichas.length ? " · sem efeito" : ""}</span>
              <span className="flex shrink-0 items-center gap-1" aria-label={[shown.length ? `Categorias: ${shown.map(item => item.label).join(", ")}` : "", organism.cards.length ? "tem ficha de conhecimento" : ""].filter(Boolean).join("; ")}>
                {organism.cards.length > 0 && <span title="Tem o que se sabe sobre o organismo"><BookOpenText aria-hidden className="size-3.5 text-[var(--brand-teal)]" /></span>}
                {shown.map(item => <span key={item.key} aria-hidden title={item.label} className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />)}</span>
            </span>
          </button>
        </li>;
      })}
    </ul>
    {!organisms.length && <p role="status" className="app-card p-4">Nenhum organismo corresponde aos filtros.</p>}

    {opened && <ResultsReviewDialog title={opened} closeLabel="Fechar ficha" onClose={() => setOpened(null)}>
      <p className="type-metadata text-[var(--ink-soft)]">{[openedFichas.length ? levelLabels[openedFichas[0].level] ?? "" : knowledgeLevels[openedCards[0]?.rank] ?? openedCards[0]?.rank ?? "",
        openedFichas.length ? `${openedFichas.length} ${openedFichas.length === 1 ? "ficha de efeito" : "fichas de efeito"}` : "sem efeito registrado: não entra na nota",
        openedFichas.some(ficha => ficha.used) ? "detectado nas campanhas" : ""].filter(Boolean).join(" · ")}</p>
      <div className="mt-3 space-y-4">
        {openedFichas.map(ficha => {
          const item = domainOf(ficha.domain), sources = fichaSources(ficha), fichaType = effectTypeOf(ficha.code, ficha.domain);
          return <article key={ficha.id} id={`ficha-${ficha.id}`} className="space-y-3 rounded-xl border border-[var(--line-ghost)] p-4">
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-soft)] px-2.5 py-0.5 text-sm font-semibold text-[var(--ink)]"><span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: item?.color }} />{item?.label ?? ficha.domain}</span>
              <h3 className="heading-font type-panel-title text-[var(--brand-navy-strong)]">{effectTypes[fichaType]}</h3>
            </header>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-3">
              <div><dt className="type-caption text-[var(--ink-soft)]">Gravidade</dt><dd className="font-semibold">{ficha.severity ? severityLabels[ficha.severity] ?? ficha.severity : "—"}</dd></div>
              <div><dt className="type-caption text-[var(--ink-soft)]">Aplicabilidade</dt><dd className="font-semibold">{applicability(ficha)}</dd></div>
              <div><dt className="type-caption text-[var(--ink-soft)]">Situação</dt><dd className="font-semibold">{ficha.scores ? "Entra na nota" : `Registrada, sem nota${ficha.note ? `: ${ficha.note}` : ""}`}</dd></div>
            </dl>
            <div><h4 className="type-caption text-[var(--ink-soft)]">Descrição</h4><p className="break-words">{description(ficha.rationale)}</p></div>
            <div><h4 className="type-caption text-[var(--ink-soft)]">{sources.length === 1 ? "Fonte" : "Fontes"}</h4>
              {sources.length ? <ul className="mt-1 flex flex-wrap gap-2">{sources.map(source => <li key={source.href ?? source.label}>
                {source.href ? <a className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-white px-2.5 text-sm font-semibold text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)]" href={source.href} target="_blank" rel="noreferrer"><span className="break-all">{source.label}</span><ExternalLink aria-hidden className="size-3.5 shrink-0" /></a> : <span className="text-sm">{source.label}</span>}
              </li>)}</ul> : <p className="text-sm">Não informada.</p>}
            </div>
            {ficha.effect && <p className="type-metadata"><Link className="font-semibold underline underline-offset-4" href={`/campanhas/resultados?vista=efeitos&effect=${ficha.effect.id}`}>Ver “{ficha.effect.title}” nos resultados das campanhas</Link></p>}
          </article>;
        })}
        {openedCards.length > 0 && <section aria-labelledby="conhecimento-titulo" className="space-y-3 rounded-xl border border-[var(--brand-teal)] p-4">
          <header>
            <h3 id="conhecimento-titulo" className="heading-font type-panel-title flex items-center gap-2 text-[var(--brand-navy-strong)]"><BookOpenText aria-hidden className="size-5 text-[var(--brand-teal)]" />O que se sabe sobre o organismo</h3>
            <p className="type-caption text-[var(--ink-soft)]">Registros da literatura sobre o organismo em si: onde ocorre, como se comporta e como é identificado. Não descrevem dano e não entram na nota.</p>
          </header>
          {openedCards.map(card => <article key={card.id} className="space-y-2 border-t border-[var(--line-ghost)] pt-3 first-of-type:border-0 first-of-type:pt-0">
            <h4 className="font-bold text-[var(--ink)]">{card.topic}{card.taxon !== opened ? <span className="font-normal text-[var(--ink-soft)]"> · <em>{card.taxon}</em></span> : null}</h4>
            <div><h5 className="type-caption text-[var(--ink-soft)]">Achado documentado</h5><p className="break-words">{card.finding}</p></div>
            <div><h5 className="type-caption text-[var(--ink-soft)]">Limites de interpretação</h5><p className="break-words">{card.limits}</p></div>
            <ul className="flex flex-wrap gap-2">{card.sourceIds.map(id => {
              const source = library?.sources.find(item => item.id === id);
              return <li key={id}>{source && /^https:\/\//i.test(source.url)
                ? <a className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-white px-2.5 py-1 text-sm font-semibold text-[var(--brand-navy-strong)] hover:bg-[var(--surface-soft)]" href={source.url} target="_blank" rel="noreferrer"><span className="break-words">{source.citation}</span><ExternalLink aria-hidden className="size-3.5 shrink-0" /></a>
                : <span className="text-sm">{source?.citation ?? "Referência indisponível"}</span>}</li>;
            })}</ul>
          </article>)}
        </section>}
      </div>
    </ResultsReviewDialog>}
  </div>;
}
