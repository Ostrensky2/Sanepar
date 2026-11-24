import "server-only";
import { captureIndexRows } from "@/lib/capture-index";
import { siaWorkbookStore } from "@/lib/sia-workbook-access";
import type { OrganismLevel, OrganismMarker, OrganismOccurrences, OrganismsCampaign, OrganismSummary } from "./contract";
import { ORGANISM_LEVELS } from "./contract";
import { parseUnifiedWorkbook, UNIFIED_SHEETS, type UnifiedMatrices, type UnifiedRow, type UnifiedSheetName } from "./workbook";

/** Organismos detectados por campanha e SIA. Fonte única: a planilha unificada da campanha, guardada no acervo privado
 * (Central de dados › Planilhas de resultados), que traz as matrizes por SIA do laboratório. Nada aqui lê a planilha antiga.
 * Níveis: grupo de risco, gênero e família; espécie só para as exóticas do COI. Campanhas e corridas nunca são somadas:
 * cada SIA usa a mesma biblioteca que deu a nota do índice (na C3, NextSeq quando utilizável, senão MiSeq). */
type Occurrence = [pointIndex: number, reads: number];
type Taxon = { nome: string; ocorrencias: Occurrence[]; naoResolvido?: boolean; categoria?: "confirmada" | "pendente" | "candidata" };
type Point = { sia: string; corrida: string; total: number; inconclusiva: boolean };
type Block = { pontos: Point[]; niveis: Partial<Record<OrganismLevel, Taxon[]>> };
export type OrganismDocument = { campaign: number; fonte: { id: string; arquivo: string }; marcadores: Record<OrganismMarker, Block> };
/** Biblioteca que o índice usou para o ponto: corrida ("C3_NextSeq") e situação. */
export type LibraryChoice = (sia: string, marker: OrganismMarker) => { run: string; status: string } | undefined;
/** Acervo das planilhas unificadas: qual é a vigente da campanha e os bytes dela. */
export type OrganismSource = { latest(campaign: number): Promise<{ id: string; filename: string } | null>; read(id: string): Promise<Uint8Array> };

const sheetOf = (marker: OrganismMarker, level: OrganismLevel) => (Object.keys(UNIFIED_SHEETS) as UnifiedSheetName[]).find(name => UNIFIED_SHEETS[name].marker === marker && UNIFIED_SHEETS[name].level === level)!;
const totalSheet: Record<OrganismMarker, UnifiedSheetName> = { "16S": "Associações 16S", COI: "Exóticas COI" };
const bySia = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true });
const exoticCategory = (name: string): Taxon["categoria"] => /status regional pendente/.test(name) ? "pendente" : /candidata/.test(name) ? "candidata" : "confirmada";

/** Monta a consulta a partir das matrizes já lidas. Sem estado: serve à planilha real e aos testes com planilha sintética. */
export function buildOrganismDocument(campaign: number, fonte: OrganismDocument["fonte"], matrices: UnifiedMatrices, library: LibraryChoice): OrganismDocument {
  const marcadores = {} as OrganismDocument["marcadores"];
  for (const marker of ["16S", "COI"] as const) {
    const totals = matrices[totalSheet[marker]];
    if (!/^Total de reads/.test(totals.headers.at(-1) ?? "")) throw new Error("Planilha unificada: coluna de total de reads ausente.");
    // Corrida de cada SIA: a que o índice usou; com uma corrida só na planilha, ela mesma.
    const candidates = new Map<string, UnifiedRow[]>();
    for (const row of matrices[sheetOf(marker, "genero")].rows) if (row.present) candidates.set(row.sia, [...(candidates.get(row.sia) ?? []), row]);
    const chosen = new Map<string, string>();
    for (const [sia, rows] of candidates) {
      const wanted = library(sia, marker)?.run.replace(/^C\d+_?/, "");
      chosen.set(sia, (rows.find(row => row.run === wanted) ?? rows[0]).run);
    }
    const sias = [...chosen.keys()].sort(bySia), position = new Map(sias.map((sia, index) => [sia, index]));
    const pick = (sheet: UnifiedSheetName) => new Map(matrices[sheet].rows.filter(row => chosen.get(row.sia) === row.run).map(row => [row.sia, row]));
    const totalRows = pick(totalSheet[marker]);
    // Planilhas de uma corrida só não dizem a plataforma; o rótulo vem da biblioteca usada pelo índice.
    const label = (sia: string) => { const run = chosen.get(sia)!; return /informad/i.test(run) || !run ? library(sia, marker)?.run.replace(/^C\d+_?/, "") || "corrida única" : run; };
    const pontos = sias.map(sia => ({ sia, corrida: label(sia), total: totalRows.get(sia)?.values.at(-1) ?? 0, inconclusiva: marker === "COI" && library(sia, marker)?.status === "inconclusivo" }));
    const niveis: Block["niveis"] = {};
    for (const level of ORGANISM_LEVELS[marker]) {
      const sheet = sheetOf(marker, level), rows = pick(sheet), headers = matrices[sheet].headers;
      const last = sheet === totalSheet[marker] ? headers.length - 1 : headers.length;      // sem a coluna de total
      const taxa: Taxon[] = [];
      for (let column = 0; column < last; column++) {
        const ocorrencias: Occurrence[] = [];
        for (const sia of sias) { const reads = rows.get(sia)?.values[column] ?? 0; if (reads > 0) ocorrencias.push([position.get(sia)!, reads]); }
        if (!ocorrencias.length) continue;
        const nome = headers[column];
        taxa.push(level === "exoticas" ? { nome: nome.split(" (")[0], categoria: exoticCategory(nome), ocorrencias }
          : { nome, ocorrencias, ...(/^Sem (gênero|família):/.test(nome) || nome === "Sem classificação taxonômica" ? { naoResolvido: true } : {}) });
      }
      niveis[level] = taxa;
    }
    marcadores[marker] = { pontos, niveis };
  }
  return { campaign, fonte, marcadores };
}

