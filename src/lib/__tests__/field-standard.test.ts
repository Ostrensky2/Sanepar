import { describe, expect, it } from "vitest";
import {
  COLLECTION_DEFAULTS_VERSION,
  FieldStandardError,
  baseFieldParameters,
  biologConservation,
  buildProjectCollectionDefaults,
  buildSampleCode,
  conservationText,
  conservationTypes,
  convertQuantity,
  currentConservationTypes,
  getSampleType,
  isLegacySampleCode,
  nextSampleSequence,
  nonNegativeNumber,
  normalizeCollectionDefaults,
  parameterSampleTypeIds,
  parseSampleCode,
  samplePointToken,
  sampleTypes,
} from "@/lib/field-standard";

describe("padrão de coleta — código da amostra", () => {
  it("gera o código combinado: projeto, ponto, data DDMMAA, hora HHMM, tipo e sequência", () => {
    expect(
      buildSampleCode({ projectCode: "YVA", date: "2026-11-07", time: "09:05", point: "0136", sampleType: "water", sequence: 1 }),
    ).toBe("YVA-0136-071126-0905-AG1");
    expect(
      buildSampleCode({ projectCode: "yva", date: "2026-11-07", time: "14:30:00", point: "SIA 136", sampleType: "plankton", sequence: 1 }),
    ).toBe("YVA-0136-071126-1430-PL1");
  });

  it("cabe na etiqueta: 24 caracteres para um SIA de 4 dígitos", () => {
    const code = buildSampleCode({
      projectCode: "YVA",
      date: "2026-11-07",
      time: "09:05",
      point: "0136",
      sampleType: "water",
      sequence: 3,
    });

    expect(code).toHaveLength(24);
  });

  it("usa uma sigla de 2 letras diferente para cada tipo de amostra", () => {
    const codes = sampleTypes.map((type) => type.code);

    expect(codes).toEqual(["AG", "BR", "SO", "AR", "TE", "PL"]);
    expect(new Set(codes).size).toBe(codes.length);
    expect(sampleTypes.map((type) => type.label)).toEqual(["Água", "Branco", "Solo", "Ar", "Tecido", "Plâncton"]);
  });

  it("o branco tem código próprio, e não é mais uma réplica de água", () => {
    const blank = buildSampleCode({
      projectCode: "YVA",
      date: "2026-11-13",
      time: "09:05",
      point: "0136",
      sampleType: "blank",
      sequence: 1,
    });

    expect(blank).toBe("YVA-0136-131126-0905-BR1");
    expect(parseSampleCode(blank)?.sampleType).toBe("blank");
    expect(getSampleType("blank").isControl).toBe(true);
    expect(parameterSampleTypeIds).not.toContain("blank");
    expect(baseFieldParameters.every((parameter) => !parameter.appliesTo.includes("blank"))).toBe(true);
  });

  it("escreve o ponto sempre do mesmo jeito", () => {
    expect(samplePointToken("136")).toBe("0136");
    expect(samplePointToken("SIA-0136")).toBe("0136");
    expect(samplePointToken("sia 7")).toBe("0007");
    expect(samplePointToken("P-01")).toBe("P01");
    expect(samplePointToken("Estação A")).toBe("ESTACAOA");
    expect(samplePointToken("Siames")).toBe("SIAMES");
  });

  it("recusa dados que deixariam o código ambíguo", () => {
    const base = { projectCode: "YVA", date: "2026-11-07", time: "09:05", point: "0136", sampleType: "water", sequence: 1 } as const;

    expect(() => buildSampleCode({ ...base, projectCode: "YVAE" })).toThrow(FieldStandardError);
    expect(() => buildSampleCode({ ...base, projectCode: "Y1A" })).toThrow(FieldStandardError);
    expect(() => buildSampleCode({ ...base, date: "07/11/2026" })).toThrow(FieldStandardError);
    expect(() => buildSampleCode({ ...base, date: "2026-02-30" })).toThrow(FieldStandardError);
    expect(() => buildSampleCode({ ...base, time: "" })).toThrow(/hora da coleta/);
    expect(() => buildSampleCode({ ...base, time: "9h05" })).toThrow(FieldStandardError);
    expect(() => buildSampleCode({ ...base, time: "24:10" })).toThrow(FieldStandardError);
    expect(() => buildSampleCode({ ...base, point: "  " })).toThrow(FieldStandardError);
    expect(() => buildSampleCode({ ...base, point: "Reservatório Muito Comprido" })).toThrow(FieldStandardError);
    expect(() => buildSampleCode({ ...base, sequence: 0 })).toThrow(FieldStandardError);
    expect(() => buildSampleCode({ ...base, sequence: 1.5 })).toThrow(FieldStandardError);
    expect(() => buildSampleCode({ ...base, sequence: 1000 })).toThrow(FieldStandardError);
  });

  it("lê de volta o que gerou, e também o código do formato anterior (sem hora)", () => {
    const input = { projectCode: "YVA", date: "2026-11-07", time: "09:05", point: "0136", sampleType: "plankton", sequence: 12 } as const;

    expect(parseSampleCode(buildSampleCode(input))).toEqual(input);
    expect(parseSampleCode(" yva-0136-071126-0905-ag2 ")).toMatchObject({ point: "0136", time: "09:05", sequence: 2 });
    expect(parseSampleCode("YVA-071126-0136-AG2")).toEqual({
      projectCode: "YVA",
      date: "2026-11-07",
      time: null,
      point: "0136",
      sampleType: "water",
      sequence: 2,
    });
    expect(isLegacySampleCode("YVA-071126-0136-AG2")).toBe(true);
    expect(isLegacySampleCode("YVA-0136-071126-0905-AG2")).toBe(false);
  });

  it("não aceita como código o que está fora do padrão", () => {
    expect(parseSampleCode("")).toBeNull();
    expect(parseSampleCode("3 réplicas")).toBeNull();
    expect(parseSampleCode("YVA-20261107-0136-AG-001")).toBeNull();
    expect(parseSampleCode("YVA-071126-0136-ZO1")).toBeNull();
    expect(parseSampleCode("YVA-311126-0136-AG1")).toBeNull();
    expect(parseSampleCode("YVA-071126-0136-AG0")).toBeNull();
    expect(parseSampleCode("YVA-0136-071126-2460-AG1")).toBeNull();
    expect(parseSampleCode("SIA407-R1-301")).toBeNull();
  });

  it("propõe a próxima sequência livre só entre amostras do mesmo ponto, dia, hora e tipo", () => {
    const target = { projectCode: "YVA", date: "2026-11-07", time: "09:05", point: "136", sampleType: "water" } as const;
    const existing = [
      "YVA-0136-071126-0905-AG1",
      "YVA-0136-071126-0905-AG3",
      "YVA-0136-071126-0905-PL7",
      "YVA-0136-071126-1100-AG9",
      "YVA-0136-081126-0905-AG9",
      "YVA-0137-071126-0905-AG9",
      "ABC-0136-071126-0905-AG9",
      "YVA-071126-0136-AG9",
      "texto antigo",
      null,
    ];

    expect(nextSampleSequence(existing, target)).toBe(4);
    expect(nextSampleSequence([], target)).toBe(1);
    expect(nextSampleSequence(existing, { ...target, sampleType: "plankton" })).toBe(8);
  });
});

