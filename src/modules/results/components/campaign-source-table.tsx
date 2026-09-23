"use client";

import { useEffect, useState } from "react";
import { ResultsReviewDialog } from "@/components/results-review-dialog";
import { formatResultIndex } from "../format-index";
import { formatNumber, isCoordinateField } from "@/lib/number-format";
import type { AnalyticalSet, ResultsCampaign, ResultPoint } from "@/modules/results/types";
import { isHiddenVersionField, withoutVersionFields } from "../hidden-fields";
import type { ResultsSourcePreview, SourcePreviewRow, SourcePreviewSection } from "@/lib/results-source-preview-contract";

export async function readCampaignPreview(params: URLSearchParams, signal?: AbortSignal): Promise<ResultsSourcePreview> {
  const response = await fetch(`/api/imports/results/source-preview?${params}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error("A fonte consultada está indisponível ou sua vigência mudou. Recarregue a campanha. A publicação vigente não foi alterada.");
  const data = await response.json() as ResultsSourcePreview;
  const published = params.get("source") === "published";
  if (data.source?.kind !== (published ? "published" : "local-corrected-preview") || data.source.published !== published || data.campaignCode !== params.get("campaignCode") || (published && (!params.get("publicationId") || data.source.publicationId !== params.get("publicationId")))) throw new Error("Origem da consulta incompatível.");
  if (params.get("sourceHash") && data.source.sha256.toLowerCase() !== params.get("sourceHash")!.toLowerCase()) throw new Error("Fonte alterada; reabra a prévia.");
  return data;
}

export function sourcePoint(campaign: ResultsCampaign, row: SourcePreviewRow) {
  const match = String(row["Cód. SIA"] ?? row["Ponto"] ?? "").trim().match(/^(?:SIA-)?(\d+)$/);
  if (!match) return undefined;
  const key = match[1].replace(/^0+/, "") || "0";
  return campaign.points.find((point) => point.campaignCode === campaign.campaignCode && (point.siaCode.replace(/^SIA-0*/, "") || "0") === key);
}

export function CampaignSourceTable({ campaign, section, set, title, initialSia = "", sourceHash, publicationId, onPoint, visibleColumns }: { campaign: ResultsCampaign; section: SourcePreviewSection; set?: AnalyticalSet; title: string; initialSia?: string; sourceHash?: string; publicationId?: string; onPoint?: (point: ResultPoint) => void; visibleColumns?: string[] }) {
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [sia, setSia] = useState(initialSia);
  const [sort, setSort] = useState("");
  const [direction, setDirection] = useState("asc");
  const [offset, setOffset] = useState(0);
  const [loaded, setLoaded] = useState<{ key: string; value: ResultsSourcePreview } | null>(null);
  const requestKey = JSON.stringify([campaign.campaignCode, section, set, sia, sort, direction, offset, appliedQuery, sourceHash, publicationId]);
  const data = loaded?.key === requestKey ? loaded.value : null;
  const [failure, setFailure] = useState<{ key: string; message: string }>();
  const error = failure?.key === requestKey ? failure.message : "";
  const [detail, setDetail] = useState<SourcePreviewRow | null>(null);
  const [evidence, setEvidence] = useState<{ title: string; rows: SourcePreviewRow[] } | null>(null);
  const [evidenceError, setEvidenceError] = useState("");
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ campaignCode: campaign.campaignCode, section, limit: "12", offset: String(offset), direction });
    if (publicationId) { params.set("source", "published"); params.set("publicationId", publicationId); }
    if (set) params.set("set", set);
    if (sourceHash) params.set("sourceHash", sourceHash);
    if (sia) params.set("sia", sia);
    if (sort) params.set("sort", sort);
    if (appliedQuery) params.set("q", appliedQuery);
    void readCampaignPreview(params, controller.signal).then((value) => { if (!controller.signal.aborted) { setLoaded({ key: requestKey, value }); setFailure(undefined); } }).catch((reason: unknown) => { if (!controller.signal.aborted) { setFailure({ key: requestKey, message: reason instanceof Error ? reason.message : "Prévia indisponível." }); setLoaded(null); } });
    return () => controller.abort();
  }, [campaign.campaignCode, section, set, sia, sort, direction, offset, appliedQuery, requestKey, sourceHash, publicationId]);
  const preferred = section === "molecular" ? ["Cód. SIA", "Espécie", "Conjunto analisado", "Número de Reads", "% Reads", "Município"] : section === "components" ? ["Ponto", "Conjunto", "Total de reads", "Registros", "Cobertura ambiental", "Cobertura operacional", "Cobertura saúde", "Situação analítica"] : section === "catalog" ? ["ID organismo", "Organismo do banco", "Score ambiental", "Score operacional", "Score saúde humana"] : ["ID organismo", "Domínio", "Score bibliográfico", "Organismo do banco", "Espécie", "Cód. SIA", "Número de Reads"];
  const columns = data ? (visibleColumns ?? preferred).filter((column) => data.columns.includes(column)) : [];
  const sourceColumns = data?.columns.filter((column) => !isHiddenVersionField(column)) ?? [];
  const shown = (columns.length ? columns : sourceColumns.slice(0, 6)).filter((column) => !isHiddenVersionField(column));
  const input = "min-h-11 min-w-0 rounded-lg border border-[var(--line-strong)] bg-white px-3 text-sm text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--brand-teal)]";
  async function openEvidence(row: SourcePreviewRow) {
    setEvidenceLoading(true); setEvidenceError("");
    try {
      const species = String(row["Espécie"] ?? "");
      const catalog = await readCampaignPreview(new URLSearchParams({ campaignCode: campaign.campaignCode, section: "catalog", organism: species, limit: "500", ...(sourceHash ? { sourceHash } : {}), ...(publicationId ? { source: "published", publicationId } : {}) }));
      const exact = catalog.rows.filter((item) => item["Organismo do banco"] === species);
      if (exact.length !== 1) { setEvidenceError(exact.length ? "Associação literal ambígua no catálogo; nenhuma evidência foi atribuída." : "Nenhuma associação literal no catálogo. Isso não demonstra ausência de risco."); return; }
      const id = String(exact[0]["ID organismo"]);
      const response = await readCampaignPreview(new URLSearchParams({ campaignCode: campaign.campaignCode, section: "evidence", organismId: id, limit: "500", ...(sourceHash ? { sourceHash } : {}), ...(publicationId ? { source: "published", publicationId } : {}) }));
      setEvidence({ title: `Catálogo e evidências — ${species}`, rows: [exact[0], ...response.rows.filter((item) => String(item["ID organismo"]) === id)] });
    } catch (reason) { setEvidenceError(reason instanceof Error ? reason.message : "Evidências indisponíveis."); }
    finally { setEvidenceLoading(false); }
  }
  return <section className="app-card min-w-0 space-y-3 p-4">
    <h3 className="heading-font type-panel-title text-[var(--brand-navy-strong)]">{title}</h3>
    <p className="type-caption text-[var(--ink-soft)]">{publicationId ? "Publicação vigente — fonte persistida." : "Prévia local — fonte corrigida; não publicada."} {data?.scope === "global-reference" ? "Referência global: não é população exclusiva desta campanha." : `${campaign.campaignCode}${set ? ` · ${set}` : ""}; preservadas as linhas originais, sem deduplicação.`}</p>
    <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); setOffset(0); setAppliedQuery(query); }}>
      <label className="type-label flex min-w-0 flex-1 flex-col gap-1">Busca contextual<input type="search" className={input} value={query} onChange={(event) => setQuery(event.target.value)} /></label><button type="submit" className={input}>Buscar</button>
      {section !== "catalog" && section !== "evidence" && <label className="type-label flex flex-col gap-1">Ponto<select className={input} value={sia} onChange={(event) => { setSia(event.target.value); setOffset(0); }}><option value="">Todos os pontos</option>{campaign.points.map((point) => <option key={point.key} value={point.siaCode}>{point.siaCode}</option>)}</select></label>}
      <label className="type-label flex flex-col gap-1">Ordenar<select className={input} value={sort} onChange={(event) => { setSort(event.target.value); setOffset(0); }}><option value="">Ordem da fonte</option>{sourceColumns.map((column) => <option key={column} value={column}>{column}</option>)}</select></label>
      <button type="button" className={input} onClick={() => { setDirection(direction === "asc" ? "desc" : "asc"); setOffset(0); }}>{direction === "asc" ? "Crescente" : "Decrescente"}</button>
      <button type="button" className={input} onClick={() => { setQuery(""); setAppliedQuery(""); setSia(""); setOffset(0); }}>Limpar</button>
    </form>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">Carregando registros da prévia…</p> : <>
      <p className="type-metadata" role="status">População {data.scope === "global-reference" ? "global" : "da campanha"}: {data.counts.population.toLocaleString("pt-BR")} · filtrados: {data.counts.filtered.toLocaleString("pt-BR")} · exibidos: {data.rows.length ? `${data.offset + 1}–${data.offset + data.rows.length}` : "0"}</p>
      {section === "molecular" && <p className="type-metadata">Reads no filtro: {Object.entries(data.readsBySet).map(([name, reads]) => `${name}: ${reads.toLocaleString("pt-BR")}`).join(" · ") || "nenhum registro"}. % Reads é o percentual informado para campanha + ponto + conjunto; não somado entre conjuntos.</p>}
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={`${title}: tabela com rolagem`}><table className="w-full text-left text-sm"><thead className="bg-[var(--surface-soft)]"><tr>{shown.map((column) => <th key={column} className="px-3 py-2">{column}</th>)}<th className="px-3 py-2">Detalhe</th></tr></thead><tbody>{data.rows.map((row, index) => <tr key={`${data.offset}-${index}`} className="border-t border-[var(--line-ghost)]">{shown.map((column) => <td key={column} className="max-w-xs break-words px-3 py-2">{cellText(row[column], column)}</td>)}<td className="px-3 py-2">{onPoint && sourcePoint(campaign, row) && <button type="button" className="min-h-11 font-bold text-[var(--brand-navy-strong)] underline" onClick={() => { setDetail(null); setEvidence(null); onPoint(sourcePoint(campaign, row)!); }}>Ver ponto</button>}<button type="button" className="min-h-11 font-bold text-[var(--brand-navy-strong)] underline" onClick={() => { setDetail(row); setEvidenceError(""); }}>{section === "alerts" ? "Ver associação bibliográfica" : "Ver registro"}</button></td></tr>)}</tbody></table></div>
      {!data.rows.length && <p role="status">Nenhum registro corresponde a este filtro da fonte disponível. Não equivale a resultado negativo.</p>}
      <div className="flex items-center justify-between gap-2"><button className={input} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 12))}>Anterior</button><span className="type-caption">Página {Math.floor(data.offset / 12) + 1} de {Math.max(1, Math.ceil(data.counts.filtered / 12))}</span><button className={input} disabled={offset + data.rows.length >= data.counts.filtered} onClick={() => setOffset(offset + 12)}>Próxima</button></div>
    </>}
    {detail && !evidence && <ResultsReviewDialog title="Registro da fonte corrigida" closeLabel="Fechar registro" onClose={() => setDetail(null)}>
      <p className="type-caption mb-3">{campaign.campaignCode} · {publicationId ? "Publicação vigente" : "Prévia local, não publicada"} · Todos os campos originais abaixo.</p>
      {section === "molecular" && <><button type="button" className={`${input} mb-3`} disabled={evidenceLoading} onClick={() => void openEvidence(detail)}>{evidenceLoading ? "Consultando…" : "Ver catálogo e evidências do organismo"}</button>{evidenceError && <p role="status">{evidenceError}</p>}</>}
      <SourceFields row={detail} />
      {onPoint && sourcePoint(campaign, detail) && <button type="button" className={input} onClick={() => { const point = sourcePoint(campaign, detail); if (point) { setDetail(null); onPoint(point); } }}>Abrir ficha do ponto desta campanha</button>}
    </ResultsReviewDialog>}
    {evidence && <ResultsReviewDialog title={evidence.title} closeLabel="Fechar evidências" onClose={() => { setEvidence(null); setDetail(null); }}><p className="type-metadata mb-3">Associação literal de Espécie → Organismo do banco → ID organismo + Domínio. Referências globais contextualizam o organismo; não comprovam efeito local.</p>{evidence.rows.map((row, index) => <section key={index} className="mb-5 border-b border-[var(--line-ghost)] pb-3"><SourceFields row={row} /></section>)}</ResultsReviewDialog>}
  </section>;
}

function cellText(value: unknown, field = "") { return /^(Índice |Componente .*utilizado|Limite (inferior|superior))/.test(field) ? formatResultIndex(value, "Não informado") : value === null || value === undefined || value === "" ? "Não informado" : typeof value === "number" ? isCoordinateField(field) ? value.toLocaleString("pt-BR", { maximumFractionDigits: 6 }) : formatNumber(value) : String(value); }
function SourceFields({ row }: { row: SourcePreviewRow }) { return <dl className="space-y-2">{Object.entries(withoutVersionFields(row)).map(([key, value]) => <div key={key}><dt className="type-label font-bold">{key}</dt><dd className="type-metadata break-words">{cellText(value, key)}</dd></div>)}</dl>; }
