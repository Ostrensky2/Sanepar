"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ResultsReviewDialog } from "@/components/results-review-dialog";
import { formatNumber, formatProportionAsPercent } from "@/lib/number-format";
import type { ResultsInventoryItem, ResultsInventoryResponse } from "@/lib/results-publication-contract";
import { RESULTS_RESEARCH_SECTIONS, type ResearchRow, type ResearchValue, type ResultsResearchResponse, type ResultsResearchSection } from "@/lib/results-research-contract";
import { ScientificActiveFilters, ScientificMultiFilter, ScientificRecordDetail, ScientificSourceLinks, ScientificViews, scientificControl } from "./scientific-query-controls";
import { formatResultIndex } from "../format-index";
import { hasAvailableResultsSource, sameSourceHash } from "../presentation";
import { isHiddenVersionField, mentionsInternalVersion } from "../hidden-fields";
import { buildResearchReport, researchRecordLabel, researchSelectionIdentity, researchUnit } from "../report-snapshot";
import { ReportActions } from "./report-actions";
import { ResearchMethod } from "./research-method";
import { IndexBar } from "./campaign-story";
import { resultDetailHref } from "./results-index-dashboard";

const labels: Record<ResultsResearchSection, string> = { impacts: "Efeitos descritos", occurrences: "Onde ocorrem", references: "Referências", calculations: "Valores por ponto", method: "Passo a passo" };
/** Filtros sempre visíveis por visão; os demais ficam em "Mais filtros". */
const PRIMARY_FACETS: Record<ResultsResearchSection, string[]> = {
  impacts: ["domain", "effectCode", "score", "evidenceType", "analyticalGroups", "municipality"],
  occurrences: ["sia", "municipality", "set", "domain", "score"],
  references: ["domain", "effectCode", "score"],
  calculations: ["sia", "set", "analyticalStatus"],
  method: [],
};

export function researchValueText(value: ResearchValue | undefined): string {
  return value === null || value === undefined || value === "" ? "Não informado na fonte" : Array.isArray(value) ? value.join("; ") : typeof value === "boolean" ? value ? "Sim" : "Não" : typeof value === "number" ? formatNumber(value) : String(value);
}
export function researchFieldText(key: string, value: ResearchValue | undefined) {
  if (key === "included" && (value === 0 || value === 1 || value === "0" || value === "1")) return Number(value) === 1 ? "Sim" : "Não";
  if (/^(environmental|operational|humanHealth)(Calculated|Used)$/.test(key)) return formatResultIndex(value, "Não informado na fonte");
  if ((key === "proportion" || /Coverage$/.test(key)) && typeof value === "number") return formatProportionAsPercent(value);
  return researchValueText(value);
}
/** Índices 0–1 ganham a barra na escala de cor do mapa; o resto é texto. */
function researchCell(key: string, value: ResearchValue | undefined): ReactNode {
  if (/^(environmental|operational|humanHealth)(Calculated|Used)$/.test(key) && typeof value === "number" && Number.isFinite(value)) return <IndexBar value={value} />;
  if (key === "detection") return value === "Não detectado" ? <span className="text-[var(--ink-soft)]">Só no catálogo</span> : <strong className="whitespace-nowrap font-semibold text-[var(--brand-navy-strong)]">{researchValueText(value)}</strong>;
  return researchFieldText(key, value);
}
/** Resumo da consulta: só mostra contagens diferentes de zero. */
export function researchCountsText(counts: { filtered: number; population: number; organisms: number }) {
  const format = (value: number) => value.toLocaleString("pt-BR");
  const parts = [counts.filtered === counts.population ? `${format(counts.population)} registros` : `${format(counts.filtered)} de ${format(counts.population)} registros`];
  if (counts.organisms) parts.push(`${format(counts.organisms)} organismos`);
  return `${parts.join(" · ")}.`;
}
/** Rótulo da campanha para o usuário; data, arquivo e identificadores ficam no detalhe de cada registro. */
export function publicationOptionLabel(item: Pick<ResultsInventoryItem, "canonicalName">) {
  return item.canonicalName;
}
/** Oculta versões internas e colunas "calculado" idênticas às "utilizado" em todas as linhas exibidas. */
export function visibleResearchColumns(columns: { key: string; label: string }[], rows: ResearchRow[]) {
  return columns.filter((column) => {
    if (isHiddenVersionField(column.key) || isHiddenVersionField(column.label)) return false;
    const used = column.key.replace(/Calculated$/, "Used");
    if (used === column.key || !columns.some((item) => item.key === used)) return true;
    return rows.some((row) => researchFieldText(column.key, row.values[column.key]) !== researchFieldText(used, row.values[used]));
  });
}
export function researchQuery(source: ResultsInventoryItem, section: ResultsResearchSection, filters: Record<string, string[]>, query: string, offset: number) {
  if (!hasAvailableResultsSource(source) || !source.source.sha256) return null;
  const params = new URLSearchParams({ campaignCode: source.campaignCode, publicationId: source.publicationId, sourceHash: source.source.sha256, section, offset: String(offset), limit: "25" });
  if (query.trim()) params.set("q", query.trim());
  for (const [key, values] of Object.entries(filters)) for (const value of values) params.append(`filter.${key}`, value);
  return params;
}

