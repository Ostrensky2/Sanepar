import type { ResultsCampaign, ResultPoint } from "./types";
import type { ResultsSourcePreview, SourcePreviewRow, SourcePreviewSection } from "@/lib/results-source-preview-contract";
import type { ResearchRow, ResultsResearchResponse } from "@/lib/results-research-contract";
import { samePublishedSource, sameSourceHash } from "./presentation";
import { isHiddenVersionField, mentionsInternalVersion, withoutVersionFields } from "./hidden-fields";
import type { ResultsSourceAnalytics } from "@/lib/results-source-analytics-contract";

export type ReportValue = string | number | boolean | null;
export type ReportTable = { title: string; columns: string[]; rows: ReportValue[][]; indexColumns?: number[] };
export type ReportRecord = { id: string; title: string; tables: ReportTable[]; photoUrl?: string };
export type ReportSnapshot = { title: string; unit: string; selectedIds: string[]; generatedAt: string; provenance: Record<string, ReportValue>; limitations: string[]; records: ReportRecord[] };
export type PointReportSource = { campaign: ResultsCampaign; publicationId: string; sourceHash: string; fileName?: string; photos?: Record<string, string> };
const limits = ["Reads e DNA não comprovam abundância, viabilidade, toxina ou dano local.", "Associações bibliográficas e ocorrência molecular são apresentadas separadamente; NA não equivale a zero ou ausência de risco.", "Intervalos não são intervalos de confiança. Resultados parciais não recebem valor central nem ranking.", "Índices e limites: três casas decimais na apresentação; números originais preservados no XLSX. Nenhum índice é recalculado neste relatório."];
const scalar = (value: unknown): ReportValue => value === null || value === undefined ? null : typeof value === "number" || typeof value === "boolean" || typeof value === "string" ? value : Array.isArray(value) ? value.join("; ") : JSON.stringify(value);
export const reportText = (value: ReportValue) => value === null ? "Não informado na fonte" : typeof value === "boolean" ? value ? "Sim" : "Não" : String(value);
export const reportIndexColumn = (key: string) => /^(Índice |Componente .*utilizado|Limite (inferior|superior)|(?:environmental|operational|humanHealth)(?:Calculated|Used)$)/.test(key);
// Versões de catálogo/método nunca entram no relatório (tela, PDF ou XLSX).
function fields(title: string, values: Record<string, unknown>): ReportTable { return { title, columns: ["Campo", "Valor"], rows: Object.entries(withoutVersionFields(values)).map(([key, value]) => [key, scalar(value)]) }; }
function rawTable(title: string, sourceColumns: string[], rows: SourcePreviewRow[]): ReportTable { const columns = sourceColumns.filter((key) => !isHiddenVersionField(key)); return { title, columns, rows: rows.map((row) => columns.map((key) => row[key] ?? null)), indexColumns: columns.flatMap((key, index) => reportIndexColumn(key) ? [index] : []) }; }
const siaKey = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).match(/^(?:SIA-)?0*(\d+)$/)?.[1] : undefined;
function validSelection(ids: string[]) { if (!ids.length || new Set(ids).size !== ids.length) throw new Error("Selecione explicitamente ao menos uma unidade, sem duplicações."); }
async function json<T>(url: string): Promise<T> { const response = await fetch(url, { cache: "no-store" }); if (!response.ok) throw new Error("Fonte indisponível ou alterada. Nenhum arquivo parcial foi gerado; atualize a publicação."); return response.json() as Promise<T>; }

