import { describe, expect, it } from "vitest";
import {
  FieldStandardError,
  baseFieldParameters,
  buildProjectCollectionDefaults,
  buildSampleCode,
  nextSampleSequence,
  nonNegativeNumber,
  normalizeCollectionDefaults,
  parseSampleCode,
  samplePointToken,
  sampleTypes,
} from "@/lib/field-standard";

describe("padrão de coleta — código da amostra", () => {
  it("gera o código curto combinado: projeto, data DDMMAA, SIA, tipo e sequência", () => {
    expect(
      buildSampleCode({ projectCode: "YVA", date: "2026-11-07", point: "0136", sampleType: "water", sequence: 1 }),
    ).toBe("YVA-071126-0136-AG1");
    expect(
      buildSampleCode({ projectCode: "yva", date: "2026-11-07", point: "SIA 136", sampleType: "plankton", sequence: 1 }),
    ).toBe("YVA-071126-0136-PL1");
  });

  it("cabe na etiqueta: 19 caracteres para um SIA de 4 dígitos", () => {
    const code = buildSampleCode({
      projectCode: "YVA",
      date: "2026-11-07",
      point: "0136",
      sampleType: "water",
      sequence: 3,
    });

    expect(code).toHaveLength(19);
  });

  it("usa uma sigla de 2 letras diferente para cada tipo de amostra", () => {
    const codes = sampleTypes.map((type) => type.code);

    expect(codes).toEqual(["AG", "SO", "AR", "TE", "PL"]);
    expect(new Set(codes).size).toBe(codes.length);
    expect(sampleTypes.map((type) => type.label)).toEqual(["Água", "Solo", "Ar", "Tecido", "Plâncton"]);
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
    const base = { projectCode: "YVA", date: "2026-11-07", point: "0136", sampleType: "water", sequence: 1 } as const;

    expect(() => buildSampleCode({ ...base, projectCode: "YVAE" })).toThrow(FieldStandardError);
    expect(() => buildSampleCode({ ...base, projectCode: "Y1A" })).toThrow(FieldStandardError);
    expect(() => buildSampleCode({ ...base, date: "07/11/2026" })).toThrow(FieldStandardError);
    expect(() => buildSampleCode({ ...base, date: "2026-02-30" })).toThrow(FieldStandardError);
    expect(() => buildSampleCode({ ...base, point: "  " })).toThrow(FieldStandardError);
    expect(() => buildSampleCode({ ...base, point: "Reservatório Muito Comprido" })).toThrow(FieldStandardError);
    expect(() => buildSampleCode({ ...base, sequence: 0 })).toThrow(FieldStandardError);
    expect(() => buildSampleCode({ ...base, sequence: 1.5 })).toThrow(FieldStandardError);
    expect(() => buildSampleCode({ ...base, sequence: 1000 })).toThrow(FieldStandardError);
  });

  it("lê de volta o que gerou", () => {
    const input = { projectCode: "YVA", date: "2026-11-07", point: "0136", sampleType: "plankton", sequence: 12 } as const;

    expect(parseSampleCode(buildSampleCode(input))).toEqual(input);
    expect(parseSampleCode(" yva-071126-0136-ag2 ")).toEqual({
      projectCode: "YVA",
      date: "2026-11-07",
      point: "0136",
      sampleType: "water",
      sequence: 2,
    });
  });

  it("não aceita como código o que está fora do padrão", () => {
    expect(parseSampleCode("")).toBeNull();
    expect(parseSampleCode("3 réplicas")).toBeNull();
    expect(parseSampleCode("YVA-20261107-0136-AG-001")).toBeNull();
    expect(parseSampleCode("YVA-071126-0136-ZO1")).toBeNull();
    expect(parseSampleCode("YVA-311126-0136-AG1")).toBeNull();
    expect(parseSampleCode("YVA-071126-0136-AG0")).toBeNull();
  });

  it("propõe a próxima sequência livre só entre amostras do mesmo ponto, dia e tipo", () => {
    const target = { projectCode: "YVA", date: "2026-11-07", point: "136", sampleType: "water" } as const;
    const existing = [
      "YVA-071126-0136-AG1",
      "YVA-071126-0136-AG3",
      "YVA-071126-0136-PL7",
      "YVA-081126-0136-AG9",
      "YVA-071126-0137-AG9",
      "ABC-071126-0136-AG9",
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
    expect(Object.keys(defaults.sampleTypes)).toEqual(["water", "soil", "air", "tissue", "plankton"]);
  });

  it("completa com o padrão do projeto o que não foi gravado", () => {
    expect(normalizeCollectionDefaults(undefined)).toEqual(buildProjectCollectionDefaults());
    expect(normalizeCollectionDefaults("texto")).toEqual(buildProjectCollectionDefaults());

    const partial = normalizeCollectionDefaults({
      destinationLab: "LAPOA",
      sampleTypes: { water: { replicas: 2, quantity: "500,5", depthM: 5 } },
    });

    expect(partial.destinationLab).toBe("LAPOA");
    expect(partial.projectCode).toBe("YVA");
    expect(partial.sampleTypes.water.replicas).toBe(2);
    expect(partial.sampleTypes.water.quantity).toBe(500.5);
    expect(partial.sampleTypes.water.depthM).toBe(5);
    expect(partial.sampleTypes.water.conservation).toBe("FILTRO_CONGELADO");
    expect(partial.sampleTypes.plankton).toEqual(buildProjectCollectionDefaults().sampleTypes.plankton);
  });

  it("descarta valores fora da lista em vez de gravar algo que o laboratório não reconhece", () => {
    const normalized = normalizeCollectionDefaults({
      projectCode: "sanepar",
      destinationLab: "OUTRO LAB",
      objective: "passeio",
      waterMatrix: "AGUA_BENTA",
      sampleTypes: { water: { replicas: -1, conservation: "NO BOLSO", quantity: -5, depthM: "abc" } },
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
  });

  it("permite apagar um texto ou um número padrão", () => {
    const normalized = normalizeCollectionDefaults({
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
