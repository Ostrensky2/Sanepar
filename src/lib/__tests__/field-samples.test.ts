import { describe, expect, it } from "vitest";
import {
  MAX_SAMPLES_PER_ENTRY,
  addSampleDraft,
  applySuggestedSequences,
  buildDefaultSampleDrafts,
  describeDefaultSamples,
  describeSampleCounts,
  describeSampleDetails,
  describeSampleDraft,
  exportedDateLabel,
  legacyFieldsFromCodes,
  legacyFieldsFromSamples,
  legacyFieldsPatch,
  nextDraftSequence,
  normalizeSampleInput,
  parseSampleNumber,
  sampleCodeOf,
  sampleCodeProblem,
  sampleDraftsToInputs,
  samplesToDrafts,
  validateSampleDrafts,
  type FieldSample,
  type SampleDraft,
} from "@/lib/field-samples";
import { buildProjectCollectionDefaults } from "@/lib/field-standard";

// Amostras do ponto: como nascem dos padrões da campanha, como o código acompanha
// o registro e o que é conferido antes de gravar.

const context = { projectCode: "YVA", date: "2026-11-07", point: "SIA-0136" };

function idFactory() {
  let next = 0;
  return () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`;
}

function options(overrides: Partial<Parameters<typeof buildDefaultSampleDrafts>[0]> = {}) {
  return { defaults: buildProjectCollectionDefaults(), newId: idFactory(), ...overrides };
}

function draft(overrides: Partial<SampleDraft> = {}): SampleDraft {
  return {
    id: "00000000-0000-4000-8000-0000000000aa",
    sampleType: "water",
    sequence: 1,
    depthM: "0",
    quantity: "1000",
    specification: "eDNA",
    conservation: "FILTRO_CONGELADO",
    packaging: "Isopor com gelo",
    boxPosition: "",
    savedCode: "",
    ...overrides,
  };
}

describe("amostras propostas pelo padrão da campanha", () => {
  it("propõe 3 de água e 1 de plâncton, já com os valores do padrão", () => {
    const drafts = buildDefaultSampleDrafts(options());

    expect(drafts.map((item) => `${item.sampleType}${item.sequence}`)).toEqual([
      "water1",
      "water2",
      "water3",
      "plankton1",
    ]);
    expect(drafts[0]).toMatchObject({
      depthM: "0",
      quantity: "1000",
      conservation: "FILTRO_CONGELADO",
      packaging: "Isopor com gelo",
      specification: "eDNA",
      savedCode: "",
    });
    expect(describeDefaultSamples(buildProjectCollectionDefaults())).toBe("3 de Água e 1 de Plâncton");
    expect(describeSampleCounts(drafts)).toBe("3 de Água e 1 de Plâncton");
  });

  it("usa o último acondicionamento do aparelho no lugar do padrão da campanha", () => {
    const drafts = buildDefaultSampleDrafts(options({ lastPackaging: { water: "Caixa térmica 2" } }));

    expect(drafts.filter((item) => item.sampleType === "water").every((item) => item.packaging === "Caixa térmica 2")).toBe(true);
    expect(drafts.find((item) => item.sampleType === "plankton")?.packaging).toBe("Isopor com gelo");
  });

  it("não propõe nada quando a campanha zera as réplicas", () => {
    const defaults = buildProjectCollectionDefaults();
    defaults.sampleTypes.water.replicas = 0;
    defaults.sampleTypes.plankton.replicas = 0;

    expect(buildDefaultSampleDrafts(options({ defaults }))).toEqual([]);
    expect(describeDefaultSamples(defaults)).toBe("");
  });

  it("tipo sem profundidade nasce sem profundidade", () => {
    const defaults = buildProjectCollectionDefaults();
    defaults.sampleTypes.soil = { ...defaults.sampleTypes.soil, replicas: 1, depthM: 3, quantity: 50 };

    const soil = buildDefaultSampleDrafts(options({ defaults })).find((item) => item.sampleType === "soil");

    expect(soil).toMatchObject({ depthM: "", quantity: "50" });
  });
});

describe("+ Amostra", () => {
  it("repete a última amostra do tipo, com o próximo número e sem posição nem código gravado", () => {
    const first = draft({ sequence: 2, depthM: "5", boxPosition: "A3", savedCode: "YVA-071126-0136-AG2" });
    const next = addSampleDraft([first], "water", options());

    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ sampleType: "water", sequence: 3, depthM: "5", boxPosition: "", savedCode: "" });
    expect(next[1].id).not.toBe(first.id);
  });

  it("primeira amostra de um tipo vem do padrão da campanha", () => {
    const next = addSampleDraft([draft()], "tissue", options());

    expect(next[1]).toMatchObject({ sampleType: "tissue", sequence: 1, depthM: "", conservation: "OUTRO" });
  });

  it("numera pelo maior número do tipo, e não pela quantidade", () => {
    expect(nextDraftSequence([draft({ sequence: 1 }), draft({ sequence: 4 })], "water")).toBe(5);
    expect(nextDraftSequence([draft({ sequence: 4 })], "plankton")).toBe(1);
  });

  it("para no limite de amostras por registro", () => {
    const full = Array.from({ length: MAX_SAMPLES_PER_ENTRY }, (_, index) => draft({ id: `id-${index}`, sequence: index + 1 }));

    expect(addSampleDraft(full, "water", options())).toBe(full);
  });
});

describe("código da etiqueta", () => {
  it("acompanha a data e o ponto do registro", () => {
    expect(sampleCodeOf(draft({ sequence: 2 }), context)).toEqual({ code: "YVA-071126-0136-AG2", error: "" });
    expect(sampleCodeOf(draft({ sampleType: "plankton" }), { ...context, date: "2026-11-08", point: "771" }).code).toBe(
      "YVA-081126-0771-PL1",
    );
  });

  it("sem ponto ou sem data explica o que falta, em vez de inventar um código", () => {
    expect(sampleCodeOf(draft(), { ...context, point: "" })).toEqual({
      code: "",
      error: "Informe o ponto de coleta (SIA) para gerar o código da amostra.",
    });
    expect(sampleCodeOf(draft(), { ...context, date: "" }).error).toContain("data da coleta");
  });
});

describe("conferência antes de gravar", () => {
  it("aceita vírgula ou ponto e trata vazio como não informado", () => {
    expect(parseSampleNumber("0,5", 100)).toEqual({ value: 0.5, valid: true });
    expect(parseSampleNumber("12.25", 100)).toEqual({ value: 12.25, valid: true });
    expect(parseSampleNumber("", 100)).toEqual({ value: null, valid: true });
    expect(parseSampleNumber("0", 100)).toEqual({ value: 0, valid: true });
    expect(parseSampleNumber("-1", 100).valid).toBe(false);
    expect(parseSampleNumber("dois", 100).valid).toBe(false);
    expect(parseSampleNumber("101", 100).valid).toBe(false);
  });

  it("registro sem amostras não tem o que conferir", () => {
    expect(validateSampleDrafts([], { ...context, point: "" })).toEqual([]);
  });

  it("recusa amostras sem ponto, número repetido e número digitado errado", () => {
    expect(validateSampleDrafts([draft()], { ...context, point: "" })[0]).toContain("Informe o ponto de coleta (SIA)");
    expect(validateSampleDrafts([draft(), draft({ id: "outra" })], context)).toEqual([
      "Há duas amostras com o número AG1. Remova uma delas.",
    ]);
    expect(validateSampleDrafts([draft({ depthM: "fundo" })], context)).toEqual([
      "Água 1: a profundidade deve ser um número em metros (0 = superfície).",
    ]);
    expect(validateSampleDrafts([draft({ quantity: "1 litro" })], context)).toEqual([
      "Água 1: volume deve ser um número em mL.",
    ]);
    expect(validateSampleDrafts([draft()], context)).toEqual([]);
  });

  it("monta o que vai para a nuvem com o código, a unidade do tipo e os números", () => {
    const [water, tissue] = sampleDraftsToInputs(
      [
        draft({ depthM: "2,5", quantity: "500", specification: "  filtro 0,45 µm  ", boxPosition: " A3 " }),
        draft({ id: "t", sampleType: "tissue", depthM: "9", quantity: "", conservation: "AMOSTRA_BRUTA_CONGELADA" }),
      ],
      context,
    );

    expect(water).toEqual({
      id: "00000000-0000-4000-8000-0000000000aa",
      code: "YVA-071126-0136-AG1",
      sampleType: "water",
      sequence: 1,
      depthM: 2.5,
      quantity: 500,
      quantityUnit: "mL",
      specification: "filtro 0,45 µm",
      conservation: "FILTRO_CONGELADO",
      packaging: "Isopor com gelo",
      boxPosition: "A3",
    });
    // Tecido não tem profundidade: o que estiver digitado não é gravado.
    expect(tissue).toMatchObject({ code: "YVA-071126-0136-TE1", depthM: null, quantity: null, quantityUnit: "g" });
  });

  it("lê as amostras gravadas de volta para o formulário, na ordem do padrão", () => {
    const saved: FieldSample[] = [
      { ...sampleDraftsToInputs([draft({ sampleType: "plankton", depthM: "" })], context)[0], id: "p", entryId: "e", projectCode: "YVA" },
      { ...sampleDraftsToInputs([draft({ sequence: 2, depthM: "0,5" })], context)[0], id: "w2", entryId: "e", projectCode: "YVA" },
      { ...sampleDraftsToInputs([draft()], context)[0], id: "w1", entryId: "e", projectCode: "YVA" },
    ];

    const drafts = samplesToDrafts(saved);

    expect(drafts.map((item) => item.id)).toEqual(["w1", "w2", "p"]);
    expect(drafts[1]).toMatchObject({ depthM: "0,5", quantity: "1000", savedCode: "YVA-071126-0136-AG2" });
    expect(drafts[2]).toMatchObject({ depthM: "", savedCode: "YVA-071126-0136-PL1" });
  });
});

describe("amostra que já saiu na planilha do Biolog", () => {
  const exported = draft({ savedCode: "YVA-071126-0136-AG1", exportedAt: "2026-11-09T15:00:00.000Z" });

  it("fica com o código gravado, mesmo com outra data ou outro ponto no registro", () => {
    expect(sampleCodeOf(exported, { ...context, date: "2026-11-08", point: "0140" })).toEqual({
      code: "YVA-071126-0136-AG1",
      error: "",
    });
    // A que ainda não foi exportada segue a data e o ponto do registro.
    expect(sampleCodeOf(draft({ savedCode: "YVA-071126-0136-AG1" }), { ...context, date: "2026-11-08" }).code).toBe(
      "YVA-081126-0136-AG1",
    );
  });

  it("vai para a nuvem com o código gravado", () => {
    const inputs = sampleDraftsToInputs([exported, draft({ id: "b", sequence: 2 })], { ...context, date: "2026-11-08" });

    expect(inputs.map((input) => input.code)).toEqual(["YVA-071126-0136-AG1", "YVA-081126-0136-AG2"]);
    expect(inputs[0]).not.toHaveProperty("exportedAt");
  });

  it("registro que ficou sem ponto só reclama se houver amostra ainda não exportada", () => {
    const noPoint = { ...context, point: "" };

    expect(sampleCodeProblem([exported], noPoint)).toBe("");
    expect(validateSampleDrafts([exported], noPoint)).toEqual([]);
    expect(sampleCodeProblem([exported, draft({ id: "b", sequence: 2 })], noPoint)).toContain("Informe o ponto de coleta");
    expect(sampleCodeProblem([], noPoint)).toBe("");
  });

  it("a marca vem da amostra gravada, e a amostra nova copiada dela nasce sem a marca", () => {
    const saved: FieldSample = {
      id: "s1",
      entryId: "e1",
      code: "YVA-071126-0136-AG1",
      projectCode: "YVA",
      sampleType: "water",
      sequence: 1,
      depthM: 0,
      quantity: 1000,
      quantityUnit: "mL",
      specification: "",
      conservation: "FILTRO_CONGELADO",
      packaging: "",
      boxPosition: "A1",
      exportedAt: "2026-11-09T15:00:00.000Z",
    };
    const drafts = samplesToDrafts([saved, { ...saved, id: "s2", code: "YVA-071126-0136-PL1", sampleType: "plankton", exportedAt: null }]);
    const withNew = addSampleDraft(drafts, "water", options());

    expect(drafts.map((item) => item.exportedAt)).toEqual(["2026-11-09T15:00:00.000Z", ""]);
    expect(withNew.at(-1)).toMatchObject({ sampleType: "water", sequence: 2, savedCode: "", exportedAt: "" });
    expect(sampleCodeOf(withNew.at(-1)!, context).code).toBe("YVA-071126-0136-AG2");
  });

  it("não troca de número quando a nuvem propõe o próximo livre", () => {
    const result = applySuggestedSequences(
      [exported, draft({ id: "b", sequence: 2 })],
      [
        { sampleId: exported.id, code: "x", suggestedSequence: 7, suggestedCode: "y", sameEntry: false },
        { sampleId: "b", code: "x", suggestedSequence: 8, suggestedCode: "y", sameEntry: false },
      ],
    );

    expect(result.map((item) => item.sequence)).toEqual([1, 8]);
  });

  it("diz o dia da exportação, e nada quando não há data que valha", () => {
    expect(exportedDateLabel(new Date(2026, 10, 9, 12, 0).toISOString())).toBe("09/11/2026");
    expect(exportedDateLabel("")).toBe("");
    expect(exportedDateLabel(null)).toBe("");
    expect(exportedDateLabel("ontem")).toBe("");
  });
});

describe("amostra vinda de fora (corpo da requisição)", () => {
  const valid = {
    id: "6F1F8D1E-2B7A-4A43-9A51-0D6C1F0F5A11",
    code: "yva-071126-0136-ag1",
    sampleType: "water",
    sequence: 1,
    depthM: 0,
    quantity: "1000",
    conservation: "FILTRO_CONGELADO",
    packaging: "Isopor com gelo",
    specification: "eDNA",
    boxPosition: "A1",
    quantityUnit: "litros",
    extra: "ignorado",
  };

  it("normaliza id, código, unidade e descarta o que não é da amostra", () => {
    expect(normalizeSampleInput(valid)).toEqual({
      id: "6f1f8d1e-2b7a-4a43-9a51-0d6c1f0f5a11",
      code: "YVA-071126-0136-AG1",
      sampleType: "water",
      sequence: 1,
      depthM: 0,
      quantity: 1000,
      quantityUnit: "mL",
      specification: "eDNA",
      conservation: "FILTRO_CONGELADO",
      packaging: "Isopor com gelo",
      boxPosition: "A1",
    });
  });

  it.each([
    ["id que não é uuid", { id: "abc" }],
    ["tipo desconhecido", { sampleType: "zooplankton" }],
    ["número zero", { sequence: 0 }],
    ["número acima de 999", { sequence: 1000 }],
    ["profundidade negativa", { depthM: -1 }],
    ["quantidade em texto", { quantity: "muito" }],
    ["conservação fora da lista", { conservation: "GELADEIRA" }],
  ])("recusa %s", (_name, override) => {
    expect(normalizeSampleInput({ ...valid, ...override })).toBeNull();
  });

  it("recusa o que não é objeto", () => {
    expect(normalizeSampleInput(null)).toBeNull();
    expect(normalizeSampleInput([valid])).toBeNull();
    expect(normalizeSampleInput("amostra")).toBeNull();
  });
});

describe("código repetido", () => {
  it("troca só o número das amostras em conflito pelo próximo livre", () => {
    const drafts = [draft({ id: "a", sequence: 1 }), draft({ id: "b", sequence: 2 }), draft({ id: "c", sampleType: "plankton" })];
    const next = applySuggestedSequences(drafts, [
      { sampleId: "a", code: "YVA-071126-0136-AG1", suggestedSequence: 4, suggestedCode: "YVA-071126-0136-AG4", sameEntry: false },
    ]);

    expect(next.map((item) => `${item.id}:${item.sequence}`)).toEqual(["a:4", "b:2", "c:1"]);
  });
});

describe("campos de texto antigos do registro", () => {
  const samples = [draft({ id: "a" }), draft({ id: "b", sequence: 2 }), draft({ id: "c", sampleType: "plankton" })];

  it("resume as amostras: quantas de água e os códigos de plâncton", () => {
    expect(legacyFieldsFromSamples(samples, context)).toEqual({
      samplesReplicasEdna: "2 réplicas",
      zooplanktonId: "YVA-071126-0136-PL1",
    });
    expect(legacyFieldsFromSamples([draft()], context).samplesReplicasEdna).toBe("1 réplica");
    expect(legacyFieldsFromSamples([], context)).toEqual({ samplesReplicasEdna: "", zooplanktonId: "" });
  });

  it("sem ponto não escreve código de plâncton pela metade", () => {
    expect(legacyFieldsFromSamples(samples, { ...context, point: "" }).zooplanktonId).toBe("");
  });

  it("só lista os códigos de plâncton que cabem inteiros no campo", () => {
    const many = Array.from({ length: 10 }, (_, index) => ({
      sampleType: "plankton" as const,
      sequence: index + 1,
      code: `YVA-071126-0136-PL${index + 1}`,
    }));
    const text = legacyFieldsFromCodes(many).zooplanktonId;

    expect(text.length).toBeLessThanOrEqual(120);
    expect(text.split(", ").every((code) => /^YVA-071126-0136-PL\d+$/.test(code))).toBe(true);
    expect(text.startsWith("YVA-071126-0136-PL1, YVA-071126-0136-PL2")).toBe(true);
  });

  it("preenche campo vazio e atualiza o texto que o próprio app escreveu", () => {
    const before = { samplesReplicasEdna: "2 réplicas", zooplanktonId: "YVA-071126-0136-PL1" };
    const after = { samplesReplicasEdna: "3 réplicas", zooplanktonId: "YVA-081126-0136-PL1" };

    expect(legacyFieldsPatch({ samplesReplicasEdna: "", zooplanktonId: null }, { samplesReplicasEdna: "", zooplanktonId: "" }, before)).toEqual(before);
    expect(legacyFieldsPatch(before, before, after)).toEqual(after);
    expect(legacyFieldsPatch(after, after, after)).toEqual({});
  });

  it("não troca o que a pessoa digitou ou veio da planilha", () => {
    const typed = { samplesReplicasEdna: "3 réplicas + 1 branco", zooplanktonId: "ZOO-17" };

    expect(
      legacyFieldsPatch(typed, { samplesReplicasEdna: "2 réplicas", zooplanktonId: "" }, { samplesReplicasEdna: "3 réplicas", zooplanktonId: "YVA-071126-0136-PL1" }),
    ).toEqual({});
  });

  it("limpa o texto do app quando as amostras saem do registro", () => {
    const before = { samplesReplicasEdna: "2 réplicas", zooplanktonId: "YVA-071126-0136-PL1" };

    expect(legacyFieldsPatch(before, before, { samplesReplicasEdna: "", zooplanktonId: "" })).toEqual({
      samplesReplicasEdna: "",
      zooplanktonId: "",
    });
  });
});

describe("resumo de uma amostra em uma linha", () => {
  it("diz superfície, quantidade com unidade, conservação, acondicionamento e posição", () => {
    expect(describeSampleDraft(draft({ boxPosition: "A3" }))).toBe(
      "Superfície · 1000 mL · Filtro congelado · Isopor com gelo · eDNA · Posição A3",
    );
    expect(describeSampleDraft(draft({ depthM: "2,5", specification: "", packaging: "" }))).toBe(
      "2,5 m de profundidade · 1000 mL · Filtro congelado",
    );
  });

  it("omite o que não foi informado, a conservação “Outro” e a profundidade de quem não tem", () => {
    expect(
      describeSampleDetails({
        sampleType: "tissue",
        depthM: 3,
        quantity: null,
        conservation: "OUTRO",
        packaging: "",
        specification: "",
        boxPosition: "",
      }),
    ).toBe("");
  });
});
