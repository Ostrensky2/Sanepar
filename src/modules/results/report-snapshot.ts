import type { ResearchRow, ResultsResearchResponse } from "@/lib/results-research-contract";
import { samePublishedSource } from "./presentation";
import { mentionsInternalVersion, withoutVersionFields } from "./hidden-fields";

export type ReportValue = string | number | boolean | null;
export type ReportTable = { title: string; columns: string[]; rows: ReportValue[][]; indexColumns?: number[] };
export type ReportRecord = { id: string; title: string; tables: ReportTable[]; photoUrl?: string };
export type ReportSnapshot = { title: string; unit: string; selectedIds: string[]; generatedAt: string; provenance: Record<string, ReportValue>; limitations: string[]; records: ReportRecord[] };
const limits = ["Reads e DNA não comprovam abundância, viabilidade, toxina ou dano local.", "Associações bibliográficas e ocorrência molecular são apresentadas separadamente; NA não equivale a zero ou ausência de risco.", "Este relatório reúne literatura e ocorrências; as notas do índice de captação 0.8 ficam em Campanhas e resultados."];
const scalar = (value: unknown): ReportValue => value === null || value === undefined ? null : typeof value === "number" || typeof value === "boolean" || typeof value === "string" ? value : Array.isArray(value) ? value.join("; ") : JSON.stringify(value);
export const reportText = (value: ReportValue) => value === null ? "Não informado na fonte" : typeof value === "boolean" ? value ? "Sim" : "Não" : String(value);
export const reportIndexColumn = (key: string) => /^(Índice |Componente .*utilizado|Limite (inferior|superior)|(?:environmental|operational|humanHealth)(?:Calculated|Used)$)/.test(key);
// Versões de catálogo/método nunca entram no relatório (tela, PDF ou XLSX).
function fields(title: string, values: Record<string, unknown>): ReportTable { return { title, columns: ["Campo", "Valor"], rows: Object.entries(withoutVersionFields(values)).map(([key, value]) => [key, scalar(value)]) }; }
function validSelection(ids: string[]) { if (!ids.length || new Set(ids).size !== ids.length) throw new Error("Selecione explicitamente ao menos uma unidade, sem duplicações."); }
async function json<T>(url: string): Promise<T> { const response = await fetch(url, { cache: "no-store" }); if (!response.ok) throw new Error("Fonte indisponível ou alterada. Nenhum arquivo parcial foi gerado; atualize a publicação."); return response.json() as Promise<T>; }