describe("padrão de coleta — catálogo de parâmetros", () => {
  it("começa com os oito parâmetros combinados, cada um com unidade e faixa", () => {
    expect(baseFieldParameters.map((parameter) => parameter.label)).toEqual([
      "Temperatura do ar",
      "Temperatura da água",
      "pH",
      "Condutividade",
      "Salinidade",
      "Oxigênio dissolvido",
      "Transparência (Secchi)",
      "Turbidez",
    ]);
    expect(new Set(baseFieldParameters.map((parameter) => parameter.id)).size).toBe(baseFieldParameters.length);

    for (const parameter of baseFieldParameters) {
      expect(parameter.min).not.toBeNull();
      expect(parameter.max).not.toBeNull();
      expect(parameter.max as number).toBeGreaterThan(parameter.min as number);
      expect(parameter.appliesTo.length).toBeGreaterThan(0);
    }
  });

  it("condutividade é parâmetro próprio, com unidade, e não texto de observação", () => {
    const conductivity = baseFieldParameters.find((parameter) => parameter.id === "conductivity");

    expect(conductivity?.unit).toBe("µS/cm");
  });
});

describe("padrão de coleta — padrões do projeto", () => {
  it("traz a identificação do projeto sem ninguém digitar", () => {
    const defaults = buildProjectCollectionDefaults();

    expect(defaults.projectCode).toBe("YVA");
    expect(defaults.projectShortName).toBe("YVAE");
    expect(defaults.company).toBe("SANEPAR");
    expect(defaults.objective).toBe("MONITORAMENTO");
    expect(defaults.waterMatrix).toBe("AGUA_DOCE");
    expect(defaults.sampleTypes.water.depthM).toBe(0);
    expect(Object.keys(defaults.sampleTypes)).toEqual(["water", "blank", "soil", "air", "tissue", "plankton"]);
  });

  it("já traz o que não muda no campo: 250 mL, Criobox, Longmire, branco e plâncton de 1000 L", () => {
    const { sampleTypes: types } = buildProjectCollectionDefaults();

    expect(types.water).toMatchObject({ replicas: 5, quantity: 250, packaging: "Criobox", conservation: "LONGMIRE" });
    expect(types.blank).toMatchObject({ replicas: 1, quantity: 250, packaging: "Criobox", conservation: "LONGMIRE" });
    expect(types.plankton).toMatchObject({ replicas: 1, quantity: 1000, packaging: "Criobox", conservation: "LONGMIRE" });
    expect(getSampleType("plankton").quantityUnit).toBe("L");
  });

  it("padrão gravado antes da 2.0.9 fica com o número de amostras e os parâmetros, e o resto volta ao padrão", () => {
    const fallback = buildProjectCollectionDefaults();
    const old = normalizeCollectionDefaults({
      destinationLab: "LAPOA",
      fieldParameterIds: ["ph"],
      sampleTypes: {
        water: { replicas: 3, conservation: "FILTRO_CONGELADO", packaging: "Isopor com gelo", quantity: 1000 },
        plankton: { replicas: 2, conservation: "OUTRO", quantity: null },
      },
    });

    expect(old.standardVersion).toBe(COLLECTION_DEFAULTS_VERSION);
    expect(old.destinationLab).toBe("LAPOA");
    expect(old.fieldParameterIds).toEqual(["ph"]);
    expect(old.sampleTypes.water).toEqual({ ...fallback.sampleTypes.water, replicas: 3 });
    expect(old.sampleTypes.plankton).toEqual({ ...fallback.sampleTypes.plankton, replicas: 2 });
    expect(old.sampleTypes.blank).toEqual(fallback.sampleTypes.blank);
  });

  it("completa com o padrão do projeto o que não foi gravado", () => {
    expect(normalizeCollectionDefaults(undefined)).toEqual(buildProjectCollectionDefaults());
    expect(normalizeCollectionDefaults("texto")).toEqual(buildProjectCollectionDefaults());

    const partial = normalizeCollectionDefaults({
      standardVersion: 2,
      destinationLab: "LAPOA",
      sampleTypes: { water: { replicas: 2, quantity: "500,5", depthM: 5 } },
    });

    expect(partial.destinationLab).toBe("LAPOA");
    expect(partial.projectCode).toBe("YVA");
    expect(partial.sampleTypes.water.replicas).toBe(2);
    expect(partial.sampleTypes.water.quantity).toBe(500.5);
    expect(partial.sampleTypes.water.depthM).toBe(5);
    expect(partial.sampleTypes.water.conservation).toBe("LONGMIRE");
    expect(partial.sampleTypes.plankton).toEqual(buildProjectCollectionDefaults().sampleTypes.plankton);
  });

  it("descarta valores fora da lista em vez de gravar algo que o laboratório não reconhece", () => {
    const normalized = normalizeCollectionDefaults({
      standardVersion: 2,
      projectCode: "sanepar",
      destinationLab: "OUTRO LAB",
      objective: "passeio",
      waterMatrix: "AGUA_BENTA",
      sampleTypes: { water: { replicas: -1, conservation: "NO BOLSO", quantity: -5, depthM: "abc" } },
    });
    // As opções antigas de conservação não voltam a ser padrão de campanha.
    const legacy = normalizeCollectionDefaults({
      standardVersion: 2,
      sampleTypes: { water: { conservation: "FILTRO_CONGELADO" } },
    });
    const fallback = buildProjectCollectionDefaults();

    expect(normalized.projectCode).toBe("YVA");
    expect(normalized.destinationLab).toBe(fallback.destinationLab);
    expect(normalized.objective).toBe(fallback.objective);
    expect(normalized.waterMatrix).toBe(fallback.waterMatrix);
    expect(normalized.sampleTypes.water.replicas).toBe(fallback.sampleTypes.water.replicas);
    expect(normalized.sampleTypes.water.conservation).toBe(fallback.sampleTypes.water.conservation);
    expect(normalized.sampleTypes.water.quantity).toBeNull();
    expect(normalized.sampleTypes.water.depthM).toBeNull();
    expect(legacy.sampleTypes.water.conservation).toBe("LONGMIRE");
  });

  it("permite apagar um texto ou um número padrão", () => {
    const normalized = normalizeCollectionDefaults({
      standardVersion: 2,
      sampleTypes: { water: { packaging: "", specification: "", quantity: "", depthM: null } },
    });

    expect(normalized.sampleTypes.water.packaging).toBe("");
    expect(normalized.sampleTypes.water.specification).toBe("");
    expect(normalized.sampleTypes.water.quantity).toBeNull();
    expect(normalized.sampleTypes.water.depthM).toBeNull();
  });

  it("lê números digitados com vírgula", () => {
    expect(nonNegativeNumber("0,3")).toBe(0.3);
    expect(nonNegativeNumber(0)).toBe(0);
    expect(nonNegativeNumber("")).toBeNull();
    expect(nonNegativeNumber("-1")).toBeNull();
  });
});

