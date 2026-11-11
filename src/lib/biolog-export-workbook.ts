/**
 * Arquivo .xlsx da exportação para o Biolog: põe nas abas as linhas que
 * buildBiologExport montou. As regras do conteúdo estão em lib/biolog-export.
 */
import type { Workbook } from "exceljs";
import {
  BIOLOG_CATALOG_COLUMNS,
  BIOLOG_READING_COLUMNS,
  BIOLOG_SAMPLE_COLUMNS,
  type BiologCell,
  type BiologExport,
} from "@/lib/biolog-export";
import { styleWorksheet } from "@/lib/campaign-workbook-export";

/** Nomes das abas. "Amostras" é sempre a primeira: é a que o Biolog lê. */
export const BIOLOG_SHEET_NAMES = {
  samples: "Amostras",
  readings: "Parâmetros",
  catalog: "Catálogo de parâmetros",
} as const;

const WIDE_COLUMNS: Record<string, number> = {
  Coletores: 28,
  "Código de Campo": 24,
  "Nome da Campanha": 22,
  Especificação: 24,
  "Local Armazenamento": 24,
  Observações: 70,
  Parâmetro: 26,
  "Data/Hora da Medição": 22,
  "Equipamento / Método": 28,
  "Medido em amostras de": 34,
  "Coluna fixa na aba Amostras": 28,
};

export function addBiologExportSheets(workbook: Workbook, data: BiologExport) {
  addSheet(workbook, BIOLOG_SHEET_NAMES.samples, BIOLOG_SAMPLE_COLUMNS, data.sampleRows);
  addSheet(workbook, BIOLOG_SHEET_NAMES.readings, BIOLOG_READING_COLUMNS, data.readingRows);
  addSheet(workbook, BIOLOG_SHEET_NAMES.catalog, BIOLOG_CATALOG_COLUMNS, data.catalogRows);
}

function addSheet(workbook: Workbook, name: string, headers: readonly string[], rows: BiologCell[][]) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });

  sheet.columns = headers.map((header) => ({
    header,
    width: WIDE_COLUMNS[header] ?? Math.max(14, header.length + 4),
  }));

  for (const row of rows) {
    // Célula sem valor fica vazia de verdade (e não com texto vazio), para o
    // importador não a tomar por preenchida.
    sheet.addRow(row.map((cell) => (cell === "" ? null : cell)));
  }

  styleWorksheet(sheet, sheet.getColumn(headers.length).letter);
}
