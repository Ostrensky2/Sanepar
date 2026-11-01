import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  coordinateToText,
  parseCoordinate,
  validateCoordinatePair,
} from "@/lib/coordinates";
import { normalizeFieldDiaryEntry } from "@/lib/field-diary";
import {
  FieldDiaryValidationError,
  fieldDiaryRuleColumns,
  fieldDiaryRuleErrors,
  fieldDiaryRuleFields,
} from "@/lib/field-diary-validation";
import {
  LEGACY_VOCABULARY_EQUIVALENCE,
  activityOptions,
  canonicalOccurrenceType,
  canonicalPointAccessibility,
  canonicalVocabularyList,
  canonicalWeatherCondition,
  occurrenceTypeOptions,
  pointAccessibilityOptions,
  waterVisualConditionOptions,
  weatherConditionOptions,
} from "@/lib/field-diary-vocabulary";
import {
  inferPointExecutionStatus,
  parsePointExecutionStatus,
  validateRelocation,
} from "@/lib/point-execution-status";

const MIGRATION = readFileSync(
  path.resolve(
    __dirname,
    "../../../supabase/migrations/20261101120000_field_diary_coordinates_status_vocabulary.sql",
  ),
  "utf8",
);

describe("coordenada em número", () => {
  it("converte o texto antigo com vírgula, ponto e espaços para número de 6 casas", () => {
    expect(parseCoordinate("-25,4284", "latitude")).toEqual({ status: "valid", value: -25.4284 });
    expect(parseCoordinate(" -49.2733 ", "longitude")).toEqual({ status: "valid", value: -49.2733 });
    expect(parseCoordinate("-25.48193345", "latitude")).toEqual({ status: "valid", value: -25.481933 });
    expect(parseCoordinate("+25", "latitude")).toEqual({ status: "valid", value: 25 });
    expect(parseCoordinate("-25.", "latitude")).toEqual({ status: "valid", value: -25 });
    expect(parseCoordinate(-49.19, "longitude")).toEqual({ status: "valid", value: -49.19 });
    expect(parseCoordinate("", "latitude")).toEqual({ status: "empty" });
    expect(parseCoordinate(null, "latitude")).toEqual({ status: "empty" });
  });

  it("recusa texto que não é número e valor fora da faixa", () => {
    for (const value of ["abc", "25°26'S", "-25,4,1", "1e5", "-", "--25"]) {
      expect(parseCoordinate(value, "latitude")).toEqual({ status: "invalid", reason: "not_a_number" });
    }
    expect(parseCoordinate("-90.000001", "latitude")).toEqual({ status: "invalid", reason: "out_of_range" });
    expect(parseCoordinate("91", "latitude")).toEqual({ status: "invalid", reason: "out_of_range" });
    expect(parseCoordinate("180.5", "longitude")).toEqual({ status: "invalid", reason: "out_of_range" });
    expect(parseCoordinate("-180", "longitude")).toEqual({ status: "valid", value: -180 });
  });

  it("recusa coordenada inválida com mensagem clara em português", () => {
    const notNumber = validateCoordinatePair("abc", "-49.1");
    expect(notNumber).toEqual({ ok: false, error: expect.stringContaining("A latitude “abc” não é um número válido") });

    const outOfRange = validateCoordinatePair("-25.1", "-200");
    expect(outOfRange).toEqual({
      ok: false,
      error: "A longitude “-200” está fora da faixa permitida (entre -180 e 180).",
    });
  });

  it("recusa par incompleto e aceita as duas vazias", () => {
    expect(validateCoordinatePair("-25.1", "")).toEqual({
      ok: false,
      error: "Informe a longitude junto com a latitude, ou deixe as duas em branco.",
    });
    expect(validateCoordinatePair(null, "-49.1")).toEqual({
      ok: false,
      error: "Informe a latitude junto com a longitude, ou deixe as duas em branco.",
    });
    expect(validateCoordinatePair("", " ")).toEqual({ ok: true, latitude: null, longitude: null });
    expect(validateCoordinatePair("-25,5", "-49,1")).toEqual({ ok: true, latitude: -25.5, longitude: -49.1 });
  });

  it("o texto aceito pelo app é o mesmo que a migration converte", () => {
    // A expressão da migration e a do app precisam aceitar exatamente os mesmos textos.
    expect(MIGRATION).toContain("'^[+-]?([0-9]+([.,][0-9]*)?|[.,][0-9]+)$'");
    expect(MIGRATION).toContain("numeric(9,6)");
    expect(MIGRATION).toContain("latitude is null or latitude between -90 and 90");
    expect(MIGRATION).toContain("longitude is null or longitude between -180 and 180");
    expect(MIGRATION).toContain("(latitude is null) = (longitude is null)");
  });

  it("numeric do banco volta como texto para o formulário", () => {
    expect(coordinateToText(-25.4284)).toBe("-25.4284");
    expect(coordinateToText("-25.428400")).toBe("-25.4284");
    expect(coordinateToText(null)).toBe("");
    expect(fieldDiaryRuleFields({ latitude: -25.5, longitude: -49.1, execution_status: "relocated", relocation_reason: "Ponte caída" }))
      .toEqual({ latitude: "-25.5", longitude: "-49.1", executionStatus: "relocated", relocationReason: "Ponte caída" });
  });
});

