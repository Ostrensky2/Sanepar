import { Buffer } from "node:buffer";
import ExcelJS from "exceljs";
import {
  normalizeLaboratoryRiskLevel,
  type LaboratoryRiskResultRow,
} from "@/lib/laboratory-risk";

type WorkbookBinary = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];

export const RESULTS_WORKSHEET_NAME = "Banco_consolidado";
export const RANKING_WORKSHEET_NAME = "Ranking_score_pontos";

export const RESULT_EXPECTED_HEADERS = [
  "Identificação da amostra",
  "Cód. SIA",
  "Data",
  "Manancial / Corpo Hídrico",
  "Município",
  "Latitude original",
  "Longitude original",
  "Latitude efetiva",
  "Longitude efetiva",
  "Acessibilidade do Ponto",
  "Turbidez",
  "Descrição",
  "Condições climáticas",
  "Marcador",
  "Conjunto analisado",
  "Espécie",
  "Número de Reads",
  "% Reads",
] as const;

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
  riskRows: LaboratoryRiskResultRow[];
};

export async function parseLaboratoryResultsWorkbook(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<LaboratoryResultsImport> {
  const extension = fileName.toLowerCase().split(".").pop();

  if (extension !== "xlsx" && extension !== "xlsm") {
    throw new Error("A planilha de Resultados deve ser enviada em formato .xlsx ou .xlsm.");
  }

  const workbook = new ExcelJS.Workbook();
  const binary = Buffer.from(buffer) as unknown as WorkbookBinary;
  await workbook.xlsx.load(binary, { ignoreNodes: ["tableParts"] });

  const worksheet = workbook.getWorksheet(RESULTS_WORKSHEET_NAME);
  const rankingWorksheet = workbook.getWorksheet(RANKING_WORKSHEET_NAME);

  if (!worksheet) {
    throw new Error(`A planilha precisa conter a aba ${RESULTS_WORKSHEET_NAME}.`);
  }

  if (!rankingWorksheet) {
    throw new Error(`A planilha precisa conter a aba ${RANKING_WORKSHEET_NAME}.`);
  }

  return {
    ...parseLaboratoryResultsWorksheet(worksheet, workbook.worksheets.length, fileName),
    rankingWorksheetName: rankingWorksheet.name,
    riskRows: parseRankingWorksheet(rankingWorksheet),
  };
}

function parseLaboratoryResultsWorksheet(
  worksheet: ExcelJS.Worksheet,
  sheetCount: number,
  fileName: string,
): LaboratoryResultsImport {
  const headers = readHeaderRow(worksheet);
  const headerProblems = validateHeaderOrder(headers);

  if (headerProblems.length > 0) {
    throw new Error(
      `A aba ${RESULTS_WORKSHEET_NAME} não segue o modelo consolidado da Campanha 1. ${headerProblems.join(" ")}`,
    );
  }

  const markerValues = new Set<string>();
  const analyzedSetValues = new Set<string>();
  const speciesValues = new Set<string>();

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);

    if (!normalizeCell(row.getCell(1).value)) {
      continue;
    }

    addIfPresent(markerValues, row.getCell(14).value);
    addIfPresent(analyzedSetValues, row.getCell(15).value);
    addIfPresent(speciesValues, row.getCell(16).value);
  }

  return {
    fileName,
    worksheetName: worksheet.name,
    rankingWorksheetName: "",
    rowCount: Math.max(worksheet.actualRowCount - 1, 0),
    sheetCount,
    columnCount: worksheet.actualColumnCount,
    expectedColumnCount: RESULT_EXPECTED_HEADERS.length,
    headers,
    matchedHeaders: RESULT_EXPECTED_HEADERS.length,
    markers: Array.from(markerValues).sort((a, b) => a.localeCompare(b, "pt-BR")),
    analyzedSets: Array.from(analyzedSetValues).sort((a, b) => a.localeCompare(b, "pt-BR")),
    speciesCount: speciesValues.size,
    riskRows: [],
  };
}

