import { describe, expect, it } from "vitest";
import {
  BIOLOG_CATALOG_COLUMNS,
  BIOLOG_READING_COLUMNS,
  BIOLOG_SAMPLE_COLUMNS,
  biologExportFileName,
  buildBiologExport,
  describeBiologExport,
  groupBiologExportIssues,
  sampleCell,
  type BiologExportInput,
} from "@/lib/biolog-export";
import type { FieldDiaryEntry } from "@/lib/field-diary";
import { baseParameterCatalog, type FieldParameter, type FieldReading } from "@/lib/field-parameters";
import type { FieldSample } from "@/lib/field-samples";
import { buildProjectCollectionDefaults, type CollectionDefaults } from "@/lib/field-standard";

const catalog = baseParameterCatalog();
const chlorophyll: FieldParameter = {
  id: "clorofila_a",
  label: "Clorofila a",
  unit: "µg/L",
  min: 0,
  max: 500,
  appliesTo: ["water", "plankton"],
  usesDepth: true,
  biologColumn: null,
  isBase: false,
  active: true,
  sortOrder: 1000,
};

function entry(overrides: Partial<FieldDiaryEntry> = {}): FieldDiaryEntry {
  return {
    id: "entry-1",
    campaignId: "campanha-4",
    campaignName: "4ª Campanha",
    campaignDay: 1,
    entryDate: "2026-11-07",
    fieldTeamName: "Equipe A",
    fieldTeamMembers: ["Vilmar", " Ana "],
    collectionTime: "09:05",
    locationName: "Rio Iguaçu, ponte",
    sia: "SIA-0136",
    latitude: "-25.431200",
    longitude: "-49.271500",
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
    ...overrides,
  };
}

let nextId = 0;

function sample(overrides: Partial<FieldSample> = {}): FieldSample {
  nextId += 1;

  return {
    id: `sample-${nextId}`,
    entryId: "entry-1",
    code: "YVA-0136-071126-0905-AG1",
    projectCode: "YVA",
    sampleType: "water",
    sequence: 1,
    depthM: 0,
    quantity: 1000,
    quantityUnit: "mL",
    specification: "eDNA",
    conservation: "FILTRO_CONGELADO",
    preservative: "",
    packaging: "Isopor com gelo",
    boxPosition: "A1",
    ...overrides,
  };
}

function reading(overrides: Partial<FieldReading> = {}): FieldReading {
  nextId += 1;

  return {
    id: `reading-${nextId}`,
    entryId: "entry-1",
    parameterId: "ph",
    value: 7.2,
    unit: "",
    depthM: 0,
    measuredTime: "09:10",
    equipment: "Sonda multiparâmetro",
    ...overrides,
  };
}

function build(input: Partial<BiologExportInput> & { defaults?: CollectionDefaults } = {}) {
  const defaults = input.defaults ?? buildProjectCollectionDefaults();

  return buildBiologExport({
    entries: [entry()],
    samples: [sample()],
    readings: [],
    catalog,
    defaultsFor: () => defaults,
    ...input,
  });
}