describe("ponto realocado com motivo obrigatório", () => {
  it("recusa realocado sem motivo ou só com espaços", () => {
    expect(validateRelocation("relocated", "")).toBe(
      "Informe o motivo da realocação: um ponto realocado precisa de justificativa.",
    );
    expect(validateRelocation("Realocado", "   ")).not.toBeNull();
    expect(validateRelocation("relocated", "x".repeat(501))).toContain("até 500 caracteres");
    expect(validateRelocation("relocated", "Margem alagada")).toBeNull();
    expect(validateRelocation("realized", "")).toBeNull();
  });

  it("aceita código e rótulo em português", () => {
    expect(parsePointExecutionStatus("Não realizado")).toBe("not_realized");
    expect(parsePointExecutionStatus("nao realizado")).toBe("not_realized");
    expect(parsePointExecutionStatus("REALOCADO")).toBe("relocated");
    expect(parsePointExecutionStatus("blocked")).toBe("blocked");
    expect(parsePointExecutionStatus("movido")).toBeNull();
  });

  it("a gravação recusa o registro com a mensagem do formulário", () => {
    const relocatedWithoutReason = { latitude: "-25.1", longitude: "-49.1", executionStatus: "relocated", relocationReason: "" };
    expect(fieldDiaryRuleErrors(relocatedWithoutReason)).toEqual([
      "Informe o motivo da realocação: um ponto realocado precisa de justificativa.",
    ]);
    expect(() => fieldDiaryRuleColumns(relocatedWithoutReason)).toThrow(FieldDiaryValidationError);
    expect(fieldDiaryRuleErrors({ executionStatus: "movido" })[0]).toContain("não é reconhecida");
  });

  it("monta as colunas do banco já conferidas", () => {
    expect(
      fieldDiaryRuleColumns({
        latitude: "-25,4284",
        longitude: "-49,2733",
        executionStatus: "relocated",
        relocationReason: "  Ponte caída  ",
      }),
    ).toEqual({ latitude: -25.4284, longitude: -49.2733, execution_status: "relocated", relocation_reason: "Ponte caída" });
    expect(
      fieldDiaryRuleColumns({ latitude: "", longitude: "", executionStatus: "realized", relocationReason: "sobra" }),
    ).toEqual({ latitude: null, longitude: null, execution_status: "realized", relocation_reason: null });
  });

  it("infere a situação dos registros antigos sem nunca inferir realocado", () => {
    expect(inferPointExecutionStatus({ activities: ["Coleta não realizada"] })).toBe("not_realized");
    expect(inferPointExecutionStatus({ hasOccurrence: true, occurrenceType: "Coleta não realizada" })).toBe("not_realized");
    expect(inferPointExecutionStatus({ activities: ["Coleta de eDNA"] })).toBe("realized");
    expect(inferPointExecutionStatus({ hasOccurrence: true, occurrenceType: "Ponto inacessível" })).toBe("blocked");
    expect(inferPointExecutionStatus({ pointAccessibility: "Inacessível" })).toBe("blocked");
    expect(inferPointExecutionStatus({ pointAccessibility: "Acesso bloqueado" })).toBe("blocked");
    expect(inferPointExecutionStatus({})).toBe("planned");
    expect(MIGRATION).toContain("'not_realized'");
    expect(MIGRATION).toContain("then 'blocked'");
  });
});