function parseRankingWorksheet(worksheet: ExcelJS.Worksheet): LaboratoryRiskResultRow[] {
  const headers = readHeaderRow(worksheet);
  const column = buildHeaderIndex(headers);
  const expectedClassificationHeader = normalizeHeader("Classificação integrada");
  const classificationColumn = column.get(expectedClassificationHeader) ?? 14;

  if (
    classificationColumn !== 14 ||
    normalizeHeader(headers[13] ?? "") !== expectedClassificationHeader
  ) {
    throw new Error(
      `A coluna N da aba ${RANKING_WORKSHEET_NAME} deve ser "Classificação integrada".`,
    );
  }

  const riskRows: LaboratoryRiskResultRow[] = [];

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const classification = normalizeCell(row.getCell(classificationColumn).value);

    if (!classification) {
      continue;
    }

    const pointName = cellByHeader(row, column, "Ponto de coleta", 3);
    const municipality = cellByHeader(row, column, "Município", 5);
    const environmentalRisk = cellByHeader(row, column, "Risco ambiental", 11);
    const operationalRisk = cellByHeader(row, column, "Risco operacional", 12);
    const sanitaryRisk = cellByHeader(row, column, "Risco sanitário", 13);

    if (!pointName || !municipality) {
      continue;
    }

    riskRows.push({
      position: parseNullableNumber(cellByHeader(row, column, "Posição", 1)),
      sampleId: cellByHeader(row, column, "Amostra", 2),
      pointName,
      waterBody: cellByHeader(row, column, "Manancial/corpo hídrico", 4),
      municipality,
      campaignDate: cellByHeader(row, column, "Campanha/Data", 6),
      mainOrganisms: cellByHeader(row, column, "Principais organismos", 9),
      mainDrivers: cellByHeader(row, column, "Principais drivers de risco", 10),
      environmentalRisk,
      operationalRisk,
      sanitaryRisk,
      classification,
      riskLevel: normalizeLaboratoryRiskLevel(classification),
      environmentalRiskLevel: normalizeLaboratoryRiskLevel(environmentalRisk),
      operationalRiskLevel: normalizeLaboratoryRiskLevel(operationalRisk),
      sanitaryRiskLevel: normalizeLaboratoryRiskLevel(sanitaryRisk),
      score: parseNullableNumber(cellByHeader(row, column, "Score integrado", 15)),
      cianoReads: parseNullableNumber(cellByHeader(row, column, "Ciano reads", 16)),
      bactReads: parseNullableNumber(cellByHeader(row, column, "Bact. sanitárias reads", 18)),
      coiReads: parseNullableNumber(cellByHeader(row, column, "COI invasores reads", 20)),
      technicalJustification: cellByHeader(row, column, "Justificativa técnica", 21),
      confidence: cellByHeader(row, column, "Nível de confiança", 22),
      recommendations: cellByHeader(row, column, "Recomendações", 23),
    });
  }

  if (!riskRows.length) {
    throw new Error(
      `A aba ${RANKING_WORKSHEET_NAME} não possui linhas com Classificação integrada preenchida.`,
    );
  }

  return riskRows;
}

function buildHeaderIndex(headers: string[]) {
  const column = new Map<string, number>();

  headers.forEach((header, index) => {
    if (header) {
      column.set(normalizeHeader(header), index + 1);
    }
  });

  return column;
}

function cellByHeader(
  row: ExcelJS.Row,
  column: Map<string, number>,
  header: string,
  fallbackColumn: number,
) {
  const columnNumber = column.get(normalizeHeader(header)) ?? fallbackColumn;
  return normalizeCell(row.getCell(columnNumber).value);
}

function parseNullableNumber(value: string): number | null {
  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".")
    : value;
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function validateHeaderOrder(headers: string[]) {
  const problems: string[] = [];

  if (headers.length < RESULT_EXPECTED_HEADERS.length) {
    problems.push(
      `Foram encontradas ${headers.length} colunas, mas o modelo exige ${RESULT_EXPECTED_HEADERS.length}.`,
    );
  }

  RESULT_EXPECTED_HEADERS.forEach((expectedHeader, index) => {
    const actualHeader = headers[index] ?? "";

    if (normalizeHeader(actualHeader) !== normalizeHeader(expectedHeader)) {
      problems.push(
        `Coluna ${index + 1}: esperado "${expectedHeader}", encontrado "${actualHeader || "vazio"}".`,
      );
    }
  });

  return problems.slice(0, 4);
}

function readHeaderRow(worksheet: ExcelJS.Worksheet) {
  const values = worksheet.getRow(1).values;
  const cells = Array.isArray(values) ? values.slice(1) : [];

  return cells.map((value) => normalizeCell(value));
}

function addIfPresent(target: Set<string>, value: ExcelJS.CellValue | undefined) {
  const normalized = normalizeCell(value);

  if (normalized) {
    target.add(normalized);
  }
}

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

function normalizeCell(value: ExcelJS.CellValue | undefined) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }

    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((fragment) => fragment.text).join("").trim();
    }

    if ("result" in value && value.result !== undefined && value.result !== null) {
      return String(value.result).trim();
    }

    if ("formula" in value && typeof value.formula === "string") {
      return value.formula.trim();
    }
  }

  return String(value).trim();
}
