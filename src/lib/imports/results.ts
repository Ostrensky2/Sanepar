import { Buffer } from "node:buffer";
import ExcelJS from "exceljs";
import {
  RESULTS_DASHBOARD_HEADERS,
  RESULTS_DASHBOARD_SECTIONS,
  RESULTS_DICTIONARY_HEADERS,
  RESULTS_INSTRUCTION_FIELDS,
  RESULTS_INSTRUCTION_HEADERS,
  RESULTS_MOLECULAR_FIELDS,
  RESULTS_RANKING_FIELDS,
  RESULTS_SCHEMA_VERSION,
  RESULTS_WORKSHEETS,
  isResultsViewModel,
  type MolecularResultRow,
  type RankingResultRow,
  type ResultsViewModel,
  type ResultsWorkbookMetadata,
} from "@/lib/imports/results-contract";
import { normalizeLaboratoryRiskLevel, type LaboratoryRiskResultRow } from "@/lib/laboratory-risk";

type WorkbookBinary = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];

export const RESULTS_WORKSHEET_NAME = RESULTS_WORKSHEETS.molecular;
export const RANKING_WORKSHEET_NAME = RESULTS_WORKSHEETS.ranking;
export const RESULT_EXPECTED_HEADERS = RESULTS_MOLECULAR_FIELDS.map((field) => field.header);
export const RANKING_EXPECTED_HEADERS = RESULTS_RANKING_FIELDS.map((field) => field.header);

export type LaboratoryResultsImport = {
  fileName: string;
  worksheetName: string;
  rankingWorksheetName: string;
  rowCount: number;
  sheetCount: number;
  columnCount: number;
  expectedColumnCount: number;
  headers: string[];
  matchedHeaders: number;
  markers: string[];
  analyzedSets: string[];
  speciesCount: number;
  metadata: ResultsWorkbookMetadata;
  molecularRows: MolecularResultRow[];
  rankingRows: RankingResultRow[];
  riskRows: LaboratoryRiskResultRow[];
  viewModel: ResultsViewModel;
};

export async function parseLaboratoryResultsWorkbook(buffer: ArrayBuffer, fileName: string): Promise<LaboratoryResultsImport> {
  const extension = fileName.toLowerCase().split(".").pop();
  if (extension !== "xlsx" && extension !== "xlsm") throw new Error("A planilha de Resultados deve ser enviada em formato .xlsx ou .xlsm.");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(buffer) as unknown as WorkbookBinary, { ignoreNodes: ["tableParts"] });
  const instructions = requiredWorksheet(workbook, RESULTS_WORKSHEETS.instructions);
  const dictionary = requiredWorksheet(workbook, RESULTS_WORKSHEETS.dictionary);
  const molecular = requiredWorksheet(workbook, RESULTS_WORKSHEETS.molecular);
  const ranking = requiredWorksheet(workbook, RESULTS_WORKSHEETS.ranking);
  const dashboard = requiredWorksheet(workbook, RESULTS_WORKSHEETS.dashboard);
  const metadata = parseInstructions(instructions);

  validateDictionary(dictionary);
  const molecularRows = parseMolecularRows(molecular);
  const rankingRows = parseRankingRows(ranking, molecularRows, metadata);
  const viewModel = parseDashboardViewModel(dashboard, metadata);
  const riskRows = rankingRows.flatMap(toLegacyRiskRow);

  return {
    fileName,
    worksheetName: molecular.name,
    rankingWorksheetName: ranking.name,
    rowCount: molecularRows.length,
    sheetCount: workbook.worksheets.length,
    columnCount: molecular.actualColumnCount,
    expectedColumnCount: RESULT_EXPECTED_HEADERS.length,
    headers: readHeaderRow(molecular),
    matchedHeaders: RESULT_EXPECTED_HEADERS.length,
    markers: [...new Set(molecularRows.map((row) => row.marker))].sort(),
    analyzedSets: [...new Set(molecularRows.map((row) => row.analyzedSet))].sort(),
    speciesCount: new Set(molecularRows.map((row) => row.taxon)).size,
    metadata,
    molecularRows,
    rankingRows,
    riskRows,
    viewModel,
  };
}

