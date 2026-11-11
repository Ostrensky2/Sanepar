import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_READINGS_PER_ENTRY,
  addReadingDraft,
  baseParameterCatalog,
  buildDefaultReadingDrafts,
  buildParameterId,
  describeParameterRange,
  describeReadingDetails,
  describeReadingsForLog,
  equipmentByParameter,
  findParameterByLabel,
  formatReadingValue,
  normalizeParameterInput,
  normalizeReadingInput,
  parseReadingNumber,
  rangeWarning,
  readFieldParameter,
  readingDraftsToInputs,
  readingsForSample,
  readingsToDrafts,
  sortReadings,
  timeOfDay,
  validateReadingDrafts,
  type FieldParameter,
  type FieldReading,
  type ReadingDraft,
} from "@/lib/field-parameters";
import {
  FIELD_PARAMETER_ID_PATTERN,
  baseFieldParameters,
  buildProjectCollectionDefaults,
  normalizeCollectionDefaults,
  normalizeFieldParameterIds,
} from "@/lib/field-standard";

const catalog = baseParameterCatalog();
const custom: FieldParameter = {
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
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function factory(overrides: Partial<Parameters<typeof addReadingDraft>[2]> = {}) {
  let next = 0;

  return {
    defaultDepthM: "0",
    lastEquipment: {},
    newId: () => uuid(++next),
    ...overrides,
  };
}

function draft(overrides: Partial<ReadingDraft> = {}): ReadingDraft {
  return {
    id: uuid(1),
    parameterId: "ph",
    value: "7,2",
    depthM: "0",
    measuredTime: "09:30",
    equipment: "",
    saved: false,
    ...overrides,
  };
}

function reading(overrides: Partial<FieldReading> = {}): FieldReading {
  return {
    id: uuid(1),
    entryId: "registro-1",
    parameterId: "ph",
    value: 7.2,
    unit: "",
    depthM: 0,
    measuredTime: "09:30",
    equipment: "",
    ...overrides,
  };
}

describe("parâmetros de campo — catálogo", () => {
  it("começa com os oito parâmetros do padrão, na ordem do padrão", () => {
    expect(catalog.map((parameter) => parameter.label)).toEqual(baseFieldParameters.map((parameter) => parameter.label));
    expect(catalog.every((parameter) => parameter.isBase && parameter.active)).toBe(true);
    expect(catalog.map((parameter) => parameter.sortOrder)).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
  });

  it("tem condutividade como parâmetro de verdade, com unidade", () => {
    const conductivity = catalog.find((parameter) => parameter.id === "conductivity");

    expect(conductivity).toMatchObject({ label: "Condutividade", unit: "µS/cm", usesDepth: true });
  });

  it("sabe quais parâmetros não têm profundidade", () => {
    expect(catalog.filter((parameter) => !parameter.usesDepth).map((parameter) => parameter.id)).toEqual([
      "air_temperature",
      "secchi_transparency",
    ]);
  });

  it("acha um parâmetro pelo nome sem ligar para acento, caixa ou espaço", () => {
    expect(findParameterByLabel(catalog, "  temperatura DA agua ")?.id).toBe("water_temperature");
    expect(findParameterByLabel([...catalog, custom], "CLOROFILA-A")?.id).toBe("clorofila_a");
    expect(findParameterByLabel(catalog, "Nitrato")).toBeNull();
    expect(findParameterByLabel(catalog, "   ")).toBeNull();
  });

  it("gera o identificador de um parâmetro novo a partir do nome", () => {
    expect(buildParameterId("Clorofila a", [])).toBe("clorofila_a");
    expect(buildParameterId("Sólidos totais (mg/L)", [])).toBe("solidos_totais_mg_l");
    expect(buildParameterId("2,4-D", [])).toBe("p_2_4_d");
    expect(buildParameterId("Clorofila a", ["clorofila_a"])).toBe("clorofila_a_2");
    expect(buildParameterId("Clorofila a", ["clorofila_a", "clorofila_a_2"])).toBe("clorofila_a_3");
    expect(buildParameterId("x", [])).toBe("parametro");

    for (const label of ["Clorofila a", "2,4-D", "x", "Um nome de parâmetro bem comprido para testar o limite do identificador"]) {
      expect(buildParameterId(label, [])).toMatch(FIELD_PARAMETER_ID_PATTERN);
    }
  });

  it("confere o que a pessoa informa ao criar um parâmetro", () => {
    expect(normalizeParameterInput({ label: "  Clorofila   a ", unit: " µg/L ", min: "0", max: "500,5" })).toEqual({
      ok: true,
      parameter: {
        label: "Clorofila a",
        unit: "µg/L",
        min: 0,
        max: 500.5,
        appliesTo: ["water", "soil", "air", "tissue", "plankton"],
        usesDepth: true,
      },
    });
    expect(
      normalizeParameterInput({ label: "Vento", appliesTo: ["air", "zooplankton"], usesDepth: false, min: "", max: null }),
    ).toEqual({
      ok: true,
      parameter: { label: "Vento", unit: "", min: null, max: null, appliesTo: ["air"], usesDepth: false },
    });
  });

  it("recusa parâmetro sem nome, com faixa invertida ou sem tipo de amostra", () => {
    const errorOf = (raw: unknown) => {
      const result = normalizeParameterInput(raw);
      return result.ok ? "" : result.error;
    };

    expect(errorOf({ label: "  " })).toContain("nome");
    expect(errorOf({ label: "..." })).toContain("letras ou números");
    expect(errorOf({ label: "x".repeat(61) })).toContain("60");
    expect(errorOf({ label: "Nitrato", unit: "x".repeat(21) })).toContain("unidade");
    expect(errorOf({ label: "Nitrato", min: "abc" })).toContain("faixa");
    expect(errorOf({ label: "Nitrato", min: 10, max: 5 })).toContain("maior");
    expect(errorOf({ label: "Nitrato", min: 5, max: 5 })).toContain("maior");
    expect(errorOf({ label: "Nitrato", appliesTo: [] })).toContain("tipo de amostra");
    expect(errorOf(null)).toContain("nome");
  });

  it("lê um parâmetro vindo da nuvem e descarta o que está fora do padrão", () => {
    expect(readFieldParameter({ ...custom })).toEqual(custom);
    expect(readFieldParameter({ ...custom, id: "Clorofila A" })).toBeNull();
    expect(readFieldParameter({ ...custom, label: "" })).toBeNull();
    expect(readFieldParameter({ ...custom, appliesTo: ["zooplankton"] })).toBeNull();
    expect(readFieldParameter("texto")).toBeNull();
    expect(readFieldParameter({ id: "nitrato", label: "Nitrato", appliesTo: ["water"] })).toMatchObject({
      unit: "",
      min: null,
      max: null,
      usesDepth: true,
      isBase: false,
      active: true,
    });
  });
});

describe("parâmetros de campo — valor, hora e faixa esperada", () => {
  it("aceita número com vírgula, ponto e sinal", () => {
    expect(parseReadingNumber("7,2")).toEqual({ value: 7.2, valid: true });
    expect(parseReadingNumber(" 120.5 ")).toEqual({ value: 120.5, valid: true });
    expect(parseReadingNumber("-3,5")).toEqual({ value: -3.5, valid: true });
    expect(parseReadingNumber("+4")).toEqual({ value: 4, valid: true });
    expect(parseReadingNumber(0)).toEqual({ value: 0, valid: true });
  });

  it("vazio é sem valor, e texto que não é número é inválido", () => {
    expect(parseReadingNumber("")).toEqual({ value: null, valid: true });
    expect(parseReadingNumber(null)).toEqual({ value: null, valid: true });
    expect(parseReadingNumber(undefined)).toEqual({ value: null, valid: true });

    for (const text of ["sete", "7,2 mg", "1.234,5", "7,", ",5", "1e5", "--1", "99999999999"]) {
      expect(parseReadingNumber(text), text).toEqual({ value: null, valid: false });
    }
  });

  it("anota a hora no formato HH:MM", () => {
    expect(timeOfDay(new Date(2026, 10, 7, 9, 5))).toBe("09:05");
    expect(timeOfDay(new Date(2026, 10, 7, 23, 59))).toBe("23:59");
  });

  it("descreve a faixa esperada", () => {
    expect(describeParameterRange({ min: 0, max: 14 })).toBe("0 a 14");
    expect(describeParameterRange({ min: -2, max: 40.5 })).toBe("-2 a 40,5");
    expect(describeParameterRange({ min: 0, max: null })).toBe("a partir de 0");
    expect(describeParameterRange({ min: null, max: 40 })).toBe("até 40");
    expect(describeParameterRange({ min: null, max: null })).toBe("");
  });

  it("avisa quando o valor está fora da faixa, sem impedir", () => {
    const ph = catalog.find((parameter) => parameter.id === "ph") as FieldParameter;
    const conductivity = catalog.find((parameter) => parameter.id === "conductivity") as FieldParameter;

    expect(rangeWarning(ph, 7.2)).toBe("");
    expect(rangeWarning(ph, 0)).toBe("");
    expect(rangeWarning(ph, 14)).toBe("");
    expect(rangeWarning(ph, null)).toBe("");
    expect(rangeWarning(ph, 72)).toBe("Fora da faixa esperada (0 a 14). Confira o valor; dá para salvar assim mesmo.");
    expect(rangeWarning(conductivity, -1)).toContain("(0 a 100000 µS/cm)");
    expect(rangeWarning({ min: null, max: null, unit: "" }, 1e9)).toBe("");
  });
});

describe("parâmetros de campo — medições no formulário", () => {
  it("abre uma linha em branco para cada parâmetro que a campanha mede em todo ponto", () => {
    const drafts = buildDefaultReadingDrafts(
      ["ph", "air_temperature", "conductivity", "parametro_que_saiu"],
      catalog,
      factory({ lastEquipment: { ph: "Sonda multiparâmetro" } }),
    );

    // Na ordem do catálogo, não na ordem em que foram marcados.
    expect(drafts.map((item) => item.parameterId)).toEqual(["air_temperature", "ph", "conductivity"]);
    expect(drafts.every((item) => item.value === "" && item.measuredTime === "" && !item.saved)).toBe(true);
    expect(drafts.map((item) => item.depthM)).toEqual(["", "0", "0"]);
    expect(drafts.map((item) => item.equipment)).toEqual(["", "Sonda multiparâmetro", ""]);
    expect(new Set(drafts.map((item) => item.id)).size).toBe(3);
  });

  it("não propõe parâmetro desativado", () => {
    const withInactive = catalog.map((parameter) => (parameter.id === "ph" ? { ...parameter, active: false } : parameter));

    expect(buildDefaultReadingDrafts(["ph", "turbidity"], withInactive, factory()).map((item) => item.parameterId)).toEqual([
      "turbidity",
    ]);
    expect(buildDefaultReadingDrafts([], catalog, factory())).toEqual([]);
  });

  it("a segunda medição do mesmo parâmetro nasce sem profundidade, para a pessoa informar outra", () => {
    const ph = catalog.find((parameter) => parameter.id === "ph") as FieldParameter;
    const options = factory({ defaultDepthM: "0" });
    const first = addReadingDraft([], ph, options);
    const second = addReadingDraft(first, ph, options);

    expect(first.map((item) => item.depthM)).toEqual(["0"]);
    expect(second.map((item) => item.depthM)).toEqual(["0", ""]);
    expect(second[1].id).not.toBe(second[0].id);
  });

  it("respeita o limite de medições por registro", () => {
    const ph = catalog.find((parameter) => parameter.id === "ph") as FieldParameter;
    const full = Array.from({ length: MAX_READINGS_PER_ENTRY }, (_, index) => draft({ id: uuid(index + 1) }));

    expect(addReadingDraft(full, ph, factory())).toBe(full);
  });

  it("ordena pelo catálogo e, no mesmo parâmetro, da superfície para o fundo, com a sem profundidade por último", () => {
    const sorted = sortReadings(
      [
        draft({ id: uuid(1), parameterId: "turbidity", depthM: "0" }),
        draft({ id: uuid(2), parameterId: "ph", depthM: "10" }),
        draft({ id: uuid(3), parameterId: "clorofila_a", depthM: "0" }),
        draft({ id: uuid(4), parameterId: "ph", depthM: "2,5" }),
        draft({ id: uuid(5), parameterId: "air_temperature", depthM: "" }),
        draft({ id: uuid(6), parameterId: "ph", depthM: "" }),
      ],
      [...catalog, custom],
    );

    expect(sorted.map((item) => `${item.parameterId}@${item.depthM}`)).toEqual([
      "air_temperature@",
      "ph@2,5",
      "ph@10",
      "ph@",
      "turbidity@0",
      "clorofila_a@0",
    ]);
  });

  it("deixa gravar medições válidas e ignora as linhas em branco", () => {
    const drafts = [
      draft({ id: uuid(1), parameterId: "ph", value: "7,2" }),
      draft({ id: uuid(2), parameterId: "conductivity", value: "", depthM: "abc", measuredTime: "9h" }),
      draft({ id: uuid(3), parameterId: "air_temperature", value: "-3,5", depthM: "", measuredTime: "" }),
      draft({ id: uuid(4), parameterId: "ph", value: "6,9", depthM: "5" }),
    ];

    expect(validateReadingDrafts(drafts, catalog)).toEqual([]);
    expect(readingDraftsToInputs(drafts, catalog)).toEqual([
      { id: uuid(1), parameterId: "ph", value: 7.2, depthM: 0, measuredTime: "09:30", equipment: "" },
      { id: uuid(3), parameterId: "air_temperature", value: -3.5, depthM: null, measuredTime: "", equipment: "" },
      { id: uuid(4), parameterId: "ph", value: 6.9, depthM: 5, measuredTime: "09:30", equipment: "" },
    ]);
  });

  it("valor fora da faixa esperada não impede gravar", () => {
    expect(validateReadingDrafts([draft({ value: "72" })], catalog)).toEqual([]);
  });

  it("aponta valor, profundidade e hora inválidos", () => {
    const errors = validateReadingDrafts(
      [
        draft({ id: uuid(1), parameterId: "ph", value: "sete" }),
        draft({ id: uuid(2), parameterId: "conductivity", value: "120", depthM: "fundo" }),
        draft({ id: uuid(3), parameterId: "turbidity", value: "3", measuredTime: "9h30" }),
      ],
      catalog,
    );

    expect(errors).toEqual([
      "pH: o valor deve ser um número (ex.: 7,2).",
      "Condutividade: a profundidade deve ser um número em metros (0 = superfície).",
      "Turbidez: a hora da medição deve ser como 09:30.",
    ]);
  });

  it("não deixa repetir o mesmo parâmetro na mesma profundidade", () => {
    const sameDepth = validateReadingDrafts(
      [draft({ id: uuid(1), depthM: "0" }), draft({ id: uuid(2), depthM: "0,0" })],
      catalog,
    );
    const noDepth = validateReadingDrafts(
      [
        draft({ id: uuid(1), parameterId: "air_temperature", value: "20", depthM: "" }),
        // A profundidade de um parâmetro sem profundidade não conta.
        draft({ id: uuid(2), parameterId: "air_temperature", value: "21", depthM: "5" }),
      ],
      catalog,
    );

    expect(sameDepth).toEqual([
      "pH: há duas medições na mesma profundidade. Mude a profundidade de uma ou remova a repetida.",
    ]);
    expect(noDepth).toEqual(["Temperatura do ar: há duas medições. Remova a repetida."]);
    expect(validateReadingDrafts([draft({ id: uuid(1), depthM: "0" }), draft({ id: uuid(2), depthM: "5" })], catalog)).toEqual([]);
    expect(validateReadingDrafts([draft({ id: uuid(1), depthM: "0" }), draft({ id: uuid(2), depthM: "" })], catalog)).toEqual([]);
  });

  it("aponta medição de parâmetro que não está no catálogo", () => {
    expect(validateReadingDrafts([draft({ parameterId: "sumiu" })], catalog)).toEqual([
      "Há uma medição de um parâmetro que não está no catálogo. Remova a medição.",
    ]);
  });

  it("limita a quantidade de medições com valor", () => {
    const many = Array.from({ length: MAX_READINGS_PER_ENTRY + 1 }, (_, index) =>
      draft({ id: uuid(index + 1), depthM: String(index) }),
    );

    expect(validateReadingDrafts(many, catalog)[0]).toContain(String(MAX_READINGS_PER_ENTRY));
  });

  it("leva as medições gravadas para o formulário com vírgula decimal", () => {
    expect(
      readingsToDrafts([reading({ value: 120.5, depthM: 2.5, equipment: "Sonda" }), reading({ id: uuid(2), depthM: null })]),
    ).toEqual([
      { id: uuid(1), parameterId: "ph", value: "120,5", depthM: "2,5", measuredTime: "09:30", equipment: "Sonda", saved: true },
      { id: uuid(2), parameterId: "ph", value: "7,2", depthM: "", measuredTime: "09:30", equipment: "", saved: true },
    ]);
  });
});

describe("parâmetros de campo — o que o servidor aceita", () => {
  const valid = { id: uuid(1), parameterId: "ph", value: 7.2, depthM: 0, measuredTime: "09:30", equipment: " Sonda " };

  it("aceita uma medição no padrão e limpa o texto", () => {
    expect(normalizeReadingInput(valid)).toEqual({ ...valid, equipment: "Sonda" });
    expect(normalizeReadingInput({ id: uuid(2), parameterId: "air_temperature", value: -3.5 })).toEqual({
      id: uuid(2),
      parameterId: "air_temperature",
      value: -3.5,
      depthM: null,
      measuredTime: "",
      equipment: "",
    });
  });

  it("recusa o que foge do padrão", () => {
    const invalid: Array<Record<string, unknown>> = [
      { ...valid, id: "abc" },
      { ...valid, parameterId: "pH" },
      { ...valid, parameterId: "" },
      { ...valid, value: "7,2" },
      { ...valid, value: Number.NaN },
      { ...valid, value: Number.POSITIVE_INFINITY },
      { ...valid, value: 1e10 },
      { ...valid, depthM: -1 },
      { ...valid, depthM: "0" },
      { ...valid, depthM: 20000 },
      { ...valid, measuredTime: "24:00" },
      { ...valid, measuredTime: "9:30" },
      { ...valid, equipment: "x".repeat(121) },
    ];

    for (const raw of invalid) {
      expect(normalizeReadingInput(raw), JSON.stringify(raw)).toBeNull();
    }

    expect(normalizeReadingInput(null)).toBeNull();
    expect(normalizeReadingInput([valid])).toBeNull();
  });
});

describe("parâmetros de campo — resumos e ligação com as amostras", () => {
  it("escreve o valor com a unidade e vírgula decimal", () => {
    expect(formatReadingValue(7.2, "")).toBe("7,2");
    expect(formatReadingValue(120, "µS/cm")).toBe("120 µS/cm");
  });

  it("resume profundidade, hora e equipamento numa linha", () => {
    expect(describeReadingDetails({ depthM: 0, measuredTime: "09:30", equipment: "Sonda multiparâmetro" })).toBe(
      "Superfície · 09:30 · Sonda multiparâmetro",
    );
    expect(describeReadingDetails({ depthM: 2.5, measuredTime: "", equipment: "" })).toBe("2,5 m de profundidade");
    expect(describeReadingDetails({ depthM: null, measuredTime: "", equipment: "" })).toBe("");
  });

  it("descreve as medições para o histórico do registro", () => {
    expect(
      describeReadingsForLog(
        [
          reading({ id: uuid(1), parameterId: "conductivity", value: 131, unit: "µS/cm", depthM: 5 }),
          reading({ id: uuid(2), parameterId: "ph", value: 7.2, depthM: 0 }),
          reading({ id: uuid(3), parameterId: "conductivity", value: 120.5, unit: "µS/cm", depthM: 0 }),
        ],
        catalog,
      ),
    ).toBe("pH 7,2; Condutividade 120,5 µS/cm; Condutividade 131 µS/cm (5 m)");
    expect(describeReadingsForLog([], catalog)).toBe("");
  });

  it("liga a medição às amostras do mesmo tipo e da mesma profundidade", () => {
    const readings = [
      reading({ id: uuid(1), parameterId: "air_temperature", value: 22, depthM: null }),
      reading({ id: uuid(2), parameterId: "ph", value: 7.2, depthM: 0 }),
      reading({ id: uuid(3), parameterId: "ph", value: 6.9, depthM: 5 }),
      reading({ id: uuid(4), parameterId: "conductivity", value: 120, depthM: 0 }),
      reading({ id: uuid(5), parameterId: "secchi_transparency", value: 1.2, depthM: null }),
    ];
    const idsFor = (sample: Parameters<typeof readingsForSample>[2]) =>
      readingsForSample(readings, catalog, sample).map((item) => item.id);

    // Água na superfície: tudo o que é da superfície e o que não tem profundidade.
    expect(idsFor({ sampleType: "water", depthM: 0 })).toEqual([uuid(1), uuid(2), uuid(4), uuid(5)]);
    // Água a 5 m: só o pH de 5 m, mais o que não tem profundidade.
    expect(idsFor({ sampleType: "water", depthM: 5 })).toEqual([uuid(1), uuid(3), uuid(5)]);
    // Amostra de água sem profundidade informada recebe todas as medições de água.
    expect(idsFor({ sampleType: "water", depthM: null })).toEqual([uuid(1), uuid(2), uuid(3), uuid(4), uuid(5)]);
    // Solo não tem profundidade: recebe o pH (que vale para solo) e a temperatura do ar.
    expect(idsFor({ sampleType: "soil", depthM: null })).toEqual([uuid(1), uuid(2), uuid(3)]);
    // Ar e tecido: só a temperatura do ar.
    expect(idsFor({ sampleType: "air", depthM: null })).toEqual([uuid(1)]);
    expect(idsFor({ sampleType: "tissue", depthM: 3 })).toEqual([uuid(1)]);
  });

  it("guarda o equipamento de cada parâmetro para a próxima medição", () => {
    expect(
      equipmentByParameter([
        { parameterId: "ph", equipment: " Sonda A " },
        { parameterId: "conductivity", equipment: "" },
        { parameterId: "ph", equipment: "Sonda B" },
      ]),
    ).toEqual({ ph: "Sonda B" });
  });
});

describe("parâmetros de campo — padrão da campanha", () => {
  it("o projeto não propõe parâmetro nenhum enquanto a equipe não marcar", () => {
    expect(buildProjectCollectionDefaults().fieldParameterIds).toEqual([]);
  });

  it("guarda a lista de parâmetros medidos em todo ponto, sem repetição nem lixo", () => {
    expect(normalizeFieldParameterIds(["ph", "conductivity", "ph", "Temperatura", 7, null, "clorofila_a"])).toEqual([
      "ph",
      "conductivity",
      "clorofila_a",
    ]);
    expect(normalizeFieldParameterIds("ph")).toEqual([]);
    expect(normalizeFieldParameterIds(Array.from({ length: 50 }, (_, index) => `parametro_${index}`))).toHaveLength(30);
  });

  it("padrões gravados antes dos parâmetros continuam valendo", () => {
    const saved = normalizeCollectionDefaults({ destinationLab: "LAPOA" });

    expect(saved.destinationLab).toBe("LAPOA");
    expect(saved.fieldParameterIds).toEqual([]);
    expect(normalizeCollectionDefaults({ fieldParameterIds: ["ph", "turbidity"] }).fieldParameterIds).toEqual([
      "ph",
      "turbidity",
    ]);
  });
});

describe("parâmetros de campo — catálogo do banco igual ao do padrão", () => {
  const migration = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20261111140000_field_parameters.sql"),
    "utf8",
  );

  it("a migration cadastra os mesmos oito parâmetros, com a mesma unidade, faixa e ordem", () => {
    const text = (value: string | null) => (value === null ? "null" : `'${value}'`);

    for (const [index, parameter] of baseFieldParameters.entries()) {
      const line =
        `('${parameter.id}', '${parameter.label}', '${parameter.unit}', ${parameter.min}, ${parameter.max}, ` +
        `array[${parameter.appliesTo.map((type) => `'${type}'`).join(",")}], ${parameter.usesDepth}, ` +
        `${text(parameter.biologColumn)}, true, ${(index + 1) * 10})`;

      expect(migration, parameter.id).toContain(line);
    }

    expect(migration.match(/, true, \d+\)[,\n]/g)).toHaveLength(baseFieldParameters.length);
  });

  it("o banco confere o mesmo formato de identificador que o app", () => {
    expect(migration).toContain(`check (id ~ '${FIELD_PARAMETER_ID_PATTERN.source}')`);
  });
});
