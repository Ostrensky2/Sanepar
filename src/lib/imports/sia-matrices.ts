import type ExcelJS from "exceljs";
import type { JSZipObject, JSZipStreamHelper } from "jszip";
import { resolveCanonicalCampaign } from "@/lib/campaign-identity";
import { effectiveExecutionStatus, type FieldDiaryEntry } from "@/lib/field-diary";
import { parseInternalStorageUrl } from "./media-policy";
import { addFinalResults, civilDay, collectionDay, fieldWorkbookRows, type FieldFile, type IntegratedIndex } from "./sia-integrated-results";

type Scalar = string | number;
type Table = { headers: string[]; rows: Array<{ sia: string; values: Array<number | null> }> };
export type MatrixSource = {
  name: string; hash: string; campaign: number; marker: "16S" | "COI";
  rank: "familias" | "generos"; run: string; matrix: Table; associations: Table;
};
export type MatrixPackage = { sources: MatrixSource[]; notes: string[] };
export type MatrixIdentity = Pick<MatrixSource, "campaign" | "marker" | "rank" | "run">;
export function matrixIdentityFromName(name: string): MatrixIdentity | null {
  const match = name.split("/").pop()?.match(/^(16S|COI)_C([1-9])(?:_([a-z\d-]+))?_(familias|generos)\.xlsx$/i);
  return match ? { campaign: Number(match[2]), marker: match[1].toUpperCase() as MatrixIdentity["marker"], rank: match[4].toLowerCase() as MatrixIdentity["rank"], run: match[3] || "Não informada na fonte" } : null;
}
export async function matrixInputNames(files: Array<{ name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> }>) {
  if (files.length > 32 || files.reduce((n, f) => n + f.size, 0) > matrixLimits.inputBytes) throw new Error("Entrada excede 32 arquivos ou 32 MiB.");
  const names: string[] = [];
  for (const file of files) {
    if (/\.xlsx$/i.test(file.name)) names.push(file.name);
    else if (/\.zip$/i.test(file.name)) names.push(...[...inspectMatrixArchive(new Uint8Array(await file.arrayBuffer())).names].filter((name) => /\.xlsx$/i.test(name)));
    else throw new Error("Use ZIP ou XLSX.");
  }
  if (new Set(names).size !== names.length) throw new Error("Nomes de arquivos duplicados; selecione fontes inequívocas.");
  return names;
}
export type MatrixReferencePoint = { campaign: number; sia: string; original: { lat: number; lon: number } | null; effective: { lat: number; lon: number } | null; source: string; sourceDate: string; waterBody?: string; municipality?: string;
  sourceId?:string; sourceFileName?:string; sourcePointId?:string; sourceKind?:"field_workbook"|"historical_snapshot"; sourceDateRaw?:string; datePrecision?:"civil_day"|"unknown"; originalSia?:string; identityStatus?:"exact"|"ambiguous"; samplesReplicasEdna?:string; zooplanktonId?:string; collectionTime?:string; executionStatus?:string; fieldSampleId?:string; contextualCampaign?:boolean;
  sourceQualification?:"persisted_unverified"|"original_verified"|"historical_context"; verificationBasis?:string; sourceDigest?:string };
/** A coleta pode ter entrado por duas vias: o Diário de Campo (registro feito na coleta) ou a planilha de campanha (upload do Excel).
 * O Diário vale primeiro. Sem coleta real no Diário, vale a planilha, desde que traga UMA data para aquele SIA na campanha. */
export const SHEET_LINK = "PLANILHA_DE_CAMPANHA";
export function resolveSheetCollection(references: MatrixReferencePoint[], campaign: number, sia: string) {
  const matches = references.filter((point) => point.campaign === campaign && normalizeMatrixSia(point.sia) === sia && collectionDay(point));
  return new Set(matches.map((point) => point.sourceDate.trim())).size === 1 ? matches[0] : undefined;
}
export type DiarySnapshot = { entries: FieldDiaryEntry[]; persistence: string; complete?: boolean; totalCount?: number | null };
// A fonte do dia pode não fornecer coordenadas. Resolva cada tipo de par
// separadamente; duas metades de fontes distintas nunca formam um par.
function coordinateEvidence(matches: MatrixReferencePoint[], kind: "original" | "effective", entry?: FieldDiaryEntry) {
  const candidates = matches.flatMap((r) => {
    const p = r[kind];
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat)>90 || Math.abs(p.lon)>180 ||
        (kind === "effective" && ["planned","not_realized","blocked"].includes(r.executionStatus ?? ""))) return [];
    return [{...p, source:r.source, locator:r.sourcePointId || r.sourceId || "", date:r.sourceDate, diary:false, verified:r.sourceQualification === "original_verified"}];
  });
  const diaryKind = entry?.coordinateSource;
  if (entry && (kind === "original" ? diaryKind === "planned" : diaryKind === "gps" || diaryKind === "manual") &&
      String(entry.latitude ?? "").trim() && String(entry.longitude ?? "").trim()) {
    const lat = Number(entry.latitude), lon = Number(entry.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat)<=90 && Math.abs(lon)<=180)
      candidates.push({lat,lon,source:kind === "original" ? "Diário: coordenada planejada registrada" : String(diaryKind),locator:entry.id,date:entry.entryDate,diary:true,verified:false});
  }
  const conflict = new Set(candidates.map(p => JSON.stringify([p.lat,p.lon]))).size > 1;
  const alternatives = conflict ? [...new Set(candidates.map(p=>`(${p.lat}, ${p.lon}) — ${p.source} ${p.locator}`.trim()))].join("; ") : "";
  return {pair:conflict ? undefined : candidates.find(p=>p.verified) ?? candidates[0], conflict, alternatives, diary:candidates.some(p=>p.diary)};
}
export const matrixLimits = { inputBytes: 32 * 1024 * 1024, expandedBytes: 128 * 1024 * 1024, entries: 256, rows: 1000, columns: 5000 };
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function meaningful(value: unknown) {
  const text = String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return text && text !== "nao informado" ? String(value).trim() : "";
}
export function matrixExecutionStatus(entry: FieldDiaryEntry) {
  return effectiveExecutionStatus({ ...entry, activities: (entry.activities ?? []).filter((value) => Boolean(meaningful(value))), collectionTime: meaningful(entry.collectionTime), samplesReplicasEdna: meaningful(entry.samplesReplicasEdna), zooplanktonId: meaningful(entry.zooplanktonId) });
}

