import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import type {
  SpreadsheetEntity,
  SpreadsheetPreview,
  SpreadsheetSheetPreview,
} from "@/lib/types";

type WorkbookBinary = Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0];

const entityHints: Array<{
  entity: SpreadsheetEntity;
  tokens: string[];
}> = [
  { entity: "pontos", tokens: ["sia", "ponto", "municipio", "coleta"] },
  { entity: "campanhas", tokens: ["campanha", "periodo", "etapa", "cronograma"] },
  { entity: "documentos", tokens: ["documento", "arquivo", "repositorio", "publicacao"] },
  { entity: "indicadores", tokens: ["resultado", "indicador", "parametro", "amostra"] },
];

export const MAX_IMPORT_FILE_BYTES = 12 * 1024 * 1024;

export async function previewWorkbook(
  buffer: ArrayBuffer,
  fileName: string,
): Promise<SpreadsheetPreview> {
  const workbook = new ExcelJS.Workbook();
  const binary = Buffer.from(buffer) as unknown as WorkbookBinary;
  const extension = fileName.toLowerCase().split(".").pop();

  if (extension === "csv") {
    await workbook.csv.read(Readable.from([binary]));
  } else if (extension === "xlsx" || extension === "xlsm") {
    await workbook.xlsx.load(binary);
  } else {
    throw new Error(
      "Formato ainda não suportado. Arquivos .xlsx, .xlsm ou .csv devem ser usados para a etapa inicial.",
    );
  }

  const sheets = workbook.worksheets
    .map((worksheet) => previewWorksheet(worksheet))
    .filter((sheet) => sheet.rowCount > 0 || sheet.headers.length > 0);

  return {
    fileName,
    fileSize: binary.byteLength,
    sheetCount: sheets.length,
    totalRows: sheets.reduce((sum, sheet) => sum + sheet.rowCount, 0),
    sheets,
  };
}

function previewWorksheet(worksheet: ExcelJS.Worksheet): SpreadsheetSheetPreview {
  const headers = extractHeaders(worksheet);
  const hasHeader = headers.length > 0;

  return {
    name: worksheet.name,
    rowCount: Math.max(worksheet.actualRowCount - (hasHeader ? 1 : 0), 0),
    columnCount: Math.max(headers.length, worksheet.actualColumnCount),
    headers: headers.slice(0, 8),
    recommendedEntity: inferEntity(headers),
  };
}

function extractHeaders(worksheet: ExcelJS.Worksheet) {
  const values = worksheet.getRow(1).values;
  const cells = Array.isArray(values) ? values.slice(1) : [];

  return cells
    .map((value) => normalizeCell(value))
    .filter((value) => value.length > 0);
}

function normalizeCell(value: ExcelJS.CellValue | undefined) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") {
      return value.text.trim();
    }

    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((fragment) => fragment.text)
        .join("")
        .trim();
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

function inferEntity(headers: string[]): SpreadsheetEntity {
  const normalized = headers.map((header) =>
    header
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, ""),
  );

  let winner: SpreadsheetEntity = "desconhecido";
  let winnerScore = 0;

  for (const hint of entityHints) {
    const score = hint.tokens.reduce((sum, token) => {
      return normalized.some((header) => header.includes(token)) ? sum + 1 : sum;
    }, 0);

    if (score > winnerScore) {
      winner = hint.entity;
      winnerScore = score;
    }
  }

  return winner;
}