export function researchMonitoringHref(row: ResearchRow, inventory: ResultsInventoryItem[]) {
  const campaign = row.values.campaign;
  const sia = row.values.sia;
  if (typeof campaign !== "string" || (typeof sia !== "string" && typeof sia !== "number")) return null;
  const target = inventory.find((item) => item.campaignCode === campaign && item.publicationId === row.provenance.publicationId && sameSourceHash(item.source.sha256, row.provenance.sourceHash));
  if (!target?.source.sha256) return null;
  return `/campanhas/resultados?${new URLSearchParams({ campaign: target.canonicalId, publicationId: target.publicationId, sourceHash: target.source.sha256, sia: String(sia) })}`;
}

export { ResearchMethod } from "./research-method";

export function ResearchBrowser({ module, initialQuery = "" }: { module: "impacts" | "calculations"; initialQuery?: string }) {
  const router = useRouter();
  const initial = new URLSearchParams(initialQuery);
  const isPreparation = module === "impacts" && initial.get("source") === "preparation";
  const revisionHash = initial.get("revisionHash") ?? "";
  const packageKey = initial.get("packageKey") ?? "";
  const sections: ResultsResearchSection[] = module === "impacts" ? isPreparation ? ["impacts", "references"] : ["impacts", "occurrences", "references"] : ["method", "calculations"];
  const initialSection = initial.get("section") as ResultsResearchSection;
  const [section, setSection] = useState<ResultsResearchSection>(sections.includes(initialSection) ? initialSection : sections[0]);
  const [inventory, setInventory] = useState<ResultsInventoryItem[] | null>(isPreparation ? [] : null);
  const [inventoryError, setInventoryError] = useState("");
  const [sourceCode, setSourceCode] = useState(initial.get("campaignCode") ?? "");
  const [pinnedIdentity, setPinnedIdentity] = useState({ publicationId: initial.get("publicationId"), sourceHash: initial.get("sourceHash") });
  const [filters, setFilters] = useState<Record<string, string[]>>(() => {
    const values: Record<string, string[]> = {};
    initial.forEach((value, key) => { if (key.startsWith("filter.")) (values[key.slice(7)] ??= []).push(value); });
    return values;
  });
  const [query, setQuery] = useState(initial.get("q") ?? "");
  const [appliedQuery, setAppliedQuery] = useState(initial.get("q") ?? "");
  const [catalogScope, setCatalogScope] = useState(initial.get("catalogScope") ?? (isPreparation ? "associations" : "detected"));
  const [offset, setOffset] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; data: ResultsResearchResponse } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [detail, setDetail] = useState<ResearchRow | null>(null);
  const [selection, setSelection] = useState<{ identity: string; rows: ResearchRow[] }>({ identity: "", rows: [] });
  const selectedSource = sourceCode ? inventory?.find((item) => item.campaignCode === sourceCode) : inventory?.[0];
  const identityMismatch = !!inventory && !!sourceCode && (!selectedSource || (pinnedIdentity.publicationId && selectedSource.publicationId !== pinnedIdentity.publicationId) || (pinnedIdentity.sourceHash && !sameSourceHash(selectedSource.source.sha256, pinnedIdentity.sourceHash)));
  const source = identityMismatch ? undefined : selectedSource;
  const sourceUnavailable = !!source && !hasAvailableResultsSource(source);
  // Passo a passo e Valores por ponto ficam sempre na campanha escolhida no seletor acima.
  const requestFilters = (section === "method" || section === "calculations") && source ? { ...filters, campaign: [source.campaignCode] } : filters;
  const requestParams = isPreparation ? new URLSearchParams({ source: "preparation", revisionHash, ...(packageKey ? { packageKey } : {}), section, offset: String(offset), limit: "25", q: appliedQuery }) : source ? researchQuery(source, section, requestFilters, appliedQuery, offset) : null;
  if (isPreparation && requestParams) for (const [key, values] of Object.entries(filters)) for (const value of values) requestParams.append(`filter.${key}`, value);
  if (requestParams) requestParams.set("catalogScope", catalogScope);
  const requestKey = requestParams?.toString() ?? "";
  const data = loaded?.key === requestKey ? loaded.data : null;
  const selectionIdentity = data ? `${researchSelectionIdentity(data, source?.campaignCode ?? "")}:${catalogScope}` : "";
  const selectedRows = selection.identity === selectionIdentity ? selection.rows : [];
  const error = failure?.key === requestKey ? failure.message : "";
  const isMethod = section === "method";

  useEffect(() => {
    if (isPreparation) return;
    const controller = new AbortController();
    void fetch("/api/imports/results?inventory=1", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Não foi possível confirmar as publicações vigentes.");
      const value = await response.json() as ResultsInventoryResponse;
      if (!Array.isArray(value.campaigns)) throw new Error("Inventário incompatível.");
      if (!controller.signal.aborted) { setInventory(value.campaigns); setInventoryError(""); }
    }).catch((reason: unknown) => { if (!controller.signal.aborted) { setInventory(null); setInventoryError(reason instanceof Error ? reason.message : "Inventário indisponível."); } });
    return () => controller.abort();
  }, [isPreparation]);

  useEffect(() => {
    if (!requestKey) return;
    const controller = new AbortController();
    const requested = new URLSearchParams(requestKey);
    void fetch(`/api/imports/results/research?${requestKey}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const value = await response.json() as ResultsResearchResponse & { error?: string };
      if (!response.ok) throw new Error(value.error || "Consulta indisponível ou publicação alterada. Recarregue a página para tentar novamente.");
      const matchesSource = requested.get("source") === "preparation"
        ? value.source?.published === false && value.source.kind === "preparation" && value.source.revisionHash === requested.get("revisionHash") && (!requested.get("packageKey") || value.source.packageKey === requested.get("packageKey"))
        : value.source?.published === true && value.source.publicationId === requested.get("publicationId") && sameSourceHash(value.source.sha256, requested.get("sourceHash"));
      if (value.contractVersion !== "yvae-research/1" || !matchesSource || value.section !== requested.get("section")) throw new Error("Identidade da consulta incompatível; nenhum resultado foi utilizado.");
      if (!controller.signal.aborted) { setLoaded({ key: requestKey, data: value }); setFailure(null); }
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setFailure({ key: requestKey, message: reason instanceof Error ? reason.message : "Consulta indisponível." }); });
    return () => controller.abort();
  }, [requestKey]);

  function changeFilter(key: string, values: string[]) { setFilters((current) => ({ ...current, [key]: values })); setOffset(0); }
  function changeSection(value: string) { setSelection({ identity: "", rows: [] }); setSection(value as ResultsResearchSection); setOffset(0); setDetail(null); }
  function openRelated(link: ResearchRow["links"][number]) {
    if (!RESULTS_RESEARCH_SECTIONS.includes(link.section)) return;
    if (isPreparation) { if (sections.includes(link.section)) { setSection(link.section); setFilters(link.filters); setOffset(0); setDetail(null); } return; }
    if (!source) return;
    const params = researchQuery(source, link.section, link.filters, "", 0);
    if (!params) return;
    if (sections.includes(link.section)) { setSection(link.section); setFilters(link.filters); setQuery(""); setAppliedQuery(""); setOffset(0); setDetail(null); }
    else router.push(`/resultados/${link.section === "calculations" || link.section === "method" ? "calculos" : "impactos"}?${params}`);
  }

  const facets = (data?.facets ?? []).filter((facet) => !(facet.key === "campaign" && (section === "calculations" || section === "method")));
  const primary = facets.filter((facet) => PRIMARY_FACETS[section].includes(facet.key));
  const secondary = facets.filter((facet) => !PRIMARY_FACETS[section].includes(facet.key));
  const secondaryActive = secondary.filter((facet) => filters[facet.key]?.length).length;
  const allColumns = data ? visibleResearchColumns(data.columns, data.rows) : [];
  // Coluna com o mesmo texto em todas as linhas da página vira nota acima da tabela.
  const constantColumns = data && data.rows.length >= 5 ? allColumns.filter((column) => data.rows.every((row) => researchFieldText(column.key, row.values[column.key]) === researchFieldText(column.key, data.rows[0].values[column.key]))) : [];
  const columns = allColumns.filter((column) => !constantColumns.includes(column));
  const pageCount = data ? Math.max(1, Math.ceil(data.counts.filtered / data.pagination.limit)) : 1;
  return <div className="min-w-0 space-y-4">
    <ScientificViews views={sections.map((value) => ({ value, label: labels[value] }))} selected={section} onChange={changeSection} />
    {isPreparation ? <p className="type-metadata break-words">Revisão bibliográfica independente, sem campanha ou publicação de resultados. <Link href="/resultados/impactos" className="underline">Consultar as campanhas publicadas</Link></p> : null}
    {inventoryError ? <p role="alert">{inventoryError}</p> : inventory === null ? <p role="status">Consultando campanhas publicadas…</p> : identityMismatch ? <p role="alert">A publicação vinculada não está mais vigente. Selecione outra campanha; nenhum resultado foi substituído automaticamente.</p> : !inventory.length && !isPreparation ? <p role="status">Nenhuma campanha publicada. A entrada de planilhas é feita em <Link href="/dados/resultados" className="underline">Central de dados → Planilhas de resultados</Link>.</p> : <>
      <div className="app-card grid items-end gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)_minmax(12rem,16rem)]">
        {!isPreparation && <label className="type-label flex min-w-0 flex-col gap-1">Campanha
          <select className={scientificControl} disabled={!inventory?.length} value={source?.campaignCode ?? ""} onChange={(event) => { setSelection({ identity: "", rows: [] }); setSourceCode(event.target.value); setPinnedIdentity({ publicationId: null, sourceHash: null }); setOffset(0); setDetail(null); if (isMethod) setFilters((current) => ({ ...current, sia: [], set: [], domain: [] })); }}>
            {(!inventory?.length || identityMismatch) && <option value="">Nenhuma campanha publicada</option>}
            {inventory?.map((item) => <option key={`${item.campaignCode}:${item.publicationId}`} value={item.campaignCode}>{publicationOptionLabel(item)}</option>)}
          </select>
        </label>}
        {!isMethod && <form role="search" className="flex min-w-0 items-end gap-2" onSubmit={(event) => { event.preventDefault(); setAppliedQuery(query); setOffset(0); }}>
          <label className="type-label flex min-w-0 flex-1 flex-col gap-1">Pesquisar<input disabled={sourceUnavailable} type="search" className={`${scientificControl} w-full`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={module === "calculations" ? "Ponto, SIA, conjunto ou situação" : "Organismo, efeito, composto ou referência"} /></label>
          <button type="submit" disabled={sourceUnavailable} className={scientificControl}>Buscar</button>
        </form>}
        {section === "impacts" && <label className="type-label flex min-w-0 flex-col gap-1">Mostrar<select disabled={sourceUnavailable} className={scientificControl} value={catalogScope} onChange={(event) => { setSelection({ identity: "", rows: [] }); setCatalogScope(event.target.value); setOffset(0); }}>
          {!isPreparation && <option value="detected">Só organismos detectados nesta campanha</option>}<option value="associations">Todas as associações (detectados primeiro)</option><option value="scored">Só associações com score</option><option value="unscored">Só associações sem score (NA)</option><option value="without-association">Organismos sem associação</option><option value="all">Catálogo inteiro, com organismos sem associação</option>
        </select></label>}
      </div>
      {data && isMethod && (data.method ? <ResearchMethod method={data.method} selectedSia={filters.sia?.[0]} onSelectSia={(sia) => changeFilter("sia", [sia])} pointHref={source ? (sia) => resultDetailHref(source.campaignCode, sia) : undefined} /> : <p role="alert">Explicação do cálculo indisponível para esta publicação. Nenhuma fórmula substituta foi aplicada.</p>)}
      {data && !isMethod && <>
        {facets.length > 0 && <div className="space-y-2">
          <div className="grid items-start gap-2 sm:grid-cols-2 xl:grid-cols-3">{primary.map((facet) => <ScientificMultiFilter key={facet.key} label={facet.label} options={facet.options} selected={filters[facet.key] ?? []} onChange={(values) => changeFilter(facet.key, values)} />)}</div>
          {secondary.length > 0 && <details open={secondaryActive > 0 || undefined}><summary className="type-label min-h-11 cursor-pointer content-center text-[var(--brand-navy-strong)]">Mais filtros{secondaryActive ? ` (${secondaryActive} ativo${secondaryActive > 1 ? "s" : ""})` : ""}</summary><div className="grid items-start gap-2 pt-2 sm:grid-cols-2 xl:grid-cols-3">{secondary.map((facet) => <ScientificMultiFilter key={facet.key} label={facet.label} options={facet.options} selected={filters[facet.key] ?? []} onChange={(values) => changeFilter(facet.key, values)} />)}</div></details>}
          <ScientificActiveFilters filters={Object.entries(filters).map(([key, values]) => { const facet = facets.find((item) => item.key === key); return { key, label: facet?.label ?? key, values: values.map((value) => facet?.options.find((item) => item.value === value) ?? { value, label: value }) }; })} onRemove={(key, value) => changeFilter(key, filters[key].filter((item) => item !== value))} onClear={() => { setFilters({}); setQuery(""); setAppliedQuery(""); setOffset(0); }} />
        </div>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p role="status" className="type-metadata">{researchCountsText(data.counts)}{section === "impacts" && data.counts.detected !== undefined && catalogScope !== "detected" ? ` ${data.counts.detected.toLocaleString("pt-BR")} com organismo detectado na campanha, listados primeiro.` : ""}</p>
          {!selectedRows.length && <p className="type-caption text-[var(--ink-soft)]">Marque linhas para exportar fichas em PDF ou XLSX.</p>}
        </div>
        {constantColumns.length > 0 && <p className="type-caption text-[var(--ink-soft)]">Igual em todas as linhas desta página: {constantColumns.map((column) => <span key={column.key} className="mr-3 inline-block"><strong className="text-[var(--ink)]">{column.label}</strong> {researchFieldText(column.key, data.rows[0].values[column.key])}</span>)}</p>}
        {selectedRows.length > 0 && <section className="app-card space-y-2 border-[var(--brand-teal)] p-3" aria-label="Exportar a seleção">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="type-label font-bold">{selectedRows.length} {selectedRows.length === 1 ? "linha selecionada" : "linhas selecionadas"} · {researchUnit(section, catalogScope)}</p><button className={scientificControl} type="button" onClick={() => setSelection({ identity: selectionIdentity, rows: [] })}>Limpar seleção</button></div>
          <ReportActions count={selectedRows.length} identity={JSON.stringify([selectionIdentity, selectedRows.map((row) => row.id)])} build={() => buildResearchReport(data, source?.campaignCode ?? "", selectedRows, catalogScope)} />
        </section>}
        <div className="relative overflow-x-auto rounded border border-[var(--line-ghost)]" role="region" aria-label={`${labels[section]}: tabela com rolagem horizontal`} tabIndex={0}>
          <table className="w-full text-left text-sm"><thead className="bg-[var(--surface-soft)]"><tr><th scope="col" className="w-12 px-2 py-3"><span className="sr-only">Selecionar</span></th>{columns.map((column) => <th key={column.key} scope="col" className="px-3 py-3">{column.label}</th>)}<th scope="col" className="px-3 py-3"><span className="sr-only">Detalhe</span></th></tr></thead>
            <tbody>{data.rows.map((row) => <tr key={row.id} className="border-t border-[var(--line-ghost)] hover:bg-[var(--surface-soft)]"><td className="px-2 py-1"><label className="flex min-h-11 min-w-11 items-center justify-center"><input type="checkbox" aria-label={`Selecionar ${researchRecordLabel(row)} — ID ${row.id}`} checked={selectedRows.some((item) => item.id === row.id)} onChange={(event) => setSelection({ identity: selectionIdentity, rows: event.target.checked ? [...selectedRows, row] : selectedRows.filter((item) => item.id !== row.id) })} /></label></td>{columns.map((column) => <td key={column.key} className="min-w-28 max-w-xs break-words px-3 py-2">{researchCell(column.key, row.values[column.key])}</td>)}<td className="px-3 py-2"><button type="button" className={`${scientificControl} whitespace-nowrap`} onClick={() => setDetail(row)}>Ver detalhe</button></td></tr>)}</tbody>
          </table>
        </div>
        {!data.rows.length && <p role="status">Nenhum registro corresponde aos filtros. Isso não demonstra ausência de risco; limpe os filtros para ampliar a consulta.</p>}
        {pageCount > 1 && <nav aria-label="Páginas da consulta" className="flex items-center justify-between gap-2"><button type="button" className={scientificControl} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>Anterior</button><span className="type-metadata">Página {Math.floor(data.pagination.offset / data.pagination.limit) + 1} de {pageCount}</span><button type="button" className={scientificControl} disabled={data.pagination.offset + data.pagination.returned >= data.counts.filtered} onClick={() => setOffset(offset + 25)}>Próxima</button></nav>}
      </>}
      {sourceUnavailable ? <p role="status">Os resultados desta campanha estão publicados, mas o arquivo-fonte e os catálogos necessários a esta consulta não estão disponíveis neste ambiente. <Link className="underline" href={`/campanhas/resultados?campaign=${encodeURIComponent(source!.canonicalId)}`}>Consultar os resultados legados publicados</Link>.</p> : error ? <p role="alert">{error}</p> : !data && <p role="status">Carregando…</p>}
      {detail && data && <ResultsReviewDialog title="Detalhe do registro" closeLabel="Fechar detalhe" onClose={() => setDetail(null)}>
        <ScientificRecordDetail groups={data.detailGroups.map((group) => ({ title: group.label, fields: group.keys.filter((key) => Object.hasOwn(detail.values, key) && !isHiddenVersionField(key) && !isHiddenVersionField(data.fieldLabels[key] ?? "") && !mentionsInternalVersion(detail.values[key])).map((key) => ({ label: data.fieldLabels[key] ?? detail.provenance.headers[key] ?? key, value: researchFieldText(key, detail.values[key]) })) })).filter((group) => group.fields.length)} />
        {(detail.values.references || detail.referenceLinks.length > 0) && <ScientificSourceLinks originalText={detail.values.references ? researchValueText(detail.values.references) : null} links={detail.referenceLinks} needsReview={detail.referenceLinks.some((link) => link.correspondence === "check_required")} />}
        <div className="mt-3 flex flex-wrap gap-2">{detail.links.map((link) => <button key={`${link.section}:${link.label}`} type="button" className={scientificControl} onClick={() => openRelated(link)}>{link.label}</button>)}</div>
        {researchMonitoringHref(detail, inventory ?? []) && <Link className={`${scientificControl} mt-3 inline-flex items-center underline`} href={researchMonitoringHref(detail, inventory ?? [])!}>Abrir este ponto em Resultados</Link>}
        <div className="mt-4"><ReportActions count={1} identity={`${selectionIdentity}:${detail.id}`} build={() => buildResearchReport(data, source?.campaignCode ?? "", [detail], catalogScope)} /></div>
        <details className="mt-3 border-t border-[var(--line-ghost)] pt-2"><summary className="type-label min-h-11 cursor-pointer content-center">Origem do registro</summary>
          {detail.associationSources ? <ul className="space-y-2">{detail.associationSources.map((item) => <li key={item.associationId} className="type-metadata break-words">{item.associationId} · {item.provenance.sheet}, linha {item.provenance.row}</li>)}</ul> : <p className="type-metadata break-words">Planilha: aba {detail.provenance.sheet}, linha {detail.provenance.row}.</p>}
        </details>
      </ResultsReviewDialog>}
    </>}
  </div>;
}