function parseInstructions(worksheet: ExcelJS.Worksheet): ResultsWorkbookMetadata {
  validateHeaders(worksheet, RESULTS_INSTRUCTION_HEADERS);
  const values = new Map<string, string>();
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const key = cell(worksheet.getRow(rowNumber), 1);
    const value = cell(worksheet.getRow(rowNumber), 2);
    if (!key && !value) continue;
    if (!key || values.has(key)) fail(worksheet, rowNumber, "Chave", "chave ausente ou duplicada");
    values.set(key, value);
  }
  for (const field of RESULTS_INSTRUCTION_FIELDS) if (!values.get(field.key)) throw new Error(`A aba ${worksheet.name} deve informar ${field.key}.`);
  if (values.get("schema_version") !== RESULTS_SCHEMA_VERSION) throw new Error(`Versão de schema inválida. Esperado ${RESULTS_SCHEMA_VERSION}.`);

  const campaignId = values.get("campaign_id")!;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,79}$/.test(campaignId)) throw new Error("campaign_id inválido na aba Instruções.");
  const campaignNumber = Number(values.get("campaign_number"));
  if (!Number.isInteger(campaignNumber) || campaignNumber < 1) throw new Error("campaign_number deve ser um inteiro positivo.");
  const publicationStatus = values.get("publication_status");
  if (publicationStatus !== "draft" && publicationStatus !== "published") throw new Error("publication_status deve ser draft ou published.");

  return {
    schemaVersion: RESULTS_SCHEMA_VERSION,
    campaignId,
    campaignNumber,
    campaignTitle: values.get("campaign_title")!,
    publicationStatus,
    methodology: { origin: values.get("methodology_origin")!, version: values.get("methodology_version")! },
  };
}

function validateDictionary(worksheet: ExcelJS.Worksheet) {
  validateHeaders(worksheet, RESULTS_DICTIONARY_HEADERS);
  const entries = new Set<string>();
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const sheet = cell(worksheet.getRow(rowNumber), 1);
    const column = cell(worksheet.getRow(rowNumber), 2);
    if (sheet || column) entries.add(`${sheet}|${column}`);
  }
  const expected = [
    ...RESULTS_INSTRUCTION_FIELDS.map((field) => `${RESULTS_WORKSHEETS.instructions}|${field.key}`),
    ...RESULTS_MOLECULAR_FIELDS.map((field) => `${RESULTS_WORKSHEETS.molecular}|${field.header}`),
    ...RESULTS_RANKING_FIELDS.map((field) => `${RESULTS_WORKSHEETS.ranking}|${field.header}`),
    ...RESULTS_DASHBOARD_SECTIONS.map((section) => `${RESULTS_WORKSHEETS.dashboard}|${section}`),
  ];
  const missing = expected.filter((entry) => !entries.has(entry));
  if (missing.length) throw new Error(`A aba Dicionário não documenta ${missing.slice(0, 3).join(", ")}.`);
}

