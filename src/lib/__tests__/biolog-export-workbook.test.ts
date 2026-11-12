import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  BIOLOG_CATALOG_COLUMNS,
  BIOLOG_READING_COLUMNS,
  BIOLOG_SAMPLE_COLUMNS,
  buildBiologExport,
} from "@/lib/biolog-export";
import { BIOLOG_SHEET_NAMES, addBiologExportSheets } from "@/lib/biolog-export-workbook";
import type { FieldDiaryEntry } from "@/lib/field-diary";
import { baseParameterCatalog } from "@/lib/field-parameters";
import { buildProjectCollectionDefaults } from "@/lib/field-standard";

const entry: FieldDiaryEntry = {
  id: "entry-1",
  campaignName: "4ª Campanha",
  campaignDay: 1,
  entryDate: "2026-11-07",
  fieldTeamMembers: ["Vilmar"],
  collectionTime: "09:05",
  locationName: "Rio Iguaçu",
  sia: "0136",
  latitude: "-25.4312",
  longitude: "-49.2715",
  coordinateSource: "gps",
  executionStatus: "realized",
  municipality: "Curitiba",
  activities: [],
  waterVisualConditions: [],
  hasOccurrence: false,
  requiresFollowUp: "Não",
  dailySummary: "",
  status: "Enviado",
  createdAt: "2026-11-07T12:05:00.000Z",
  updatedAt: "2026-11-07T12:05:00.000Z",
  photos: [],
};

const data = buildBiologExport({
  entries: [entry],
  samples: [
    {
      id: "s1",
      entryId: "entry-1",
      code: "YVA-0136-071126-0905-AG1",
      projectCode: "YVA",
      sampleType: "water",
      sequence: 1,
      depthM: 0,
      quantity: 1000,
      quantityUnit: "mL",
      specification: "",
      conservation: "FILTRO_CONGELADO",
      preservative: "Longmire",
      packaging: "Isopor com gelo",
      boxPosition: "",
    },
    {
      id: "s2",
      entryId: "entry-1",
      code: "YVA-0136-071126-0905-PL1",
      projectCode: "YVA",
      sampleType: "plankton",
      sequence: 1,
      depthM: 2.5,
      quantity: null,
      quantityUnit: "mL",
      specification: "Rede de 68 µm",
      conservation: "OUTRO",
      preservative: "",
      packaging: "",
      boxPosition: "B2",
    },
  ],
  readings: [
    { id: "r1", entryId: "entry-1", parameterId: "ph", value: 7.2, unit: "", depthM: 0, measuredTime: "09:10", equipment: "Sonda" },
    { id: "r2", entryId: "entry-1", parameterId: "conductivity", value: 120.5, unit: "µS/cm", depthM: 0, measuredTime: "", equipment: "" },
    { id: "r3", entryId: "entry-1", parameterId: "air_temperature", value: 22, unit: "°C", depthM: null, measuredTime: "09:00", equipment: "" },
  ],
  catalog: baseParameterCatalog(),
  defaultsFor: () => buildProjectCollectionDefaults(),
});

/** Grava o arquivo e lê de volta, como o Biolog (ou o Excel) vai ler. */
async function roundTrip() {
  const workbook = new ExcelJS.Workbook();

  addBiologExportSheets(workbook, data);

  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(await workbook.xlsx.writeBuffer());

  return reopened;
}

function rowValues(sheet: ExcelJS.Worksheet, rowNumber: number, width: number) {
  return Array.from({ length: width }, (_, index) => sheet.getRow(rowNumber).getCell(index + 1).value);
}