describe("vocabulário comum com o IAGen", () => {
  const IAGEN = {
    activities: ["Coleta de eDNA", "Coleta de zooplâncton", "Pesca experimental", "Medição de parâmetros", "Registro fotográfico", "Reconhecimento do ponto"],
    water: ["Água clara", "Água turva", "Presença de sedimento", "Presença de espuma", "Presença de macrófitas", "Presença de óleo ou película", "Odor perceptível"],
    weather: ["Céu limpo", "Parcialmente nublado", "Nublado", "Chuva fraca", "Chuva forte", "Vento forte"],
    accessibility: ["Acesso normal", "Acesso difícil", "Acesso bloqueado", "Acesso somente por embarcação"],
    occurrence: ["Condição climática", "Falha de equipamento", "Acesso impedido", "Segurança", "Alteração ambiental observada", "Outra"],
  };

  it("contém todos os termos do IAGen e mantém os termos próprios do Sanepar", () => {
    expect(activityOptions).toEqual(expect.arrayContaining(IAGEN.activities));
    expect(waterVisualConditionOptions).toEqual(expect.arrayContaining(IAGEN.water));
    expect([...weatherConditionOptions]).toEqual(expect.arrayContaining(IAGEN.weather));
    expect([...pointAccessibilityOptions]).toEqual(expect.arrayContaining(IAGEN.accessibility));
    expect(occurrenceTypeOptions).toEqual(expect.arrayContaining(IAGEN.occurrence));
    expect(occurrenceTypeOptions).toEqual(
      expect.arrayContaining(["Coleta parcial", "Coleta não realizada", "Ponto inacessível", "Atraso operacional"]),
    );
  });

  it("todo termo antigo tem equivalente na lista nova (nenhum registro fica sem valor)", () => {
    const lists = {
      activities: activityOptions,
      waterVisualConditions: waterVisualConditionOptions,
      weatherConditions: [...weatherConditionOptions] as string[],
      pointAccessibility: [...pointAccessibilityOptions] as string[],
      occurrenceType: occurrenceTypeOptions,
    };
    for (const [kind, equivalence] of Object.entries(LEGACY_VOCABULARY_EQUIVALENCE)) {
      for (const newTerm of Object.values(equivalence)) {
        expect(lists[kind as keyof typeof lists]).toContain(newTerm);
      }
    }
    for (const old of ["Sol", "Sol entre nuvens", "Nublado Pós Chuva", "Chuvoso", "Chuva forte", "Tempestade", "Garoando", "Nublado / Neblina", "Não informado"]) {
      expect(canonicalWeatherCondition(old)).not.toBe("");
    }
    for (const old of ["Fácil", "Moderado", "Difícil", "Inacessível"]) {
      expect(canonicalPointAccessibility(old)).not.toBe("");
    }
  });

  it("traduz termo antigo, sem diferenciar maiúscula e acento, e preserva termo desconhecido", () => {
    expect(canonicalWeatherCondition("sol entre nuvens")).toBe("Parcialmente nublado");
    expect(canonicalPointAccessibility("INACESSIVEL")).toBe("Acesso bloqueado");
    expect(canonicalOccurrenceType("Problema com equipamento")).toBe("Falha de equipamento");
    expect(canonicalOccurrenceType("Coleta parcial")).toBe("Coleta parcial");
    expect(canonicalOccurrenceType("Termo livre da planilha")).toBe("Termo livre da planilha");
    expect(canonicalVocabularyList("activities", ["Coleta realizada", "Vistoria visual", "Coleta de eDNA"], { zooplanktonId: "Z1" }))
      .toEqual(["Coleta de eDNA", "Coleta de zooplâncton", "Reconhecimento do ponto"]);
    expect(canonicalVocabularyList("activities", ["Coleta realizada"], { zooplanktonId: "" })).toEqual(["Coleta de eDNA"]);
    expect(canonicalVocabularyList("waterVisualConditions", ["Espuma", "Resíduos", " "])).toEqual(["Presença de espuma", "Resíduos"]);
  });

  it("a tabela de equivalência da migration é a mesma do app", () => {
    const sqlPairs = [...MIGRATION.matchAll(/\('(\w+)', '([^']+)', '([^']+)'\)/g)].map(
      ([, kind, oldTerm, newTerm]) => `${kind}|${oldTerm}|${newTerm}`,
    );
    const appPairs = Object.entries(LEGACY_VOCABULARY_EQUIVALENCE).flatMap(([kind, equivalence]) =>
      Object.entries(equivalence).map(([oldTerm, newTerm]) => `${kind}|${oldTerm}|${newTerm}`),
    );
    expect(sqlPairs.sort()).toEqual(appPairs.sort());
  });

  it("o registro lido do banco já aparece com os termos novos", () => {
    const entry = normalizeFieldDiaryEntry({
      id: "e1",
      campaignName: "2ª Campanha",
      entryDate: "2026-06-01",
      activities: ["Coleta realizada", "Medição em campo"],
      waterVisualConditions: ["Aparentemente normal"],
      weatherConditions: "Garoando",
      pointAccessibility: "Moderado",
      hasOccurrence: true,
      occurrenceType: "Outro",
      latitude: -25.5,
      longitude: -49.1,
    });
    expect(entry).toMatchObject({
      activities: ["Coleta de eDNA", "Medição de parâmetros"],
      waterVisualConditions: ["Água clara"],
      weatherConditions: "Chuva fraca",
      pointAccessibility: "Acesso moderado",
      occurrenceType: "Outra",
      latitude: "-25.5",
      longitude: "-49.1",
      executionStatus: undefined,
    });
  });
});