function parseMolecularRows(worksheet: ExcelJS.Worksheet): MolecularResultRow[] {
  validateHeaders(worksheet, RESULT_EXPECTED_HEADERS);
  const rows: MolecularResultRow[] = [];
  const unique = new Set<string>();
  const sampleSignatures = new Map<string, string>();

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    if (!cell(row, 1)) continue;
    const marker = requiredEnum(worksheet, rowNumber, "Marcador", cell(row, 14), ["16S", "COI"] as const);
    const analyzedSet = requiredEnum(worksheet, rowNumber, "Conjunto analisado", cell(row, 15), ["Cianobactérias", "Bactérias", "COI"] as const);
    if ((marker === "COI") !== (analyzedSet === "COI")) fail(worksheet, rowNumber, "Marcador/Conjunto analisado", "combinação incompatível");
    const originalLatitude = optionalNumber(worksheet, rowNumber, "Latitude original", cell(row, 6), -90, 90);
    const originalLongitude = optionalNumber(worksheet, rowNumber, "Longitude original", cell(row, 7), -180, 180);
    const effectiveLatitude = optionalNumber(worksheet, rowNumber, "Latitude efetiva", cell(row, 8), -90, 90);
    const effectiveLongitude = optionalNumber(worksheet, rowNumber, "Longitude efetiva", cell(row, 9), -180, 180);
    validateCoordinatePair(worksheet, rowNumber, "original", originalLatitude, originalLongitude);
    validateCoordinatePair(worksheet, rowNumber, "efetiva", effectiveLatitude, effectiveLongitude);

    const result: MolecularResultRow = {
      sampleId: requiredText(worksheet, rowNumber, "Identificação da amostra", cell(row, 1)),
      siaId: requiredText(worksheet, rowNumber, "Cód. SIA", cell(row, 2)),
      sampleDate: requiredDate(worksheet, rowNumber, "Data", row.getCell(3).value),
      waterBody: requiredText(worksheet, rowNumber, "Manancial / Corpo Hídrico", cell(row, 4)),
      municipality: requiredText(worksheet, rowNumber, "Município", cell(row, 5)),
      originalLatitude, originalLongitude, effectiveLatitude, effectiveLongitude,
      accessibility: cell(row, 10), turbidity: cell(row, 11), description: cell(row, 12), weatherConditions: cell(row, 13),
      marker, analyzedSet,
      taxon: requiredText(worksheet, rowNumber, "Espécie", cell(row, 16)),
      taxonomicGroup: cell(row, 17),
      attentionTags: parseTags(worksheet, rowNumber, "Tags de atenção", cell(row, 18)),
      associationNote: cell(row, 19),
      invasiveExotic: optionalBoolean(worksheet, rowNumber, "Exótico/invasor", cell(row, 20)),
      reads: requiredInteger(worksheet, rowNumber, "Número de Reads", cell(row, 21), 0),
      readsPercent: requiredNumber(worksheet, rowNumber, "% Reads", cell(row, 22), 0, 100),
    };
    const key = [result.sampleId, result.marker, result.analyzedSet, result.taxon].join("|").toLocaleLowerCase("pt-BR");
    if (unique.has(key)) fail(worksheet, rowNumber, "Amostra/Marcador/Conjunto/Espécie", "chave duplicada");
    unique.add(key);
    const signature = JSON.stringify([result.siaId, result.sampleDate, result.waterBody, result.municipality, result.originalLatitude, result.originalLongitude, result.effectiveLatitude, result.effectiveLongitude]);
    if (sampleSignatures.has(result.sampleId) && sampleSignatures.get(result.sampleId) !== signature) fail(worksheet, rowNumber, "Identificação da amostra", "metadados divergentes para a mesma amostra");
    sampleSignatures.set(result.sampleId, signature);
    rows.push(result);
  }
  if (!rows.length) throw new Error(`A aba ${worksheet.name} não possui resultados moleculares.`);
  return rows;
}