describe("arquivo .xlsx para o Biolog", () => {
  it("tem as três abas, com Amostras em primeiro", async () => {
    const workbook = await roundTrip();

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Amostras", "Parâmetros", "Catálogo de parâmetros"]);
    expect(workbook.worksheets[0].name).toBe(BIOLOG_SHEET_NAMES.samples);
  });

  it("a primeira linha de cada aba são os cabeçalhos do padrão", async () => {
    const workbook = await roundTrip();
    const headers = (name: string, width: number) => rowValues(workbook.getWorksheet(name)!, 1, width);

    expect(headers("Amostras", 29)).toEqual([...BIOLOG_SAMPLE_COLUMNS]);
    expect(headers("Parâmetros", 7)).toEqual([...BIOLOG_READING_COLUMNS]);
    expect(headers("Catálogo de parâmetros", 6)).toEqual([...BIOLOG_CATALOG_COLUMNS]);
    expect(workbook.getWorksheet("Amostras")!.columnCount).toBe(29);
  });

  it("grava uma linha por amostra, com número como número e vazio como vazio", async () => {
    const sheet = (await roundTrip()).getWorksheet("Amostras")!;
    const column = (header: (typeof BIOLOG_SAMPLE_COLUMNS)[number]) => BIOLOG_SAMPLE_COLUMNS.indexOf(header) + 1;
    const cell = (rowNumber: number, header: (typeof BIOLOG_SAMPLE_COLUMNS)[number]) =>
      sheet.getRow(rowNumber).getCell(column(header)).value;

    expect(sheet.rowCount).toBe(3);
    expect(cell(2, "Código de Campo")).toBe("YVA-0136-071126-0905-AG1");
    expect(cell(2, "Data da Coleta")).toBe("07/11/2026");
    expect(cell(2, "Hora da Coleta")).toBe("09:05");
    expect(cell(2, "Latitude")).toBe(-25.4312);
    expect(cell(2, "Longitude")).toBe(-49.2715);
    // Zero é superfície: precisa chegar como 0, e não como célula vazia.
    expect(cell(2, "Profundidade (m)")).toBe(0);
    expect(cell(2, "Volume Filtrado (mL)")).toBe(1000);
    expect(cell(2, "pH")).toBe(7.2);
    expect(cell(2, "Temp Ar (°C)")).toBe(22);
    expect(cell(2, "Turbidez")).toBeNull();
    expect(cell(2, "Especificação")).toBe("preservante: Longmire");
    expect(cell(2, "Preservante")).toBe("Longmire");
    expect(cell(2, "Posição")).toBeNull();

    expect(cell(3, "Código de Campo")).toBe("YVA-0136-071126-0905-PL1");
    expect(cell(3, "Categoria da Amostra")).toBe("PLANCTON");
    expect(cell(3, "Profundidade (m)")).toBe(2.5);
    expect(cell(3, "Volume Filtrado (mL)")).toBeNull();
    expect(cell(3, "Especificação")).toBe("Rede de 68 µm");
    expect(cell(3, "pH")).toBeNull();
  });

  it("grava a aba Parâmetros em formato longo", async () => {
    const sheet = (await roundTrip()).getWorksheet("Parâmetros")!;
    const rows = Array.from({ length: sheet.rowCount - 1 }, (_, index) => rowValues(sheet, index + 2, 7));

    expect(rows).toEqual([
      ["YVA-0136-071126-0905-AG1", "Temperatura do ar", 22, "°C", null, "07/11/2026 09:00", null],
      ["YVA-0136-071126-0905-AG1", "pH", 7.2, null, 0, "07/11/2026 09:10", "Sonda"],
      ["YVA-0136-071126-0905-AG1", "Condutividade", 120.5, "µS/cm", 0, "07/11/2026", null],
      ["YVA-0136-071126-0905-PL1", "Temperatura do ar", 22, "°C", null, "07/11/2026 09:00", null],
    ]);
  });

  it("grava o catálogo com a faixa esperada e a coluna fixa de cada parâmetro", async () => {
    const sheet = (await roundTrip()).getWorksheet("Catálogo de parâmetros")!;

    expect(sheet.rowCount).toBe(baseParameterCatalog().length + 1);
    expect(rowValues(sheet, 4, 6)).toEqual(["pH", null, 0, 14, "Água, Solo, Plâncton", "pH"]);
    expect(rowValues(sheet, 5, 6)).toEqual(["Condutividade", "µS/cm", 0, 100000, "Água, Plâncton", null]);
  });
});