export function normalizeMatrixSia(value: unknown): string | null {
  const match = String(value ?? "").trim().match(/^(?:SIA[-\s]*)?0*(\d+)$/i);
  if (!match || Number(match[1]) <= 0 || !Number.isSafeInteger(Number(match[1]))) return null;
  return `SIA-${String(Number(match[1])).padStart(4, "0")}`;
}

/** Inspect the central directory BEFORE inflation, including XLSX's nested ZIP. */
export function inspectMatrixArchive(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) if (view.getUint32(end, true) === 0x06054b50) break;
  if (end < 0 || end < bytes.length - 65557) throw new Error("ZIP inválido.");
  const count = view.getUint16(end + 10, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || !count || count > matrixLimits.entries) throw new Error("ZIP multipartes, ZIP64 ou quantidade de arquivos não suportada.");
  let offset = view.getUint32(end + 16, true), expanded = 0;
  const names = new Set<string>();
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new Error("Diretório ZIP inválido.");
    const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true);
    const size = view.getUint32(offset + 24, true), compressed = view.getUint32(offset + 20, true);
    const length = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + length));
    if (!name || /[\\:\u0000]/.test(name) || name.startsWith("/") || name.split("/").some((p) => p === ".." || p === ".") || names.has(name)) throw new Error("Caminho ZIP inseguro ou duplicado.");
    names.add(name); expanded += size;
    if ((flags & 1) || ![0, 8].includes(method) || size === 0xffffffff || expanded > matrixLimits.expandedBytes || size > Math.max(1, compressed) * 500) throw new Error("ZIP criptografado ou limite de expansão excedido.");
    offset += 46 + length + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  return { expanded, names };
}

export function boundedInflate(entry: JSZipObject, budget: { bytes: number }): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0, failed = false;
    // JSZip 3 exposes this streaming API on ZipObject; its bundled typings omit it.
    const stream = (entry as JSZipObject & { internalStream(type: "uint8array"): JSZipStreamHelper<Uint8Array> }).internalStream("uint8array");
    stream.on("data", (chunk: Uint8Array) => {
      if (failed) return;
      size += chunk.length; budget.bytes += chunk.length;
      if (budget.bytes > matrixLimits.expandedBytes) {
        failed = true; stream.pause(); chunks.length = 0;
        reject(new Error("Expansão real excede 128 MiB; processamento interrompido.")); return;
      }
      chunks.push(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => {
      if (failed) return;
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      resolve(bytes);
    });
    stream.resume();
  });
}