function parseRankingRows(worksheet: ExcelJS.Worksheet, molecularRows: MolecularResultRow[], metadata: ResultsWorkbookMetadata): RankingResultRow[] {
  validateHeaders(worksheet, RANKING_EXPECTED_HEADERS);
  const sampleIds = new Set(molecularRows.map((row) => row.sampleId));
  const seen = new Set<string>();
  const rows: RankingResultRow[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    if (!cell(row, 2)) continue;
    const sampleId = requiredText(worksheet, rowNumber, "Amostra", cell(row, 2));
    if (!sampleIds.has(sampleId)) fail(worksheet, rowNumber, "Amostra", "não existe no Banco_consolidado");
    if (seen.has(sampleId)) fail(worksheet, rowNumber, "Amostra", "amostra duplicada no ranking");
    seen.add(sampleId);
    const classificationText = cell(row, 14);
    const scoreText = cell(row, 15);
    if (Boolean(classificationText) !== Boolean(scoreText)) fail(worksheet, rowNumber, "Classificação/Score integrado", "ambos devem estar preenchidos ou vazios");
    const classification = classificationText ? requiredRisk(worksheet, rowNumber, "Classificação integrada", classificationText) : null;
    const score = scoreText ? requiredNumber(worksheet, rowNumber, "Score integrado", scoreText, 0, 1) : null;
    const alert = requiredBoolean(worksheet, rowNumber, "Alerta", cell(row, 25));
    const alertTags = parseTags(worksheet, rowNumber, "Tags do alerta", cell(row, 26));
    const alertReasons = splitList(cell(row, 27));
    if (alert && !alertReasons.length) fail(worksheet, rowNumber, "Motivos do alerta", "obrigatório quando Alerta=Sim");

    const result: RankingResultRow = {
      position: optionalInteger(worksheet, rowNumber, "Posição", cell(row, 1), 1), sampleId,
      pointName: requiredText(worksheet, rowNumber, "Ponto de coleta", cell(row, 3)),
      waterBody: requiredText(worksheet, rowNumber, "Manancial/corpo hídrico", cell(row, 4)),
      municipality: requiredText(worksheet, rowNumber, "Município", cell(row, 5)),
      campaignDate: requiredText(worksheet, rowNumber, "Campanha/Data", cell(row, 6)),
      turbidity: cell(row, 7), weatherCondition: cell(row, 8), mainOrganisms: cell(row, 9), mainDrivers: cell(row, 10),
      environmentalRisk: optionalRisk(worksheet, rowNumber, "Risco ambiental", cell(row, 11)),
      operationalRisk: optionalRisk(worksheet, rowNumber, "Risco operacional", cell(row, 12)),
      sanitaryRisk: optionalRisk(worksheet, rowNumber, "Risco sanitário", cell(row, 13)),
      classification, score,
      cianoReads: optionalInteger(worksheet, rowNumber, "Ciano reads", cell(row, 16), 0),
      cianoPriorityPercent: optionalNumber(worksheet, rowNumber, "Ciano prioritárias %", cell(row, 17), 0, 100),
      sanitaryBacteriaReads: optionalInteger(worksheet, rowNumber, "Bact. sanitárias reads", cell(row, 18), 0),
      sanitaryBacteriaPercent: optionalNumber(worksheet, rowNumber, "Bact. sanitárias %", cell(row, 19), 0, 100),
      invasiveCoiReads: optionalInteger(worksheet, rowNumber, "COI invasores reads", cell(row, 20), 0),
      technicalJustification: cell(row, 21), confidence: cell(row, 22), recommendations: cell(row, 23),
      invasiveCoiPercent: optionalNumber(worksheet, rowNumber, "COI invasores % calculado", cell(row, 24), 0, 100),
      alert, alertTags, alertReasons,
    };
    if (classification) {
      if (!metadata.methodology.origin || !metadata.methodology.version) fail(worksheet, rowNumber, "Classificação integrada", "origem e versão metodológica são obrigatórias");
      if (!result.technicalJustification || !result.confidence || !result.recommendations) fail(worksheet, rowNumber, "Resultado integrado", "justificativa, confiança e recomendações são obrigatórias");
      if (!new Set(["baixa", "media", "alta", "baixo", "baixo a moderado", "moderado", "alto"]).has(normalizeHeader(result.confidence))) fail(worksheet, rowNumber, "Nível de confiança", "nível de confiança inválido");
    }
    rows.push(result);
  }
  if (!rows.length) throw new Error(`A aba ${worksheet.name} não possui pontos de ranking.`);
  return rows;
}