describe("planilha para o Biolog: aba Amostras", () => {
  it("usa os 28 cabeçalhos que o importador do Biolog reconhece, mais o Conservante, sem barra", () => {
    expect(BIOLOG_SAMPLE_COLUMNS).toHaveLength(29);
    expect(BIOLOG_SAMPLE_COLUMNS.at(-1)).toBe("Conservante");
    expect(BIOLOG_SAMPLE_COLUMNS.filter((header) => header.includes("/"))).toEqual([]);
    expect(BIOLOG_SAMPLE_COLUMNS).toContain("Categoria da Amostra");
    expect(BIOLOG_SAMPLE_COLUMNS).not.toContain("Tipo de Amostra");
    expect(new Set(BIOLOG_SAMPLE_COLUMNS).size).toBe(29);
  });

  it("monta a linha de uma amostra de água com os padrões da campanha", () => {
    const { sampleRows } = build();
    const [row] = sampleRows;

    expect(row).toHaveLength(BIOLOG_SAMPLE_COLUMNS.length);
    expect(Object.fromEntries(BIOLOG_SAMPLE_COLUMNS.map((column) => [column, sampleCell(row, column)]))).toEqual({
      "Lab Destino": "GA",
      Empresa: "SANEPAR",
      "Projeto (Short Name)": "YVAE",
      "Nome da Campanha": "4ª Campanha",
      Coletores: "Vilmar; Ana",
      "Categoria da Amostra": "AGUA",
      "Origem da Amostra": "AGUA_DOCE",
      Objetivo: "MONITORAMENTO",
      "Tipo de Conservação": "FILTRO_CONGELADO",
      "Código de Campo": "YVA-0136-071126-0905-AG1",
      "Ponto de Coleta": "0136",
      "Data da Coleta": "07/11/2026",
      "Hora da Coleta": "09:05",
      Latitude: -25.4312,
      Longitude: -49.2715,
      "Profundidade (m)": 0,
      "Volume Filtrado (mL)": 1000,
      Especificação: "eDNA",
      "Temp Ar (°C)": null,
      "Temp Água (°C)": null,
      pH: null,
      "Salinidade (ups)": null,
      "Oxigênio Dissolvido": null,
      Transparência: null,
      Turbidez: null,
      "Local Armazenamento": "Isopor com gelo",
      Posição: "A1",
      Observações: "Município: Curitiba; Local: Rio Iguaçu, ponte; Situação: Realizado; Coordenada: GPS do celular; Yva'e: entry-1",
      Conservante: "Filtro congelado",
    });
  });

  it("o conservante vai na coluna própria; na lista do Biolog, o valor mais próximo, e o nome exato na Especificação", () => {
    const rows = build({
      samples: [
        sample({ conservation: "LONGMIRE" }),
        sample({ code: "YVA-0136-071126-0905-AG2", sequence: 2, conservation: "ALCOOL_COM_CONGELAMENTO" }),
        sample({ code: "YVA-0136-071126-0905-AG3", sequence: 3, conservation: "OUTRO", preservative: "RNAlater" }),
        // Gravada até a 2.0.8: conservação e preservante à parte.
        sample({ code: "YVA-0136-071126-0905-AG4", sequence: 4, preservative: "Longmire" }),
      ],
    }).sampleRows;

    expect(rows.map((row) => [sampleCell(row, "Tipo de Conservação"), sampleCell(row, "Conservante"), sampleCell(row, "Especificação")])).toEqual([
      ["OUTRO", "Longmire", "eDNA; conservante: Longmire"],
      ["FILTRO_EM_ALCOOL_COM_REFRIGERACAO", "Álcool com congelamento", "eDNA; conservante: Álcool com congelamento"],
      ["OUTRO", "RNAlater", "eDNA; conservante: RNAlater"],
      ["FILTRO_CONGELADO", "Filtro congelado (Longmire)", "eDNA; conservante: Filtro congelado (Longmire)"],
    ]);
  });

  it("o branco sai como controle negativo de água ultrapura, sem profundidade nem parâmetros", () => {
    const [, blank] = build({
      samples: [
        sample(),
        sample({
          code: "YVA-0136-071126-0905-BR1",
          sampleType: "blank",
          depthM: null,
          quantity: 250,
          conservation: "LONGMIRE",
          specification: "Controle negativo",
        }),
      ],
      readings: [reading({ parameterId: "air_temperature", value: 24, depthM: null })],
    }).sampleRows;

    expect(sampleCell(blank, "Código de Campo")).toBe("YVA-0136-071126-0905-BR1");
    expect(sampleCell(blank, "Categoria da Amostra")).toBe("BRANCO");
    expect(sampleCell(blank, "Origem da Amostra")).toBe("AGUA_ULTRAPURA");
    expect(sampleCell(blank, "Objetivo")).toBe("CONTROLE");
    expect(sampleCell(blank, "Profundidade (m)")).toBeNull();
    expect(sampleCell(blank, "Volume Filtrado (mL)")).toBe(250);
    expect(sampleCell(blank, "Temp Ar (°C)")).toBeNull();
  });

  it("para os outros tipos, a origem é o próprio tipo; a matriz da campanha vale só para água", () => {
    const defaults = { ...buildProjectCollectionDefaults(), waterMatrix: "AGUA_MARINHA" as const };
    const { sampleRows } = build({
      defaults,
      samples: [
        sample(),
        sample({ code: "YVA-0136-071126-0905-PL1", sampleType: "plankton" }),
        sample({ code: "YVA-0136-071126-0905-SO1", sampleType: "soil", depthM: null, quantity: 50, quantityUnit: "g" }),
        sample({ code: "YVA-0136-071126-0905-TE1", sampleType: "tissue", depthM: null, quantity: null, quantityUnit: "g" }),
        sample({ code: "YVA-0136-071126-0905-AR1", sampleType: "air", depthM: null, quantity: 2.5, quantityUnit: "L" }),
      ],
    });

    expect(sampleRows.map((row) => [sampleCell(row, "Categoria da Amostra"), sampleCell(row, "Origem da Amostra")])).toEqual([
      ["AGUA", "AGUA_MARINHA"],
      ["SOLO", "SOLO"],
      ["AR", "AR"],
      ["TECIDO", "TECIDO"],
      ["PLANCTON", "PLANCTON"],
    ]);
  });

  it("só o volume em mL vai na coluna de volume; massa e litros vão na especificação", () => {
    const { sampleRows } = build({
      samples: [
        sample({ quantity: 250.5, specification: "" }),
        sample({ code: "YVA-0136-071126-0905-SO1", sampleType: "soil", depthM: null, quantity: 50, quantityUnit: "g", specification: "Margem" }),
        sample({ code: "YVA-0136-071126-0905-AR1", sampleType: "air", depthM: null, quantity: 2.5, quantityUnit: "L", specification: "" }),
        sample({ code: "YVA-0136-071126-0905-TE1", sampleType: "tissue", depthM: null, quantity: null, quantityUnit: "g", specification: "Nadadeira" }),
        sample({ code: "YVA-0136-071126-0905-PL1", sampleType: "plankton", quantity: 1000, quantityUnit: "L", specification: "" }),
      ],
    });

    expect(sampleRows.map((row) => [sampleCell(row, "Volume Filtrado (mL)"), sampleCell(row, "Especificação")])).toEqual([
      [250.5, ""],
      [null, "50 g; Margem"],
      [null, "2,5 L"],
      [null, "Nadadeira"],
      [null, "1000 L"],
    ]);
  });

  it("a profundidade sai só nos tipos que têm profundidade, e 0 é superfície", () => {
    const { sampleRows } = build({
      samples: [
        sample({ depthM: 0 }),
        sample({ code: "YVA-0136-071126-0905-AG2", sequence: 2, depthM: 2.5 }),
        sample({ code: "YVA-0136-071126-0905-AG3", sequence: 3, depthM: null }),
        // Profundidade gravada por engano numa amostra de solo não vai para a planilha.
        sample({ code: "YVA-0136-071126-0905-SO1", sampleType: "soil", depthM: 3, quantityUnit: "g" }),
      ],
    });

    expect(sampleRows.map((row) => sampleCell(row, "Profundidade (m)"))).toEqual([0, 2.5, null, null]);
  });

  it("ordena por campanha, data, hora e ponto, e as amostras do ponto por tipo e número", () => {
    const { sampleRows, sampleIds } = build({
      entries: [
        entry({ id: "c", entryDate: "2026-11-08", collectionTime: "08:00", sia: "0200" }),
        entry({ id: "b", collectionTime: "10:30", sia: "0140" }),
        entry({ id: "a", collectionTime: "09:05" }),
        entry({ id: "z", campaignName: "3ª Campanha", entryDate: "2026-08-01", sia: "0001" }),
      ],
      samples: [
        sample({ id: "c1", entryId: "c", code: "YVA-0200-081126-0800-AG1" }),
        sample({ id: "b1", entryId: "b", code: "YVA-0140-071126-1030-AG1" }),
        sample({ id: "a-pl", entryId: "a", code: "YVA-0136-071126-0905-PL1", sampleType: "plankton" }),
        sample({ id: "a-ag2", entryId: "a", code: "YVA-0136-071126-0905-AG2", sequence: 2 }),
        sample({ id: "a-ag1", entryId: "a", code: "YVA-0136-071126-0905-AG1" }),
        sample({ id: "z1", entryId: "z", code: "YVA-0001-010826-0905-AG1" }),
      ],
    });

    expect(sampleRows.map((row) => sampleCell(row, "Código de Campo"))).toEqual([
      "YVA-0001-010826-0905-AG1",
      "YVA-0136-071126-0905-AG1",
      "YVA-0136-071126-0905-AG2",
      "YVA-0136-071126-0905-PL1",
      "YVA-0140-071126-1030-AG1",
      "YVA-0200-081126-0800-AG1",
    ]);
    expect(sampleIds).toEqual(["z1", "a-ag1", "a-ag2", "a-pl", "b1", "c1"]);
  });

  it("os coletores são as pessoas da equipe; sem elas, o nome da equipe e depois quem registrou", () => {
    const collectors = (overrides: Partial<FieldDiaryEntry>) =>
      sampleCell(build({ entries: [entry(overrides)] }).sampleRows[0], "Coletores");

    expect(collectors({})).toBe("Vilmar; Ana");
    expect(collectors({ fieldTeamMembers: [" "] })).toBe("Equipe A");
    expect(collectors({ fieldTeamMembers: [], fieldTeamName: "", createdByName: "Antonio" })).toBe("Antonio");
    expect(collectors({ fieldTeamMembers: [], fieldTeamName: null, createdByName: null })).toBe("");
  });

  it("aceita coordenada com vírgula e deixa as duas vazias quando uma delas não vale", () => {
    const coordinates = (overrides: Partial<FieldDiaryEntry>) => {
      const [row] = build({ entries: [entry(overrides)] }).sampleRows;
      return [sampleCell(row, "Latitude"), sampleCell(row, "Longitude")];
    };

    expect(coordinates({ latitude: "-25,5", longitude: "-49,25" })).toEqual([-25.5, -49.25]);
    expect(coordinates({ latitude: "-25.5", longitude: "" })).toEqual([null, null]);
    expect(coordinates({ latitude: "-95", longitude: "-49.2" })).toEqual([null, null]);
    expect(coordinates({ latitude: null, longitude: null })).toEqual([null, null]);
  });

  it("as observações levam a situação, a realocação, a origem da coordenada e a ocorrência", () => {
    const observations = (overrides: Partial<FieldDiaryEntry>) =>
      sampleCell(build({ entries: [entry(overrides)] }).sampleRows[0], "Observações");

    expect(
      observations({
        executionStatus: "relocated",
        relocationReason: "  Margem   alagada, ponto deslocado 80 m  ",
        coordinateSource: "manual",
        hasOccurrence: true,
        occurrenceType: "Acesso",
        occurrenceDescription: "Portão fechado",
      }),
    ).toBe(
      "Município: Curitiba; Local: Rio Iguaçu, ponte; Situação: Realocado; " +
        "Motivo da realocação: Margem alagada, ponto deslocado 80 m; Coordenada: Digitada; " +
        "Ocorrência: Acesso - Portão fechado; Yva'e: entry-1",
    );
    expect(observations({ municipality: "", locationName: "", coordinateSource: null })).toBe(
      "Situação: Realizado; Yva'e: entry-1",
    );
    expect(observations({ hasOccurrence: true, occurrenceType: "", occurrenceDescription: "" })).toContain(
      "Ocorrência: sim;",
    );
    // O motivo só aparece quando o ponto foi realocado.
    expect(observations({ relocationReason: "antigo" })).not.toContain("Motivo da realocação");
  });

  it("encurta textos longos das observações", () => {
    const [row] = build({
      entries: [entry({ executionStatus: "relocated", relocationReason: "x".repeat(500) })],
    }).sampleRows;
    const text = String(sampleCell(row, "Observações"));

    expect(text).toContain(`Motivo da realocação: ${"x".repeat(199)}…;`);
    expect(text.length).toBeLessThan(340);
  });

  it("hora com segundos ou sem zero à esquerda sai como HH:MM", () => {
    const time = (collectionTime: string) =>
      sampleCell(build({ entries: [entry({ collectionTime })] }).sampleRows[0], "Hora da Coleta");

    expect(time("9:05")).toBe("09:05");
    expect(time("14:30:59")).toBe("14:30");
    expect(time("25:00")).toBe("");
    expect(time("manhã")).toBe("");
  });

  it("registro sem SIA usa o ponto que está no código gravado", () => {
    const [row] = build({
      entries: [entry({ sia: "" })],
      samples: [sample({ code: "YVA-P01-071126-0905-AG1" })],
    }).sampleRows;

    expect(sampleCell(row, "Ponto de Coleta")).toBe("P01");
  });
});