async function loadMatrixWorkbook(bytes: Uint8Array, budget: { bytes: number }) {
  inspectMatrixArchive(bytes);
  const [{ default: JSZip }, { default: Excel }] = await Promise.all([import("jszip"), import("exceljs")]);
  const zip = await JSZip.loadAsync(bytes);
  // Same namespace compatibility as the official reader, without importing its server-only code.
  for (const file of Object.values(zip.files)) {
    if (file.dir) continue;
    const content = await boundedInflate(file, budget);
    if (!file.name.endsWith(".xml")) { zip.file(file.name, content); continue; }
    let xml = new TextDecoder().decode(content);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML com entidades externas não suportado.");
    xml = xml.replace(/(<\/?)(?:x:)/g, "$1")
      .replace('xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"')
      .replace('xmlns:ns1="http://schemas.openxmlformats.org/officeDocument/2006/relationships"', 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"')
      .replace(/\bns1:/g, "r:");
    zip.file(file.name, xml);
    await pause();
  }
  const workbook = new Excel.Workbook();
  const repaired = await zip.generateAsync({ type: "uint8array" });
  await workbook.xlsx.load(repaired as unknown as Parameters<typeof workbook.xlsx.load>[0], { ignoreNodes: ["extLst", "tableParts"] });
  return workbook;
}

function scalar(cell: ExcelJS.Cell): Scalar {
  if (typeof cell.value === "number" || typeof cell.value === "string") return cell.value;
  if (cell.value === null) return "";
  // Reject formulas (even cached), links, rich text and errors; never execute or flatten silently.
  throw new Error(`Célula ${cell.address}: tipo não suportado (fórmula/link/objeto).`);
}

async function readTable(sheet: ExcelJS.Worksheet): Promise<Table> {
  if (sheet.rowCount > matrixLimits.rows || sheet.columnCount > matrixLimits.columns) throw new Error("Matriz excede os limites de linhas/colunas.");
  const headers = Array.from({ length: sheet.columnCount }, (_, i) => String(scalar(sheet.getCell(1, i + 1))).trim());
  if (headers[0] !== "SIA" || headers.length < 2 || headers.some((h) => !h) || new Set(headers).size !== headers.length) throw new Error(`Cabeçalho inválido em ${sheet.name}.`);
  const rows: Table["rows"] = [], seen = new Set<string>();
  for (let r = 2; r <= sheet.rowCount; r++) {
    const sia = normalizeMatrixSia(scalar(sheet.getCell(r, 1)));
    if (!sia || seen.has(sia)) throw new Error(`SIA ausente/duplicado em ${sheet.name}, linha ${r}.`);
    seen.add(sia);
    const values = headers.slice(1).map((_, c) => {
      const value = scalar(sheet.getCell(r, c + 2));
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`Reads inválidos: ${sheet.name}, ${sia}, coluna ${c + 2}.`);
      return value;
    });
    rows.push({ sia, values });
    if (r % 8 === 0) await pause();
  }
  return { headers: headers.slice(1), rows };
}

export async function readMatrixPackage(files: Array<{ name: string; arrayBuffer(): Promise<ArrayBuffer>; size: number }>, progress: (message: string) => void = () => {}, identities: Record<string, MatrixIdentity> = {}) {
  if (!files.length || files.length > 32 || files.reduce((sum, f) => sum + f.size, 0) > matrixLimits.inputBytes) throw new Error("Envie até 32 arquivos e 32 MiB por preparação.");
  const { default: JSZip } = await import("jszip");
  const pending: Array<{ name: string; bytes: Uint8Array }> = [];
  const notes: string[] = [];
  let totalExpanded = 0;
  const budget = { bytes: 0 };
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    totalExpanded += inspectMatrixArchive(bytes).expanded;
    if (totalExpanded > matrixLimits.expandedBytes) throw new Error("Expansão total excede 128 MiB.");
    if (/\.xlsx$/i.test(file.name)) pending.push({ name: file.name, bytes });
    else if (/\.zip$/i.test(file.name)) {
      const zip = await JSZip.loadAsync(bytes);
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        if (/\.xlsx$/i.test(entry.name)) {
          const nested = await boundedInflate(entry, budget);
          totalExpanded += inspectMatrixArchive(nested).expanded;
          if (totalExpanded > matrixLimits.expandedBytes) throw new Error("Expansão total excede 128 MiB.");
          pending.push({ name: entry.name, bytes: nested });
        } else if (/\.(txt|csv)$/i.test(entry.name)) {
          const content = new TextDecoder().decode(await boundedInflate(entry, budget));
          if (content.length > 100000) throw new Error("Nota/CSV excede o limite de texto.");
          notes.push(`${entry.name}\n${content}`);
        } else throw new Error(`Arquivo não suportado no ZIP: ${entry.name}`);
      }
    } else throw new Error("Use ZIP ou XLSX.");
  }
  if (!pending.length || pending.length > 32) throw new Error("Quantidade de matrizes inválida.");
  const sources: MatrixSource[] = [], keys = new Set<string>();
  for (const file of pending) {
    const identity = identities[file.name] ?? matrixIdentityFromName(file.name);
    if (!identity || !Number.isInteger(identity.campaign) || identity.campaign < 1 || identity.campaign > 9 || !["16S", "COI"].includes(identity.marker) || !["familias", "generos"].includes(identity.rank) || !identity.run.trim()) throw new Error(`Identifique campanha, marcador, nível e corrida de ${file.name} antes de conferir.`);
    const { marker, campaign, rank, run } = identity;
    const key = `${campaign}/${marker}/${run.toLowerCase()}/${rank}`;
    if (keys.has(key)) throw new Error(`Dataset duplicado: ${key}. Nenhuma soma aplicada.`);
    keys.add(key); progress(`Lendo ${file.name} (${sources.length + 1}/${pending.length})`); await pause();
    const workbook = await loadMatrixWorkbook(file.bytes, budget);
    const matrixSheet = workbook.getWorksheet(rank === "familias" ? "Famílias" : "Gêneros");
    const associationsSheet = workbook.getWorksheet(marker === "16S" ? "Grupos de risco" : "Exóticas");
    if (!matrixSheet || !associationsSheet || workbook.worksheets.length !== 2) throw new Error(`Abas incompatíveis: ${file.name}.`);
    const matrix = await readTable(matrixSheet), associations = await readTable(associationsSheet);
    const bySia = new Map(associations.rows.map((row) => [row.sia, row.values]));
    const totalColumn = associations.headers.indexOf(`Total de reads ${marker}`);
    if (totalColumn < 0 || matrix.rows.length !== bySia.size) throw new Error(`Total/cobertura ausente: ${file.name}.`);
    for (const row of matrix.rows) {
      const association = bySia.get(row.sia), total = row.values.reduce<number>((a, b) => a + (b ?? 0), 0), expected = association?.[totalColumn];
      if (!Number.isSafeInteger(total) || typeof expected !== "number" || (marker === "16S" ? total !== expected : total > expected)) throw new Error(`Contagens não reconciliam: ${file.name}, ${row.sia}.`);
    }
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", file.bytes as Uint8Array<ArrayBuffer>)), (b) => b.toString(16).padStart(2, "0")).join("");
    sources.push({ name: file.name, hash, campaign, marker, rank, run, matrix, associations });
  }
  for (const source of sources) {
    const sibling = sources.find((s) => s !== source && s.campaign === source.campaign && s.marker === source.marker && s.run.toLowerCase() === source.run.toLowerCase());
    const canonical = (table: Table) => JSON.stringify({ headers: table.headers, rows: [...table.rows].sort((a, b) => a.sia.localeCompare(b.sia)) });
    if (sibling && canonical(source.associations) !== canonical(sibling.associations)) throw new Error(`Associações divergentes entre família e gênero: C${source.campaign}/${source.marker}/${source.run}.`);
  }
  return { sources, notes } satisfies MatrixPackage;
}