export function researchSelectionIdentity(data: ResultsResearchResponse, campaignCode: string) { return JSON.stringify([campaignCode, data.source.publicationId, data.source.sha256?.toLowerCase(), data.revision.id, data.section]); }
export function researchUnit(section: ResultsResearchResponse["section"], catalogScope = "associations") { return section === "impacts" ? catalogScope === "without-association" ? "organismo sem associação" : catalogScope === "all" ? "registro de catálogo (associação ou organismo sem associação)" : "associação bibliográfica" : section === "references" ? "referência bibliográfica (associações mantidas separadas)" : section === "occurrences" ? "ocorrência molecular" : "registro de cálculo por conjunto"; }
export function researchRecordLabel(row: ResearchRow) { return [row.values.organismLabel ?? row.values.referenceLabel ?? row.values.sia ?? "Registro científico", row.values.domain, row.values.campaign, row.values.sia].filter((value) => value !== undefined && value !== null).map((value) => scalar(value)).join(" · "); }
export async function buildResearchReport(context: ResultsResearchResponse, campaignCode: string, selected: ResearchRow[], catalogScope = "associations"): Promise<ReportSnapshot> {
  validSelection(selected.map((row) => row.id));
  const params = context.source.published
    ? new URLSearchParams({ campaignCode, publicationId: context.source.publicationId, sourceHash: context.source.sha256, section: context.section })
    : new URLSearchParams({ source: "preparation", revisionHash: context.source.revisionHash, packageKey: context.source.packageKey, section: context.section });
  // Filters narrow retrieval only. Exact stable IDs below are the export boundary.
  const associations = [...new Set(selected.flatMap((row) => row.associationIds))];
  if (context.section === "impacts" && associations.length && selected.every((row) => row.associationIds.length)) associations.forEach((id) => params.append("filter.associationKey", id));
  else if (context.section === "impacts") { params.set("catalogScope", "all"); selected.flatMap((row) => row.organismIds).forEach((id) => params.append("filter.organismId", id)); }
  params.set("limit", "100");
  const wanted = new Set(selected.map((row) => row.id));
  const found = new Map<string, ResearchRow>();
  let offset = 0, total: number | undefined;
  do {
    params.set("offset", String(offset));
    const page = await json<ResultsResearchResponse>(`/api/imports/results/research?${params}`);
    const identity = context.source.published ? page.source?.published && samePublishedSource(page.source, context.source) : !page.source?.published && page.source?.kind === "preparation" && page.source.revisionHash === context.source.revisionHash && page.source.packageKey === context.source.packageKey;
    if (!identity || page.contractVersion !== "yvae-research/1" || page.section !== context.section || page.revision.id !== context.revision.id || page.pagination.offset !== offset || !Number.isSafeInteger(page.counts.filtered) || page.counts.filtered < 0 || (total !== undefined && total !== page.counts.filtered)) throw new Error("Revisão ou paginação alterada; relatório cancelado.");
    total = page.counts.filtered;
    for (const row of page.rows) if (wanted.has(row.id)) { if (found.has(row.id)) throw new Error("Identidade de registro duplicada."); found.set(row.id, row); }
    if (!page.rows.length && offset < total) throw new Error("Consulta incompleta.");
    offset += page.rows.length;
    if (offset > total) throw new Error("Contagem incompatível.");
  } while (offset < total!);
  if (found.size !== wanted.size) throw new Error("Uma unidade selecionada deixou de existir nesta revisão; selecione novamente.");
  const records = selected.map(({ id }) => {
    const row = found.get(id)!;
    const tables = context.detailGroups.map((group) => fields(group.label, Object.fromEntries(group.keys.filter((key) => Object.hasOwn(row.values, key)).map((key) => [context.fieldLabels[key] ?? key, row.values[key]]))));
    tables.push(fields("Campos semânticos completos", row.values), fields("Proveniência do registro", { ID: row.id, Organismos: row.organismIds, Associações: row.associationIds, Publicação: row.provenance.publicationId, Revisão: row.provenance.revisionId, "SHA-256": row.provenance.sourceHash, Aba: row.provenance.sheet, Linha: row.provenance.row }), fields("Campos originais", row.provenance.sourceValues));
    tables.push({ title: "Referências — links separados, não contagem de artigos", columns: ["Identificador", "Rótulo", "URL", "Correspondência"], rows: row.referenceLinks.map((link) => [link.id, link.label, safeReportUrl(link.href) ?? "URL inválida omitida", link.correspondence]) });
    row.associationSources?.forEach((item) => { tables.push(fields(`Associação ${item.associationId} — origem independente`, { Organismo: item.organismId, Publicação: item.provenance.publicationId, Revisão: item.provenance.revisionId, "SHA-256": item.provenance.sourceHash, Aba: item.provenance.sheet, Linha: item.provenance.row, ...item.provenance.sourceValues })); });
    return { id, title: researchRecordLabel(row), tables };
  });
  return { title: "Fichas científicas — impactos e evidências", unit: researchUnit(context.section, catalogScope), selectedIds: [...wanted], generatedAt: new Date().toISOString(), provenance: { "Contexto de campanha": campaignCode || "Revisão bibliográfica independente", Publicação: context.source.publicationId, Revisão: context.revision.id, "SHA-256": context.source.sha256, Arquivo: context.source.fileName }, limitations: [...limits, ...context.limitations].filter((text) => !mentionsInternalVersion(text)), records };
}

export function safeReportUrl(value: string): string | null { try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; } }

export async function verifyReportCurrent(snapshot: ReportSnapshot) {
  const publicationId = snapshot.provenance.Publicação;
  if (typeof publicationId !== "string") return; // Preparation snapshots are rebuilt for every action; their GET is revision-pinned.
  const inventory = await json<{ campaigns: { campaignCode: string; publicationId: string; source: { sha256: string } }[] }>("/api/imports/results?inventory=1");
  const campaign = snapshot.provenance.Campanha ?? snapshot.provenance["Contexto de campanha"];
  if (!Array.isArray(inventory.campaigns) || !inventory.campaigns.some((item) => item.campaignCode === campaign && samePublishedSource({ publicationId: item.publicationId, sha256: item.source.sha256 }, { publicationId, sha256: String(snapshot.provenance["SHA-256"]) }))) throw new Error("A publicação mudou durante a preparação. Atualize e selecione novamente; nenhum arquivo foi baixado.");
}