async function pointRows(source: PointReportSource, sia: string, section: SourcePreviewSection) {
  const rows: SourcePreviewRow[] = [];
  let expected: number | undefined;
  let first: ResultsSourcePreview | undefined;
  do {
    const params = new URLSearchParams({ source: "published", campaignCode: source.campaign.campaignCode, publicationId: source.publicationId, sourceHash: source.sourceHash, sia, section, offset: String(rows.length), limit: "500" });
    const page = await json<ResultsSourcePreview>(`/api/imports/results/source-preview?${params}`);
    if (!page.source?.published || !samePublishedSource(page.source, { publicationId: source.publicationId, sha256: source.sourceHash }) || page.campaignCode !== source.campaign.campaignCode || page.section !== section || page.scope !== "campaign" || page.offset !== rows.length || !Number.isSafeInteger(page.counts?.filtered) || page.counts.filtered < 0 || (expected !== undefined && expected !== page.counts.filtered)) throw new Error("Identidade ou paginação do relatório incompatível.");
    if (page.rows.some((row) => row.Campanha !== source.campaign.campaignCode || siaKey(row["Cód. SIA"] ?? row["Ponto"]) !== siaKey(sia))) throw new Error("A consulta retornou um ponto fora da seleção.");
    expected = page.counts.filtered; first ??= page;
    if (!page.rows.length && rows.length < expected) throw new Error("Paginação incompleta; nenhum arquivo gerado.");
    rows.push(...page.rows);
    if (rows.length > expected) throw new Error("Contagem de registros incompatível.");
  } while (rows.length < expected!);
  return { first: first!, rows };
}

async function pointContributions(source: PointReportSource, sia: string) {
  return Promise.all((["bacteria", "cyanobacteria", "coi"] as const).map(async (set): Promise<ReportTable> => {
    const rows: ReportValue[][] = [];
    let total: number | undefined;
    do {
      const params = new URLSearchParams({ source: "published", campaignCode: source.campaign.campaignCode, publicationId: source.publicationId, sourceHash: source.sourceHash, sia, set, pageSize: "100", taxonOffset: String(rows.length) });
      const page = await json<ResultsSourceAnalytics>(`/api/imports/results/source-analytics?${params}`);
      if (!page.source?.published || !samePublishedSource(page.source, { publicationId: source.publicationId, sha256: source.sourceHash }) || page.campaignCode !== source.campaign.campaignCode || page.set !== set || !Number.isSafeInteger(page.contributionsTotal) || page.contributionsTotal < 0 || (total !== undefined && total !== page.contributionsTotal) || page.contributions.some((row) => siaKey(row.sia) !== siaKey(sia))) throw new Error("Contribuições de outra origem ou incompletas.");
      total = page.contributionsTotal;
      if (!page.contributions.length && rows.length < total) throw new Error("Contribuições incompletas.");
      rows.push(...page.contributions.map((row) => [row.sia, row.taxon, row.domain, row.reads, row.denominator, row.score, row.q]));
      if (rows.length > total) throw new Error("Contagem de contribuições incompatível.");
    } while (rows.length < total!);
    return { title: `Contribuições para Q — ${set} (não parcelas do índice geral)`, columns: ["SIA", "Táxon", "Domínio", "Reads", "N completo", "Score bibliográfico", "q"], rows };
  }));
}

async function reportPhoto(url: string | undefined) {
  if (!url || !url.startsWith("/api/documents/file?")) return undefined;
  const parsed = new URL(url, "http://local.invalid");
  if (parsed.searchParams.get("bucket") !== "photos" || !parsed.searchParams.get("path")) return undefined;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!response.ok || !/^image\/(png|jpeg)\b/.test(response.headers.get("content-type") ?? "")) return undefined;
    const blob = await response.blob(); if (blob.size > 10_000_000) return undefined;
    return await new Promise<string | undefined>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : undefined); reader.onerror = () => resolve(undefined); reader.readAsDataURL(blob); });
  } catch { return undefined; }
}

function pointSummary(point: ResultPoint): ReportTable[] {
  const ranges = [["Geral", point.overall], ["Ambiental", point.domains.environmental], ["Operacional", point.domains.operational], ["Saúde humana", point.domains.humanHealth]] as const;
  return [fields("Identificação e condição de uso", { Campanha: point.campaignCode, SIA: point.siaCode, Município: point.municipality, Manancial: point.waterBody, Completude: point.completeness, "Conjuntos utilizados": point.usedSetCount, Observações: point.observations, "Condição de uso": point.conditionOfUse, Latitude: point.coordinates?.latitude, Longitude: point.coordinates?.longitude }), { title: "Índices e intervalos publicados (0–1)", columns: ["Domínio", "Índice", "Limite inferior", "Limite superior"], indexColumns: [1, 2, 3], rows: ranges.map(([name, range]) => [name, range.value, range.lower, range.upper]) }];
}