export function resolveMatrixCollection(snapshot: DiarySnapshot, campaign: number, sia: string) {
  if (snapshot.persistence !== "cloud" || snapshot.complete !== true || snapshot.totalCount !== snapshot.entries.length) return { status: "DIÁRIO_INCOMPLETO" } as const;
  const canonical = resolveCanonicalCampaign(campaign);
  const candidates = snapshot.entries.filter((entry) => {
    const id = resolveCanonicalCampaign(entry.campaignId), name = resolveCanonicalCampaign(entry.campaignName);
    return normalizeMatrixSia(entry.sia) === sia && (id?.id === canonical?.id || name?.id === canonical?.id);
  });
  if (candidates.some((entry) => {
    const id = resolveCanonicalCampaign(entry.campaignId), name = resolveCanonicalCampaign(entry.campaignName);
    return (Boolean(entry.campaignId) && id?.id !== canonical?.id) || (Boolean(entry.campaignName) && name?.id !== canonical?.id);
  })) return { status: "IDENTIDADE_CONFLITANTE" } as const;
  const real = candidates.filter((entry) => ["realized", "relocated"].includes(matrixExecutionStatus(entry)));
  if (real.length > 1) return { status: "COLETA_AMBÍGUA" } as const;
  if (real.length === 0) return { status: "SEM_COLETA_REAL_CONFIRMADA" } as const;
  return { status: "COLETA_ÚNICA", entry: real[0] } as const;
}

export function legitimateMatrixPhotos(entry: FieldDiaryEntry) {
  return [...new Set((entry.photos ?? []).flatMap((photo) => {
    const ref = parseInternalStorageUrl(photo.url, "photos");
    return ref ? [`/api/documents/file?bucket=photos&path=${encodeURIComponent(ref.path)}`] : [];
  }))].join("\n");
}

/** Text stays typed as text in XLSX; never assign an ExcelJS formula/hyperlink object. */
export function matrixText(value: unknown): string {
  const text = Array.isArray(value) ? value.join("; ") : String(value ?? "");
  if (text.length > 32767) throw new Error("Texto excede o limite de uma célula Excel.");
  return text;
}