describe("planilha para o Biolog: parâmetros medidos", () => {
  it("preenche as colunas fixas com as medições que valem para a amostra", () => {
    const { sampleRows } = build({
      samples: [sample(), sample({ code: "YVA-0136-071126-0905-AG2", sequence: 2, depthM: 5 })],
      readings: [
        reading({ parameterId: "air_temperature", value: 22.5, unit: "°C", depthM: null }),
        reading({ parameterId: "water_temperature", value: 18.4, unit: "°C", depthM: 0 }),
        reading({ parameterId: "water_temperature", value: 16.1, unit: "°C", depthM: 5 }),
        reading({ parameterId: "ph", value: 7.2, depthM: 0 }),
        reading({ parameterId: "salinity", value: 0.1, unit: "ups", depthM: 5 }),
        reading({ parameterId: "dissolved_oxygen", value: 8.3, unit: "mg/L", depthM: 0 }),
        reading({ parameterId: "secchi_transparency", value: 1.2, unit: "m", depthM: null }),
        reading({ parameterId: "turbidity", value: 12, unit: "NTU", depthM: 0 }),
        // Condutividade não tem coluna fixa no Biolog: só vai na aba Parâmetros.
        reading({ parameterId: "conductivity", value: 120, unit: "µS/cm", depthM: 0 }),
      ],
    });
    const fixed = (row: (typeof sampleRows)[number]) => ({
      ar: sampleCell(row, "Temp Ar (°C)"),
      agua: sampleCell(row, "Temp Água (°C)"),
      ph: sampleCell(row, "pH"),
      salinidade: sampleCell(row, "Salinidade (ups)"),
      oxigenio: sampleCell(row, "Oxigênio Dissolvido"),
      transparencia: sampleCell(row, "Transparência"),
      turbidez: sampleCell(row, "Turbidez"),
    });

    expect(fixed(sampleRows[0])).toEqual({
      ar: 22.5,
      agua: 18.4,
      ph: 7.2,
      salinidade: null,
      oxigenio: 8.3,
      transparencia: 1.2,
      turbidez: 12,
    });
    expect(fixed(sampleRows[1])).toEqual({
      ar: 22.5,
      agua: 16.1,
      ph: null,
      salinidade: 0.1,
      oxigenio: null,
      transparencia: 1.2,
      turbidez: null,
    });
  });

  it("amostra sem profundidade informada recebe a medição mais rasa", () => {
    const { sampleRows } = build({
      samples: [sample({ depthM: null })],
      readings: [reading({ value: 6.8, depthM: 10 }), reading({ value: 7.4, depthM: 2 })],
    });

    expect(sampleCell(sampleRows[0], "pH")).toBe(7.4);
  });

  it("parâmetro que não se aplica ao tipo da amostra não entra na linha dela", () => {
    const { sampleRows, readingRows } = build({
      samples: [sample({ code: "YVA-0136-071126-0905-SO1", sampleType: "soil", depthM: null, quantityUnit: "g" })],
      readings: [
        reading({ parameterId: "ph", value: 6.1, depthM: 0 }),
        reading({ parameterId: "turbidity", value: 12, unit: "NTU", depthM: 0 }),
        reading({ parameterId: "air_temperature", value: 22.5, unit: "°C", depthM: null }),
      ],
    });

    expect(sampleCell(sampleRows[0], "pH")).toBe(6.1);
    expect(sampleCell(sampleRows[0], "Turbidez")).toBeNull();
    expect(readingRows.map((row) => row[1])).toEqual(["Temperatura do ar", "pH"]);
  });

  it("a aba Parâmetros tem uma linha por medição de cada amostra, em formato longo", () => {
    const { readingRows, counts } = build({
      catalog: [...catalog, chlorophyll],
      samples: [sample(), sample({ code: "YVA-0136-071126-0905-PL1", sampleType: "plankton" })],
      readings: [
        reading({ parameterId: "conductivity", value: 120.5, unit: "µS/cm", depthM: 0 }),
        reading({ parameterId: "clorofila_a", value: 3.4, unit: "µg/L", depthM: 0, measuredTime: "", equipment: "" }),
        reading({ parameterId: "air_temperature", value: 22.5, unit: "°C", depthM: null, equipment: "Termômetro" }),
      ],
    });

    expect(BIOLOG_READING_COLUMNS).toEqual([
      "Código de Campo",
      "Parâmetro",
      "Valor",
      "Unidade",
      "Profundidade (m)",
      "Data/Hora da Medição",
      "Equipamento / Método",
    ]);
    expect(readingRows).toEqual([
      ["YVA-0136-071126-0905-AG1", "Temperatura do ar", 22.5, "°C", null, "07/11/2026 09:10", "Termômetro"],
      ["YVA-0136-071126-0905-AG1", "Condutividade", 120.5, "µS/cm", 0, "07/11/2026 09:10", "Sonda multiparâmetro"],
      ["YVA-0136-071126-0905-AG1", "Clorofila a", 3.4, "µg/L", 0, "07/11/2026", ""],
      ["YVA-0136-071126-0905-PL1", "Temperatura do ar", 22.5, "°C", null, "07/11/2026 09:10", "Termômetro"],
      ["YVA-0136-071126-0905-PL1", "Condutividade", 120.5, "µS/cm", 0, "07/11/2026 09:10", "Sonda multiparâmetro"],
      ["YVA-0136-071126-0905-PL1", "Clorofila a", 3.4, "µg/L", 0, "07/11/2026", ""],
    ]);
    // Três medições, cada uma repetida nas duas amostras a que se aplica.
    expect(counts.readings).toBe(3);
    expect(counts.readingRows).toBe(6);
  });

  it("medição de parâmetro que saiu do catálogo não vai para a planilha, e a pessoa é avisada", () => {
    const { readingRows, issues, counts } = build({ readings: [reading({ parameterId: "sumiu" })] });

    expect(readingRows).toEqual([]);
    expect(counts.readings).toBe(0);
    expect(issues.map((issue) => issue.kind)).toEqual(["reading_without_sample"]);
  });

  it("avisa das medições que não valem para nenhuma amostra do registro", () => {
    const result = build({
      samples: [sample({ depthM: 0 })],
      readings: [
        reading({ parameterId: "ph", depthM: 0 }),
        // Medida a 5 m, mas só há amostra de superfície.
        reading({ parameterId: "water_temperature", value: 16, unit: "°C", depthM: 5 }),
        reading({ parameterId: "turbidity", value: 9, unit: "NTU", depthM: 10 }),
      ],
    });

    expect(result.counts).toMatchObject({ readings: 1, readingRows: 1 });
    expect(result.issues).toEqual([
      {
        kind: "reading_without_sample",
        entryId: "entry-1",
        entryLabel: "SIA-0136 · 07/11/2026",
        message: "2 medições ficam de fora, porque nenhuma amostra do registro é do tipo e da profundidade delas.",
        blocking: false,
      },
    ]);
    expect(build({ readings: [reading({ depthM: 3 })] }).issues[0].message).toBe(
      "1 medição fica de fora, porque nenhuma amostra do registro é do tipo e da profundidade dela.",
    );
  });

  it("a aba do catálogo lista os parâmetros ativos e os desativados que têm medição", () => {
    const inactiveUsed = { ...chlorophyll, active: false };
    const inactiveUnused: FieldParameter = { ...chlorophyll, id: "nitrato", label: "Nitrato", unit: "mg/L", active: false, sortOrder: 1010 };
    const { catalogRows } = build({
      catalog: [...catalog, inactiveUsed, inactiveUnused],
      readings: [reading({ parameterId: "clorofila_a", value: 3.4, unit: "µg/L" })],
    });

    expect(BIOLOG_CATALOG_COLUMNS).toHaveLength(6);
    expect(catalogRows.map((row) => row[0])).toEqual([...catalog.map((parameter) => parameter.label), "Clorofila a"]);
    expect(catalogRows[0]).toEqual(["Temperatura do ar", "°C", -20, 60, "Água, Solo, Ar, Tecido, Plâncton", "Temp Ar (°C)"]);
    expect(catalogRows.at(-1)).toEqual(["Clorofila a", "µg/L", 0, 500, "Água, Plâncton", ""]);
  });
});