export async function buildPointReport(source: PointReportSource, ids: string[]): Promise<ReportSnapshot> {
  validSelection(ids);
  if (!source.publicationId || !sameSourceHash(source.sourceHash, source.sourceHash)) throw new Error("Uma publicação identificada é obrigatória.");
  const selected = ids.map((id) => { const matches = source.campaign.points.filter((point) => point.key === id && point.campaignCode === source.campaign.campaignCode); if (matches.length !== 1) throw new Error("Ponto ausente ou ambíguo nesta campanha."); return matches[0]; });
  const records: ReportRecord[] = [];
  let origin: ResultsSourcePreview | undefined;
  for (const point of selected) {
    const tables = pointSummary(point);
    const sections = [["indices", "Índices — campos originais"], ["components", "Componentes e qualidade — campos originais"], ["molecular", "Ocorrências moleculares — campos originais"], ["alerts", "Associações bibliográficas relacionadas — não confirmação local"]] as const;
    const resolved = await Promise.all(sections.map(([section]) => pointRows(source, point.siaCode, section)));
    for (const [index, result] of resolved.entries()) {
      origin ??= result.first;
      tables.push(rawTable(sections[index][1], result.first.columns, result.rows));
    }
    tables.push(...await pointContributions(source, point.siaCode));
    const photoUrl = await reportPhoto(source.photos?.[`${point.campaignCode}|${point.siaCode}`]);
    tables.push(fields("Foto de campo", { Situação: photoUrl ? "Foto vinculada à mesma campanha e SIA incluída" : "Foto indisponível; ausência não bloqueia o relatório" }));
    records.push({ id: point.key, title: [point.siaCode, point.waterBody, point.municipality].filter(Boolean).join(" · "), tables, photoUrl });
  }
  return { title: "Fichas de pontos de monitoramento", unit: "ponto", selectedIds: [...ids], generatedAt: new Date().toISOString(), provenance: { Campanha: source.campaign.campaignCode, Publicação: source.publicationId, "SHA-256": source.sourceHash, Arquivo: origin!.source.fileName }, limitations: [...limits, ...origin!.warnings].filter((text) => !mentionsInternalVersion(text)), records };
}

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
  return { title: "Fichas científicas — impactos, evidências e metodologia", unit: researchUnit(context.section, catalogScope), selectedIds: [...wanted], generatedAt: new Date().toISOString(), provenance: { "Contexto de campanha": campaignCode || "Revisão bibliográfica independente", Publicação: context.source.publicationId, Revisão: context.revision.id, "SHA-256": context.source.sha256, Arquivo: context.source.fileName }, limitations: [...limits, ...context.limitations].filter((text) => !mentionsInternalVersion(text)), records };
}

export function safeReportUrl(value: string): string | null { try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; } }

export async function verifyReportCurrent(snapshot: ReportSnapshot) {
  const publicationId = snapshot.provenance.Publicação;
  if (typeof publicationId !== "string") return; // Preparation snapshots are rebuilt for every action; their GET is revision-pinned.
  const inventory = await json<{ campaigns: { campaignCode: string; publicationId: string; source: { sha256: string } }[] }>("/api/imports/results?inventory=1");
  const campaign = snapshot.provenance.Campanha ?? snapshot.provenance["Contexto de campanha"];
  if (!Array.isArray(inventory.campaigns) || !inventory.campaigns.some((item) => item.campaignCode === campaign && samePublishedSource({ publicationId: item.publicationId, sha256: item.source.sha256 }, { publicationId, sha256: String(snapshot.provenance["SHA-256"]) }))) throw new Error("A publicação mudou durante a preparação. Atualize e selecione novamente; nenhum arquivo foi baixado.");
}