describe("padrão de coleta — conservante", () => {
  it("oferece as opções que a equipe usa, nesta ordem, e guarda as antigas só para o que já foi gravado", () => {
    expect(currentConservationTypes.map((option) => option.label)).toEqual([
      "Álcool com congelamento",
      "Álcool sem congelamento",
      "Longmire",
      "Sílica",
      "Outro",
    ]);
    expect(conservationTypes.some((option) => option.value === "FILTRO_CONGELADO" && !option.current)).toBe(true);
  });

  it("mostra o nome do conservante; em Outro, o que foi escrito", () => {
    expect(conservationText("LONGMIRE", "")).toBe("Longmire");
    expect(conservationText("OUTRO", "RNAlater")).toBe("RNAlater");
    expect(conservationText("OUTRO", "")).toBe("");
    expect(conservationText("FILTRO_CONGELADO", "Longmire")).toBe("Filtro congelado (Longmire)");
    expect(conservationText("LONGMIRE", "longmire")).toBe("Longmire");
  });

  it("na coluna do Biolog, usa o valor mais próximo da lista de lá", () => {
    expect(biologConservation("ALCOOL_COM_CONGELAMENTO", "water")).toBe("FILTRO_EM_ALCOOL_COM_REFRIGERACAO");
    expect(biologConservation("ALCOOL_SEM_CONGELAMENTO", "blank")).toBe("FILTRO_EM_ALCOOL_SEM_REFRIGERACAO");
    expect(biologConservation("ALCOOL_COM_CONGELAMENTO", "plankton")).toBe("OUTRO");
    expect(biologConservation("LONGMIRE", "water")).toBe("OUTRO");
    expect(biologConservation("SILICA", "water")).toBe("OUTRO");
    expect(biologConservation("FILTRO_CONGELADO", "water")).toBe("FILTRO_CONGELADO");
  });

  it("converte mL em L (plâncton gravado antes da 2.0.9)", () => {
    expect(convertQuantity(500, "mL", "L")).toBe(0.5);
    expect(convertQuantity(2, "L", "mL")).toBe(2000);
    expect(convertQuantity(250, "g", "mL")).toBe(250);
    expect(convertQuantity(null, "mL", "L")).toBeNull();
  });
});