describe("planilha para o Biolog: o que entra e o que falta", () => {
  it("registro sem amostra fica de fora e é contado", () => {
    const result = build({
      entries: [entry(), entry({ id: "entry-2", sia: "0140" }), entry({ id: "entry-3", sia: "0141" })],
      samples: [sample(), sample({ code: "YVA-0136-071126-0905-AG2", sequence: 2 })],
      readings: [reading({ entryId: "entry-2" })],
    });

    expect(result.counts).toEqual({
      entries: 1,
      entriesWithoutSamples: 2,
      samples: 2,
      samplesExportedBefore: 0,
      readings: 0,
      readingRows: 0,
      blockedSamples: 0,
    });
    expect(result.issues).toEqual([]);
  });

  it("amostra de registro que não está na seleção não entra", () => {
    const result = build({ samples: [sample(), sample({ id: "de-fora", entryId: "outro-registro" })] });

    expect(result.sampleIds).not.toContain("de-fora");
    expect(result.counts.samples).toBe(1);
  });

  it("aponta o que o Biolog recusa: sem hora, sem coordenada, sem ponto", () => {
    const result = build({
      entries: [
        entry({ id: "sem-hora", collectionTime: "" }),
        entry({ id: "sem-coordenada", sia: "0140", latitude: "", longitude: "" }),
        entry({ id: "sem-ponto", sia: "", locationName: "Represa" }),
        entry({ id: "ok", sia: "0150" }),
      ],
      samples: [
        sample({ entryId: "sem-hora" }),
        sample({ entryId: "sem-hora", code: "YVA-0136-071126-0905-AG2", sequence: 2 }),
        sample({ entryId: "sem-coordenada", code: "YVA-0140-071126-0905-AG1" }),
        // Código fora do padrão e registro sem SIA: não há de onde tirar o ponto.
        sample({ entryId: "sem-ponto", code: "AMOSTRA-ANTIGA" }),
        sample({ entryId: "ok", code: "YVA-0150-071126-0905-AG1" }),
      ],
    });
    const blocking = result.issues.filter((issue) => issue.blocking);

    expect(blocking.map((issue) => [issue.entryId, issue.kind, issue.entryLabel, issue.message])).toEqual([
      ["sem-hora", "missing_time", "SIA-0136 · 07/11/2026", "Sem hora da coleta."],
      ["sem-ponto", "missing_point", "Represa · 07/11/2026", "Sem ponto de coleta (SIA)."],
      ["sem-coordenada", "missing_coordinates", "0140 · 07/11/2026", "Sem latitude e longitude."],
    ]);
    expect(result.counts.blockedSamples).toBe(4);
    // As linhas saem mesmo assim: quem decide se manda é a pessoa.
    expect(result.counts.samples).toBe(5);
  });

  it("avisa, sem barrar, quando a coordenada é a planejada do ponto", () => {
    const result = build({ entries: [entry({ coordinateSource: "planned" })] });

    expect(result.issues).toEqual([
      {
        kind: "planned_coordinate",
        entryId: "entry-1",
        entryLabel: "SIA-0136 · 07/11/2026",
        message: "A coordenada é a planejada do ponto, e não a medida no local.",
        blocking: false,
      },
    ]);
    expect(result.counts.blockedSamples).toBe(0);
  });

  it("avisa quando o código gravado não confere mais com a data, a hora ou o ponto do registro", () => {
    const oneCode = build({ entries: [entry({ entryDate: "2026-11-08" })] });
    const otherTime = build({ entries: [entry({ collectionTime: "10:15" })] });
    const twoCodes = build({
      entries: [entry({ sia: "0140" })],
      samples: [sample(), sample({ code: "YVA-0136-071126-0905-AG2", sequence: 2 })],
    });
    const otherProject = build({ defaults: { ...buildProjectCollectionDefaults(), projectCode: "IGU" } });

    expect(oneCode.issues.map((issue) => [issue.kind, issue.message, issue.blocking])).toEqual([
      [
        "code_out_of_date",
        "O código YVA-0136-071126-0905-AG1 não confere com a data, a hora e o ponto do registro. Abra o registro e salve de novo.",
        false,
      ],
    ]);
    expect(otherTime.issues.map((issue) => issue.kind)).toEqual(["code_out_of_date"]);
    expect(twoCodes.issues.map((issue) => issue.message)).toEqual([
      "2 códigos de amostra não conferem com a data, a hora e o ponto do registro. Abra o registro e salve de novo.",
    ]);
    expect(otherProject.issues.map((issue) => issue.kind)).toEqual(["code_out_of_date"]);
  });

  it("amostra já exportada mantém o código, e a planilha diz que ele ficou", () => {
    const result = build({
      entries: [entry({ entryDate: "2026-11-08" })],
      samples: [
        sample({ exportedAt: "2026-11-09T10:00:00.000Z" }),
        sample({ code: "YVA-0136-081126-0905-AG2", sequence: 2 }),
      ],
    });

    expect(result.sampleRows.map((row) => [sampleCell(row, "Código de Campo"), sampleCell(row, "Data da Coleta")])).toEqual([
      ["YVA-0136-071126-0905-AG1", "08/11/2026"],
      ["YVA-0136-081126-0905-AG2", "08/11/2026"],
    ]);
    expect(result.issues.map((issue) => [issue.kind, issue.message, issue.blocking])).toEqual([
      [
        "exported_code_kept",
        "O código YVA-0136-071126-0905-AG1 já tinha sido exportado e continua o mesmo, embora a data, a hora ou o ponto do registro tenham mudado.",
        false,
      ],
    ]);
    expect(result.counts.samplesExportedBefore).toBe(1);
  });

  it("código no formato antigo (sem a hora) não pede para salvar de novo, porque não muda mais", () => {
    const same = build({ samples: [sample({ code: "YVA-071126-0136-AG1" })] });
    const moved = build({ entries: [entry({ entryDate: "2026-11-08" })], samples: [sample({ code: "YVA-071126-0136-AG1" })] });

    expect(same.issues).toEqual([]);
    expect(moved.issues.map((issue) => [issue.kind, issue.message])).toEqual([
      [
        "exported_code_kept",
        "O código YVA-071126-0136-AG1 é do formato antigo e continua o mesmo, embora a data ou o ponto do registro tenham mudado.",
      ],
    ]);
    expect(moved.counts.samplesExportedBefore).toBe(0);
  });

  it("usa os padrões da campanha de cada registro", () => {
    const lapoa = { ...buildProjectCollectionDefaults(), destinationLab: "LAPOA" as const };
    const result = buildBiologExport({
      entries: [entry(), entry({ id: "entry-2", campaignId: "campanha-5", campaignName: "5ª Campanha", sia: "0140" })],
      samples: [sample(), sample({ entryId: "entry-2", code: "YVA-0140-071126-0905-AG1" })],
      readings: [],
      catalog,
      defaultsFor: (item) => (item.campaignId === "campanha-5" ? lapoa : buildProjectCollectionDefaults()),
    });

    expect(result.sampleRows.map((row) => [sampleCell(row, "Nome da Campanha"), sampleCell(row, "Lab Destino")])).toEqual([
      ["4ª Campanha", "GA"],
      ["5ª Campanha", "LAPOA"],
    ]);
  });
});