export async function buildCampaignMatrixWorkbook(pkg: MatrixPackage, snapshot: DiarySnapshot, campaign: number, progress: (message: string) => void = () => {}, references: MatrixReferencePoint[] = [], referenceContext?: { status?: string; source?: string; limitation?: string | null }, index?: IntegratedIndex, fieldFile?: FieldFile) {
  const sources = pkg.sources.filter((source) => source.campaign === campaign);
  if (!sources.length) throw new Error(`C${campaign}: nenhum dataset fornecido.`);
  if (snapshot.complete !== true || snapshot.persistence !== "cloud" || snapshot.totalCount !== snapshot.entries.length) throw new Error("Diário incompleto ou sem confirmação da contagem. Recarregue após disponibilização da leitura completa; nenhum vínculo foi presumido.");
  const { default: Excel } = await import("exceljs");
  if (fieldFile) {
    if (!/\.xlsx$/i.test(fieldFile.name) || fieldFile.size > matrixLimits.inputBytes) throw Error("Esperada planilha de campo XLSX de até 32 MiB.");
    const declared = /campanha[\s_-]*([1-9])(?!\d)/i.exec(fieldFile.name);
    if (declared && Number(declared[1]) !== campaign) throw Error("Campanha no nome da planilha de campo diverge da seleção.");
    const buffer = await fieldFile.arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",buffer)),b=>b.toString(16).padStart(2,"0")).join("");
    references = [...references,...fieldWorkbookRows(await loadMatrixWorkbook(new Uint8Array(buffer),{bytes:0}),fieldFile.name,hash,campaign)];
  }
  const workbook = new Excel.Workbook(); workbook.creator = "Yva’e";
  const add = (name: string, headers: string[]) => {
    const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
    sheet.addRow(headers.map(matrixText));
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF173D4C" } };
    sheet.getRow(1).alignment = { wrapText: true, vertical: "middle" }; sheet.getRow(1).height = 48;
    sheet.columns.forEach((column, i) => { column.width = i === 0 ? 16 : 24; });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
    return sheet;
  };
  const summary = add("Resumo", ["Item", "Valor"]);
  summary.getColumn(2).width = 90;
  summary.addRows([
    ["Campanha", resolveCanonicalCampaign(campaign)?.name ?? `C${campaign}`],
    ["Uso", "Preparação local. Não é publicação nem workbook oficial de índices."],
    ["Chave", "Resultado final: campanha + SIA. Visitas e réplicas: data civil, identificador de coleta e identificadores literais da fonte; data isolada não comprova vínculo da biblioteca com visita ou réplica."],
    ["Reads", "Contagens preservadas. Família/gênero e plataformas/runs não são somados. Zero com biblioteca presente não é ausência de biblioteca."],
    ["Associações", "Categorias de risco se sobrepõem. Rótulos de exóticas/candidatas/status pendente mantidos integralmente, sem inferir espécie, sexo ou índice."],
    ["Coordenadas", "Planejadas separadas das efetivas. Origem desconhecida não é GPS nem coordenada efetiva confirmada."],
    ["Diário", `${snapshot.totalCount} entradas; resposta completa confirmada`],
  ]);
  const fields = add("Coletas", ["SIA", "Vínculo", "ID Diário", "Data", "Hora", "Ponto / corpo hídrico", "Município", "Situação", "Latitude referência", "Longitude referência", "Latitude efetiva", "Longitude efetiva", "Origem coordenada", "Latitude sem origem", "Longitude sem origem", "Precisão GPS (m)", "Réplicas eDNA", "Zooplâncton", "Atividades", "Acessibilidade", "Ocorrência", "Descrição ocorrência", "Follow-up", "Notas follow-up", "Resumo de campo", "Fotos internas", "Fonte referência", "Data fonte referência", "Evidência execução"]);
  const matrixSias = sources.flatMap((source) => source.matrix.rows.map((row) => row.sia));
  const campaignId = resolveCanonicalCampaign(campaign)?.id;
  const diarySias = snapshot.entries.filter((entry) =>
    ["realized", "relocated"].includes(matrixExecutionStatus(entry)) &&
    (resolveCanonicalCampaign(entry.campaignId)?.id === campaignId || resolveCanonicalCampaign(entry.campaignName)?.id === campaignId),
  ).flatMap((entry) => { const sia = normalizeMatrixSia(entry.sia); return sia ? [sia] : []; });
  const allSias = [...new Set(matrixSias)].sort();
  const visits = add("Evidências de campo", ["Campanha","SIA original","SIA exato","Origem","Identificador da fonte","Linha ou visita","Situação registrada","Data na fonte","Dia documentado na fonte (não data da biblioteca)","Precisão da data registrada","Amostra de campo","Réplicas eDNA (literal)","ID zooplâncton","Hora registrada","Escopo da campanha"]);
  const fieldRefs = references.filter(r=>r.campaign===campaign);
  // Flag a legacy concatenation only when the original composite is actually present.
  // This is a negative check, never a way to manufacture either component SIA.
  const suspectConcatenations=new Set(fieldRefs.flatMap(r=>{
    const m=/^(\d+)\s*\/\s*(\d+)\*?$/.exec((r.originalSia??r.sia).trim());
    return m?[normalizeMatrixSia(m[1]+m[2])]:[];
  }));
  for (const r of fieldRefs) visits.addRow([campaign,r.originalSia??r.sia,r.identityStatus==="ambiguous"?"":normalizeMatrixSia(r.sia)??"",r.source,r.sourceId??"",r.sourcePointId??"",r.executionStatus??"",r.sourceDateRaw??r.sourceDate,collectionDay(r),r.datePrecision==="civil_day"?"dia civil":"não comprovada",r.fieldSampleId??"",r.samplesReplicasEdna??"",r.zooplanktonId??"",r.collectionTime??"",r.verificationBasis || "Contextual; não estabelece visita"]);
  const diaryForCampaign = snapshot.entries.filter(e=>resolveCanonicalCampaign(e.campaignId || e.campaignName)?.id===campaignId);
  for (const e of diaryForCampaign) {
    const state=matrixExecutionStatus(e), day=e.executionStatus && ["realized","relocated"].includes(e.executionStatus)?civilDay(e.entryDate):"";
    const suspect=suspectConcatenations.has(normalizeMatrixSia(e.sia));
    visits.addRow([campaign,e.sia,suspect?"":normalizeMatrixSia(e.sia)??"","Diário de Campo","",e.id,state,e.entryDate,suspect?"":day,day?"dia civil":"","",e.samplesReplicasEdna??"",e.zooplanktonId??"",e.collectionTime??"",suspect?"Possível concatenação legada de código composto; não atribuir ponto.":""]);
  }
  const link = (sia:string) => {
    const resolution=resolveMatrixCollection(snapshot,campaign,sia), entry=resolution.entry;
    const rr=fieldRefs.filter(r=>normalizeMatrixSia(r.sia)===sia && collectionDay(r));
    const diaryDay=entry && (entry.executionStatus==="realized" || entry.executionStatus==="relocated")?civilDay(entry.entryDate):"";
    const days=new Set(rr.map(collectionDay));
    const negative=diaryForCampaign.some(e=>normalizeMatrixSia(e.sia)===sia && ["not_realized","blocked"].includes(matrixExecutionStatus(e)) && days.has(civilDay(e.entryDate)));
    const suspect=suspectConcatenations.has(sia);
    const invalid=suspect || resolution.status==="COLETA_AMBÍGUA" || resolution.status==="IDENTIDADE_CONFLITANTE";
    const day=invalid?"":diaryDay || (days.size===1&&!negative?[...days][0]:"");
    const status=suspect?"IDENTIDADE COMPOSTA NÃO RESOLVIDA":invalid?resolution.status:diaryDay?"VISITA REALIZADA NO DIÁRIO":day?"DIA DOCUMENTADO NO CAMPO; NÃO CONFIRMA EXECUÇÃO NO DIÁRIO":days.size>1 || negative?"VISITA CONFLITANTE":"SEM DIA DE VISITA COMPROVADO";
    const primaryConflict=Boolean(diaryDay && [...days].some(d=>d!==diaryDay)) || days.size>1 || negative;
    const contextual=fieldRefs.filter(r=>r.identityStatus!=="ambiguous" && normalizeMatrixSia(r.sia)===sia&&!collectionDay(r) && r.datePrecision==="civil_day");
    const referenceDays=[...new Set(contextual.map(r=>civilDay(r.sourceDate)).filter(Boolean))].sort().join("; ");
    const detail=primaryConflict?[...rr.map(r=>`${r.source} · ${r.sourcePointId??""}: ${collectionDay(r)}`),...diaryForCampaign.filter(e=>normalizeMatrixSia(e.sia)===sia && e.executionStatus).map(e=>`Diário ${e.id}: ${e.entryDate} (${e.executionStatus})`)]:[];
    const warning=[primaryConflict?`Divergência de fonte/visita: ${[...new Set(detail)].join("; ")}. Não identifica a amostra molecular.`:"",contextual.some(r=>civilDay(r.sourceDate) && civilDay(r.sourceDate)!==day)?"Datas de referência conservadas em Resultados finais e Evidências de campo; não estabelecem nem invalidam visita.":""].filter(Boolean).join(" ");
    return {day,status,warning,referenceDays,diaryDay,source:day?(diaryDay?`Diário de Campo: ${entry!.id}`:[...new Set(rr.map(r=>`${r.source} · ${r.sourcePointId??""}`))].join("; ")):""};
  };
  const finalSheet=add("Resultados finais",["Campanha","SIA","Estado 0.7","Índice geral (como exibido)","Faixa de incerteza","Cobertura","Faixa","Posição","Ambiental","Operacional","Saúde humana","Versão","SHA-256 das linhas","Dia da visita documentada no ponto (não é data laboratorial)","Precisão","Fonte do dia de campo","Situação da visita documental","Vínculo do índice a visita/réplica","Geral integral","Ambiental integral","Operacional integral","Saúde humana integral"]);
  finalSheet.getCell("W1").value="Dia(s) de referência declarados (não comprovam visita)";
  finalSheet.getCell("X1").value="Ressalva das fontes";
  const finalResultCount=addFinalResults(finalSheet,index,campaign,allSias,normalizeMatrixSia,link);
  summary.addRow(["Resultados finais da saída versionada (linhas)",index?finalResultCount:"Fonte não consultada"]);
  const sheetSias=allSias.filter(sia=>link(sia).day && !link(sia).diaryDay);
  const diagnostics = add("Pendências", ["SIA / dataset", "Condição"]);
  for (const r of fieldRefs.filter(r=>r.identityStatus==="ambiguous" || !normalizeMatrixSia(r.sia))) {
    diagnostics.addRow([r.originalSia??r.sia,"Identidade de campo ambígua; registro literal em Evidências de campo, sem desmembrar nem atribuir biblioteca."]);
  }
  const trace=add("Vínculos laboratoriais",["Campanha","SIA","Marcador","Corrida","Nível taxonômico","Matriz de origem","SHA-256 da matriz","Situação da visita no ponto","Dia da visita (contexto, não atribuição à biblioteca)","Precisão","Fonte do dia de campo","Vínculo biblioteca → visita/réplica"]);
  for(const s of sources) for(const row of s.matrix.rows){
    const l=link(row.sia);
    trace.addRow([campaign,row.sia,s.marker,s.run,s.rank,s.name,s.hash,l.status,l.day,l.day?"dia civil":"",l.source,"Não identificada na matriz por SIA; sem atribuição individual"]);
  }
  if (referenceContext && (referenceContext.limitation || referenceContext.status !== "published")) {
    diagnostics.addRow(["Referências de coordenadas", matrixText(`Estado: ${referenceContext.status ?? "não informado"}. Fonte: ${referenceContext.source ?? "não informada"}. ${referenceContext.limitation ?? "Completude não comprovada."} Referências retornadas: ${references.length}; lista vazia não comprova ausência de coordenadas.`)]);
  }
  const unconfirmed = snapshot.entries.filter((entry) => !entry.executionStatus &&
    !["realized", "relocated"].includes(matrixExecutionStatus(entry)) &&
    (resolveCanonicalCampaign(entry.campaignId)?.id === campaignId || resolveCanonicalCampaign(entry.campaignName)?.id === campaignId));
  for (const sia of new Set(unconfirmed.map((entry) => normalizeMatrixSia(entry.sia) ?? "SIA não informado"))) {
    diagnostics.addRow([sia, "Registro do Diário sem confirmação de coleta"]);
  }
  for (const sia of new Set(diarySias)) {
    if (!matrixSias.includes(sia)) diagnostics.addRow([sia, "Coleta registrada no Diário sem biblioteca em nenhuma matriz fornecida"]);
  }
  for (const sia of allSias) {
    const resolution = resolveMatrixCollection(snapshot, campaign, sia);
    const e = resolution.entry?.executionStatus && ["realized","relocated"].includes(resolution.entry.executionStatus) ? resolution.entry : undefined;
    const l=link(sia);
    if(!l.day) diagnostics.addRow([sia,l.status]);
    if(l.warning) diagnostics.addRow([sia,l.warning]);
    const matches = suspectConcatenations.has(sia) ? [] : references.filter(p => !p.contextualCampaign && p.identityStatus !== "ambiguous" && p.campaign === campaign && normalizeMatrixSia(p.sia) === sia);
    const original = coordinateEvidence(matches, "original", e);
    const effectiveRef = coordinateEvidence(matches, "effective", e);
    if (original.conflict) diagnostics.addRow([sia, "Coordenadas de referência conflitantes: " + original.alternatives]);
    if (effectiveRef.conflict) diagnostics.addRow([sia, "Coordenadas efetivas conflitantes: " + effectiveRef.alternatives]);
    if (!e) {
      const sheetRef = l.day ? resolveSheetCollection(references, campaign, sia) : undefined;
      if (sheetRef && l.day) {
        fields.addRow([sia, SHEET_LINK, "", sheetRef.sourceDate, "", sheetRef.waterBody ?? "", sheetRef.municipality ?? "", "planilha de campanha",
          original.pair?.lat ?? "", original.pair?.lon ?? "", effectiveRef.pair?.lat ?? "", effectiveRef.pair?.lon ?? "", effectiveRef.pair ? matrixText(effectiveRef.pair.source) : "",
          ...Array(13).fill(""), matrixText(original.pair?.source ?? ""), matrixText(original.pair?.date ?? "")]);
        diagnostics.addRow([sia, "Coleta vinculada pela planilha de campanha; sem registro no Diário"]);
        continue;
      }
      const reason=resolution.entry?"SEM EXECUÇÃO EXPLÍCITA NO DIÁRIO":resolution.status;
      fields.addRow([sia, reason]); diagnostics.addRow([sia, reason]); continue;
    }
    if (!original.pair && !original.conflict) diagnostics.addRow([sia, "Coordenada de referência não fornecida"]);
    const planned = e.coordinateSource === "planned";
    const legacyEffective = !e.coordinateSource && Boolean(String(e.latitude ?? "").trim() && String(e.longitude ?? "").trim() && effectiveRef.pair && Number(e.latitude) === effectiveRef.pair.lat && Number(e.longitude) === effectiveRef.pair.lon);
    const effective = effectiveRef.pair && (effectiveRef.diary || legacyEffective);
    const fieldEffective = effectiveRef.pair?.verified ? effectiveRef.pair : undefined;
    fields.addRow([sia, resolution.status, e.id, e.entryDate, e.collectionTime, e.locationName, e.municipality, matrixExecutionStatus(e),
      original.pair?.diary ? e.latitude : original.pair?.lat ?? "", original.pair?.diary ? e.longitude : original.pair?.lon ?? "", effective ? e.latitude : fieldEffective?.lat ?? "", effective ? e.longitude : fieldEffective?.lon ?? "", legacyEffective ? "Diário legado: par efetivo conferido na fonte de campo" : !effective && fieldEffective ? fieldEffective.source : e.coordinateSource,
      !planned && !effective ? e.latitude : "", !planned && !effective ? e.longitude : "", e.gpsAccuracyM ?? "", e.samplesReplicasEdna, e.zooplanktonId,
      matrixText(e.activities), e.pointAccessibility, e.occurrenceType, e.occurrenceDescription, e.requiresFollowUp, e.followUpNotes, e.dailySummary, legitimateMatrixPhotos(e), original.pair?.source ?? "", original.pair?.date ?? "", e.executionStatus ? "Situação explícita do Diário" : "Regra legada effectiveExecutionStatus: dados operacionais do Diário"].map((v) => typeof v === "number" ? v : matrixText(v)));
  }
  for (const marker of ["16S", "COI"] as const) {
    for (const rank of ["familias", "generos"] as const) {
      const group = sources.filter((source) => source.marker === marker && source.rank === rank);
      const headers = [...new Set(group.flatMap((source) => source.matrix.headers))];
      const sheet = add(`${marker} ${rank}`, ["SIA", "Plataforma / run da fonte", "Biblioteca", ...headers]);
      if (!group.length) diagnostics.addRow([`${marker}/${rank}`, "DATASET_NÃO_FORNECIDO"]);
      for (const source of group) {
        const indexes = headers.map((header) => source.matrix.headers.indexOf(header));
        for (const [index, row] of source.matrix.rows.entries()) {
          sheet.addRow([row.sia, source.run, row.values.includes(null) ? "PRESENTE_COM_TÁXONS_AUSENTES" : "PRESENTE", ...indexes.map((i) => i < 0 ? "" : row.values[i])]);
          if (index % 8 === 0) { progress(`Preparando C${campaign}: ${marker}/${rank}`); await pause(); }
        }
        const present = new Set(source.matrix.rows.map((row) => row.sia));
        for (const sia of allSias) if (!present.has(sia)) { sheet.addRow([sia, source.run, "BIBLIOTECA_AUSENTE"]); diagnostics.addRow([`${sia}/${marker}/${rank}/${source.run}`, "Biblioteca ausente, não zero"]); }
      }
    }
    const group = sources.filter((source, i) => source.marker === marker && sources.findIndex((s) => s.marker === marker && s.run.toLowerCase() === source.run.toLowerCase()) === i);
    const headers = [...new Set(group.flatMap((source) => source.associations.headers))];
    const sheet = add(marker === "16S" ? "Associações 16S" : "Exóticas COI", ["SIA", "Plataforma / run da fonte", ...headers]);
    for (const source of group) {
      const indexes = headers.map((header) => source.associations.headers.indexOf(header));
      for (const row of source.associations.rows) sheet.addRow([row.sia, source.run, ...indexes.map((i) => i < 0 ? "" : row.values[i])]);
    }
  }
  const provenance = add("Fontes", ["Arquivo", "SHA-256", "Campanha", "Marcador", "Nível", "Plataforma / run", "Bibliotecas"]);
  sources.forEach((source) => provenance.addRow([source.name, source.hash, campaign, source.marker, source.rank, source.run, source.matrix.rows.length]));
  const notes = add("Notas da fonte", ["Texto original"]); notes.getColumn(1).width = 100;
  pkg.notes.forEach((note) => note.split(/\r?\n/).forEach((line) => notes.addRow([matrixText(line)])));
  progress(`Serializando XLSX C${campaign}…`); await pause();
  const bytes = await workbook.xlsx.writeBuffer();
  const preview = workbook.worksheets.map((sheet) => ({
    name: sheet.name, rowCount: sheet.rowCount, columnCount: sheet.columnCount,
    rows: Array.from({ length: Math.min(21, sheet.rowCount) }, (_, r) =>
      Array.from({ length: Math.min(12, sheet.columnCount) }, (_, c) => sheet.getRow(r + 1).getCell(c + 1).text)),
  }));
  return { bytes, preview, finalResultCount, filename: `matrizes-SIA-C${campaign}-${new Date().toISOString().slice(0, 10)}.xlsx`, points: allSias.length, linkedByDiary: allSias.filter((sia) => link(sia).day && link(sia).diaryDay).length, linkedBySheet: sheetSias.length, referenceOnlySias:allSias.filter(sia=>!link(sia).day && link(sia).referenceDays),
    // Pontos cuja data veio só da planilha de campanha (não confirmam coleta no Diário) e pontos sem data em nenhuma via.
    sheetSias, unresolvedSias: allSias.filter((sia) => !link(sia).day),
    unresolved: allSias.filter((sia) => !link(sia).day).length };
}