function parseDashboardViewModel(worksheet: ExcelJS.Worksheet, metadata: ResultsWorkbookMetadata): ResultsViewModel {
  validateHeaders(worksheet, RESULTS_DASHBOARD_HEADERS);
  const sections: Record<string, unknown> = {};
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const section = cell(row, 1);
    if (!section) continue;
    if (!(RESULTS_DASHBOARD_SECTIONS as readonly string[]).includes(section) || section in sections) fail(worksheet, rowNumber, "Seção", "seção desconhecida ou duplicada");
    if (cell(row, 3) !== metadata.methodology.origin || cell(row, 4) !== metadata.methodology.version) fail(worksheet, rowNumber, "Proveniência", "origem/versão diverge da aba Instruções");
    try { sections[section] = JSON.parse(requiredText(worksheet, rowNumber, "Payload JSON", cell(row, 2))); }
    catch { fail(worksheet, rowNumber, "Payload JSON", "JSON inválido"); }
  }
  if (!isResultsViewModel(sections)) throw new Error(`A aba ${worksheet.name} não contém o view-model homologado completo.`);
  return sections;
}

function toLegacyRiskRow(row: RankingResultRow): LaboratoryRiskResultRow[] {
  if (row.classification === null || row.score === null) return [];
  return [{
    position: row.position, sampleId: row.sampleId, pointName: row.pointName, waterBody: row.waterBody,
    municipality: row.municipality, campaignDate: row.campaignDate, mainOrganisms: row.mainOrganisms,
    mainDrivers: row.mainDrivers, environmentalRisk: row.environmentalRisk, operationalRisk: row.operationalRisk,
    sanitaryRisk: row.sanitaryRisk, classification: row.classification,
    riskLevel: normalizeLaboratoryRiskLevel(row.classification),
    environmentalRiskLevel: normalizeLaboratoryRiskLevel(row.environmentalRisk),
    operationalRiskLevel: normalizeLaboratoryRiskLevel(row.operationalRisk),
    sanitaryRiskLevel: normalizeLaboratoryRiskLevel(row.sanitaryRisk), score: row.score,
    cianoReads: row.cianoReads, bactReads: row.sanitaryBacteriaReads, coiReads: row.invasiveCoiReads,
    confidence: row.confidence, technicalJustification: row.technicalJustification, recommendations: row.recommendations,
  }];
}

function requiredWorksheet(workbook: ExcelJS.Workbook, name: string) {
  const worksheet = workbook.getWorksheet(name);
  if (!worksheet) throw new Error(`A planilha precisa conter a aba ${name}.`);
  return worksheet;
}

function validateHeaders(worksheet: ExcelJS.Worksheet, expected: readonly string[]) {
  const headers = readHeaderRow(worksheet);
  const problems = expected.flatMap((header, index) => normalizeHeader(headers[index] ?? "") === normalizeHeader(header) ? [] : [`Coluna ${index + 1}: esperado "${header}", encontrado "${headers[index] || "vazio"}".`]);
  if (headers.length !== expected.length) problems.push(`Esperadas ${expected.length} colunas; encontradas ${headers.length}.`);
  if (problems.length) throw new Error(`A aba ${worksheet.name} não segue o schema ${RESULTS_SCHEMA_VERSION}. ${problems.slice(0, 4).join(" ")}`);
}

function readHeaderRow(worksheet: ExcelJS.Worksheet) {
  const values = worksheet.getRow(1).values;
  return (Array.isArray(values) ? values.slice(1) : []).map((value) => normalizeCell(value));
}