describe("nome do arquivo", () => {
  it("leva a campanha sem acentos e a data do dia", () => {
    expect(biologExportFileName("4ª Campanha · Sanepar", new Date(2026, 10, 11))).toBe(
      "yvae-biolog-4a-campanha-sanepar-2026-11-11.xlsx",
    );
    expect(biologExportFileName("  ", new Date(2026, 0, 5))).toBe("yvae-biolog-campanha-2026-01-05.xlsx");
  });
});

describe("resumo antes de gerar a planilha", () => {
  const counts = {
    entries: 12,
    entriesWithoutSamples: 0,
    samples: 36,
    samplesExportedBefore: 0,
    readings: 96,
    readingRows: 240,
    blockedSamples: 0,
  };

  it("diz quantas amostras, de quantos registros, com quantas medições", () => {
    expect(describeBiologExport(counts)).toEqual(["36 amostras de 12 registros de campo, com 96 medições de parâmetros."]);
    expect(describeBiologExport({ ...counts, entries: 1, samples: 1, readings: 1 })).toEqual([
      "1 amostra de 1 registro de campo, com 1 medição de parâmetro.",
    ]);
    expect(describeBiologExport({ ...counts, samples: 1200, readings: 0 })).toEqual([
      "1.200 amostras de 12 registros de campo, sem medições de parâmetros.",
    ]);
  });

  it("avisa dos registros sem amostra e das amostras que já tinham saído antes", () => {
    expect(describeBiologExport({ ...counts, entriesWithoutSamples: 3, samplesExportedBefore: 8 }).slice(1)).toEqual([
      "3 registros de campo sem amostra ficam de fora.",
      "8 já tinham saído numa planilha anterior e vão de novo nesta: o Biolog ignora a amostra que já importou.",
    ]);
    expect(describeBiologExport({ ...counts, entriesWithoutSamples: 1, samplesExportedBefore: 1 }).slice(1)).toEqual([
      "1 registro de campo sem amostra fica de fora.",
      "1 já tinha saído numa planilha anterior e vai de novo nesta: o Biolog ignora a amostra que já importou.",
    ]);
    expect(describeBiologExport({ ...counts, samplesExportedBefore: 36 }).at(-1)).toBe(
      "Todas já tinham saído numa planilha anterior e vão de novo nesta: o Biolog ignora a amostra que já importou.",
    );
    expect(describeBiologExport({ ...counts, samples: 1, samplesExportedBefore: 1 }).at(-1)).toBe(
      "Ela já tinha saído numa planilha anterior e vai de novo nesta: o Biolog ignora a amostra que já importou.",
    );
  });

  it("sem amostra não há o que resumir", () => {
    expect(describeBiologExport({ ...counts, samples: 0, entries: 0, entriesWithoutSamples: 12 })).toEqual([]);
  });

  it("junta as pendências por registro e separa as que o Biolog recusa", () => {
    const result = build({
      entries: [
        entry({ id: "a", collectionTime: "", latitude: "", longitude: "" }),
        entry({ id: "b", sia: "0140", coordinateSource: "planned" }),
      ],
      samples: [sample({ entryId: "a" }), sample({ entryId: "b", code: "YVA-0140-061126-0905-AG1" })],
    });

    expect(groupBiologExportIssues(result.issues)).toEqual({
      blocking: [
        { entryId: "a", entryLabel: "SIA-0136 · 07/11/2026", messages: ["Sem hora da coleta.", "Sem latitude e longitude."] },
      ],
      toCheck: [
        {
          entryId: "b",
          entryLabel: "0140 · 07/11/2026",
          messages: [
            "A coordenada é a planejada do ponto, e não a medida no local.",
            "O código YVA-0140-061126-0905-AG1 não confere com a data, a hora e o ponto do registro. Abra o registro e salve de novo.",
          ],
        },
      ],
    });
  });
});