/** Planilha unificada mais recente da campanha no acervo privado. */
const storedSource: OrganismSource = {
  async latest(campaign) {
    const artifact = (await (await siaWorkbookStore()).list()).find(item => item.campaign === campaign);   // a lista vem da mais nova para a mais antiga
    return artifact ? { id: artifact.id, filename: artifact.filename } : null;
  },
  async read(id) { return (await (await siaWorkbookStore()).read(id)).bytes; },
};
const indexLibrary = (campaign: number): LibraryChoice => {
  const rows = new Map(captureIndexRows(campaign).map(row => [row.sia, row.components]));
  return (sia, marker) => rows.get(sia)?.[marker];
};

// Ler a planilha custa alguns segundos: o resultado fica em memória por campanha. A cada minuto confere-se qual é a
// planilha vigente; os bytes só são lidos de novo quando ela muda.
const CHECK_TTL_MS = 60_000;
const cache = new Map<number, { at: number; id: string | null; document: OrganismDocument | null }>();
const pending = new Map<number, Promise<OrganismDocument | null>>();
export async function organismDocument(campaign: number, source: OrganismSource = storedSource, library: LibraryChoice = indexLibrary(campaign)): Promise<OrganismDocument | null> {
  const shared = source === storedSource;      // fonte injetada (testes) não usa nem contamina a memória
  const hit = shared ? cache.get(campaign) : undefined;
  if (hit && Date.now() - hit.at < CHECK_TTL_MS) return hit.document;
  if (shared && pending.has(campaign)) return pending.get(campaign)!;
  const load = (async () => {
    const file = await source.latest(campaign);
    let document: OrganismDocument | null = null;
    if (file) document = hit?.id === file.id && hit.document ? hit.document
      : buildOrganismDocument(campaign, { id: file.id, arquivo: file.filename }, await parseUnifiedWorkbook(await source.read(file.id)), library);
    if (shared) cache.set(campaign, { at: Date.now(), id: file?.id ?? null, document });
    return document;
  })();
  if (!shared) return load;
  pending.set(campaign, load);
  try { return await load; } finally { pending.delete(campaign); }
}

function summarize(taxon: Taxon, points: Point[]): OrganismSummary {
  let reads = 0, best = 0, bestSia = "";
  for (const [index, value] of taxon.ocorrencias) {
    reads += value;
    const point = points[index], share = point.total > 0 ? value / point.total : 0;
    if (share > best || !bestSia) { best = share; bestSia = point.sia; }
  }
  return { name: taxon.nome, points: taxon.ocorrencias.length, sias: taxon.ocorrencias.map(([index]) => points[index].sia), reads, maxShare: best, maxShareSia: bestSia,
    ...(taxon.naoResolvido ? { unresolved: true } : {}), ...(taxon.categoria ? { category: taxon.categoria } : {}) };
}

/** Lista de uma campanha. As categorias de risco do 16S não são exclusivas e, por isso, nunca são somadas entre si. */
export function organismsCampaign(document: OrganismDocument): OrganismsCampaign {
  const markers = {} as OrganismsCampaign["markers"];
  for (const marker of ["16S", "COI"] as const) {
    const data = document.marcadores[marker];
    markers[marker] = {
      points: data.pontos.length, usablePoints: data.pontos.filter(point => point.total > 0 && !point.inconclusiva).length,
      inconclusive: data.pontos.filter(point => point.inconclusiva).map(point => point.sia),
      runs: [...new Set(data.pontos.map(point => point.corrida))].sort(),
      levels: Object.fromEntries(ORGANISM_LEVELS[marker].map(level => [level, (data.niveis[level] ?? []).map(taxon => summarize(taxon, data.pontos))
        .sort((a, b) => b.reads - a.reads || a.name.localeCompare(b.name, "pt-BR"))])) as OrganismsCampaign["markers"][OrganismMarker]["levels"],
    };
  }
  return { campaign: document.campaign, source: document.fonte.arquivo, markers };
}

/** Onde um organismo ocorre: reads e participação no total do marcador em cada SIA da campanha. */
export function organismOccurrences(document: OrganismDocument, marker: OrganismMarker, level: OrganismLevel, name: string): OrganismOccurrences | null {
  const data = document.marcadores[marker];
  const taxon = data?.niveis[level]?.find(item => item.nome === name);
  if (!data || !taxon) return null;
  return { campaign: document.campaign, marker, level, name, rows: taxon.ocorrencias.map(([index, reads]) => {
    const point = data.pontos[index];
    return { sia: point.sia, reads, total: point.total, share: point.total > 0 ? reads / point.total : null, run: point.corrida, inconclusive: point.inconclusiva };
  }).sort((a, b) => (b.share ?? 0) - (a.share ?? 0) || b.reads - a.reads) };
}