function cell(row: ExcelJS.Row, column: number) { return normalizeCell(row.getCell(column).value); }
function requiredText(worksheet: ExcelJS.Worksheet, row: number, column: string, value: string) { if (!value) fail(worksheet, row, column, "valor obrigatório ausente"); return value; }
function requiredDate(worksheet: ExcelJS.Worksheet, row: number, column: string, value: ExcelJS.CellValue | undefined) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = normalizeCell(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (!match) fail(worksheet, row, column, "use data ISO YYYY-MM-DD");
  const iso = `${match![1]}-${match![2]}-${match![3]}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) fail(worksheet, row, column, "data inválida");
  return iso;
}
function requiredNumber(worksheet: ExcelJS.Worksheet, row: number, column: string, value: string, min: number, max: number) { const parsed = parseNumber(value); if (parsed === null || parsed < min || parsed > max) fail(worksheet, row, column, `use número entre ${min} e ${max}`); return parsed; }
function optionalNumber(worksheet: ExcelJS.Worksheet, row: number, column: string, value: string, min: number, max: number) { return value ? requiredNumber(worksheet, row, column, value, min, max) : null; }
function requiredInteger(worksheet: ExcelJS.Worksheet, row: number, column: string, value: string, min: number) { const parsed = requiredNumber(worksheet, row, column, value, min, Number.MAX_SAFE_INTEGER); if (!Number.isInteger(parsed)) fail(worksheet, row, column, "use número inteiro"); return parsed; }
function optionalInteger(worksheet: ExcelJS.Worksheet, row: number, column: string, value: string, min: number) { return value ? requiredInteger(worksheet, row, column, value, min) : null; }
function requiredBoolean(worksheet: ExcelJS.Worksheet, row: number, column: string, value: string) { const parsed = optionalBoolean(worksheet, row, column, value); if (parsed === null) fail(worksheet, row, column, "use Sim ou Não"); return parsed; }
function optionalBoolean(worksheet: ExcelJS.Worksheet, row: number, column: string, value: string) { if (!value) return null; const normalized = normalizeHeader(value); if (normalized === "sim") return true; if (normalized === "nao") return false; fail(worksheet, row, column, "use Sim, Não ou vazio"); }
function requiredRisk(worksheet: ExcelJS.Worksheet, row: number, column: string, value: string) { const risk = new Map([["baixo", "Baixo"], ["baixo a moderado", "Baixo a moderado"], ["moderado", "Moderado"], ["alto", "Alto"]]).get(normalizeHeader(value)); if (!risk) fail(worksheet, row, column, "classificação de risco inválida"); return risk; }
function optionalRisk(worksheet: ExcelJS.Worksheet, row: number, column: string, value: string) { return value ? requiredRisk(worksheet, row, column, value) : ""; }
function requiredEnum<const T extends readonly string[]>(worksheet: ExcelJS.Worksheet, row: number, column: string, value: string, allowed: T): T[number] { if (!(allowed as readonly string[]).includes(value)) fail(worksheet, row, column, `use ${allowed.join(" ou ")}`); return value as T[number]; }
function parseTags(worksheet: ExcelJS.Worksheet, row: number, column: string, value: string) { const tags = splitList(value).map((tag) => tag.toUpperCase()); if (tags.some((tag) => !["TOX", "ODOR", "INV"].includes(tag))) fail(worksheet, row, column, "tags permitidas: TOX, ODOR, INV"); return tags as Array<"TOX" | "ODOR" | "INV">; }
function splitList(value: string) { return value.split(";").map((item) => item.trim()).filter(Boolean); }
function validateCoordinatePair(worksheet: ExcelJS.Worksheet, row: number, label: string, latitude: number | null, longitude: number | null) { if ((latitude === null) !== (longitude === null)) fail(worksheet, row, `Coordenada ${label}`, "latitude e longitude devem ser informadas juntas"); }
function parseNumber(value: string) { if (!value) return null; const normalized = /^-?\d{1,3}(?:\.\d{3})+,\d+$/.test(value) ? value.replace(/\./g, "").replace(",", ".") : value.replace(",", "."); const parsed = Number(normalized); return Number.isFinite(parsed) ? parsed : null; }
function normalizeHeader(value: string) { return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9%]+/g, " ").trim(); }
function normalizeCell(value: ExcelJS.CellValue | undefined) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("").trim();
    if ("result" in value && value.result !== undefined && value.result !== null) return String(value.result).trim();
    return "";
  }
  return String(value).trim();
}
function fail(worksheet: ExcelJS.Worksheet, row: number, column: string, reason: string): never { throw new Error(`${worksheet.name}, linha ${row}, ${column}: ${reason}.`); }
