import { describe, expect, it } from "vitest";
import {
  emergencyActivities,
  emergencyActivitiesText,
  emergencyProblems,
  emergencyProblemText,
  formatEmergencyDate,
  isValidIsoDate,
  isBlankEmergencyVisit,
  normalizeEmergencyEventInput,
  parseStoredEmergencyVisits,
  sortEmergencyEvents,
} from "@/lib/emergency-events";

const valid = {
  name: "  Cheiro forte na captação  ",
  reportedDate: "2026-11-20",
  visits: [
    {
      id: "ida-2",
      date: "2026-11-24",
      objective: "  Nova coleta  ",
      activities: ["other", "water"],
      activityOther: "  Batimetria\r\nReunião com a operação  ",
      notes: "",
    },
    // Bloco que a tela mostra em branco: não conta como ida.
    { id: "vazia", date: "", objective: " ", activities: [], activityOther: "", notes: "" },
    {
      id: "ida-1",
      date: "2026-11-21",
      objective: "Primeira vistoria",
      activities: ["photos", "edna", "nao-existe", "edna"],
      activityOther: "ignorado",
      notes: "Água esverdeada perto da tomada.",
    },
  ],
  mainProblem: "taste_odor",
  mainProblemOther: "ignorado",
  sia: "780",
  location: "Captação ETA Iraí · Pinhais",
  description: "  Moradores relataram cheiro.\r\nEquipe foi no dia seguinte.  ",
};

describe("eventos emergenciais: opções", () => {
  it("tem as atividades e os problemas pedidos, sem códigos repetidos", () => {
    const activityLabels = emergencyActivities.map((activity) => activity.label);
    for (const label of ["Coleta de eDNA", "Coleta de água", "Coleta de plâncton", "Fotos", "Parâmetros de qualidade da água"]) {
      expect(activityLabels).toContain(label);
    }
    const problemLabels = emergencyProblems.map((problem) => problem.label);
    for (const label of ["Entupimento de filtros", "Contaminação", "Cheiro ou gosto na água", "Eutrofização do reservatório"]) {
      expect(problemLabels).toContain(label);
    }
    expect(new Set(emergencyActivities.map((a) => a.id)).size).toBe(emergencyActivities.length);
    expect(new Set(emergencyProblems.map((p) => p.id)).size).toBe(emergencyProblems.length);
  });
});

describe("eventos emergenciais: conferência do formulário", () => {
  it("limpa os textos, ordena as atividades e descarta os campos de 'outro' que não se aplicam", () => {
    const checked = normalizeEmergencyEventInput(valid);
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.event).toEqual({
      name: "Cheiro forte na captação",
      reportedDate: "2026-11-20",
      visits: [
        {
          id: "ida-1",
          date: "2026-11-21",
          objective: "Primeira vistoria",
          activities: ["edna", "photos"],
          activityOther: "",
          notes: "Água esverdeada perto da tomada.",
        },
        {
          id: "ida-2",
          date: "2026-11-24",
          objective: "Nova coleta",
          activities: ["water", "other"],
          activityOther: "Batimetria\nReunião com a operação",
          notes: "",
        },
      ],
      mainProblem: "taste_odor",
      mainProblemOther: "",
      sia: "780",
      location: "Captação ETA Iraí · Pinhais",
      description: "Moradores relataram cheiro.\nEquipe foi no dia seguinte.",
    });
  });

  it("aceita evento sem ida ao local, e ida sem atividades", () => {
    const none = normalizeEmergencyEventInput({ ...valid, visits: [] });
    expect(none.ok && none.event.visits).toEqual([]);
    const missing = normalizeEmergencyEventInput({ ...valid, visits: undefined });
    expect(missing.ok && missing.event.visits).toEqual([]);
    const bare = normalizeEmergencyEventInput({ ...valid, visits: [{ date: "2026-11-21" }] });
    expect(bare.ok).toBe(true);
    if (!bare.ok) return;
    expect(bare.event.visits).toEqual([
      { id: expect.any(String), date: "2026-11-21", objective: "", activities: [], activityOther: "", notes: "" },
    ]);
  });

  it("dá identificador novo a ida sem identificador ou repetida", () => {
    const checked = normalizeEmergencyEventInput({
      ...valid,
      visits: [{ id: "x", date: "2026-11-21" }, { id: "x", date: "2026-11-22" }, { id: "<script>", date: "2026-11-23" }],
    });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    const ids = checked.event.visits.map((visit) => visit.id);
    expect(ids[0]).toBe("x");
    expect(new Set(ids).size).toBe(3);
    expect(ids[2]).toMatch(/^[A-Za-z0-9-]+$/);
  });

  it.each([
    [{ date: "" , objective: "Voltar lá" }, "visits.date"],
    [{ date: "21/11/2026" }, "visits.date"],
    [{ date: "2026-11-19" }, "visits.date"],
    [{ date: "2026-11-21", activities: ["other"], activityOther: " " }, "visits.activityOther"],
  ])("recusa a ida %j apontando o campo %s e qual ida é", (visit, field) => {
    const checked = normalizeEmergencyEventInput({ ...valid, visits: [valid.visits[2], visit] });
    expect(checked.ok).toBe(false);
    if (checked.ok) return;
    expect(checked.field).toBe(field);
    expect(checked.visitIndex).toBe(1);
    expect(checked.error).toMatch(/^2ª ida: /);
  });

  it("recusa mais idas do que o limite", () => {
    const visits = Array.from({ length: 51 }, () => ({ date: "2026-11-21" }));
    const checked = normalizeEmergencyEventInput({ ...valid, visits });
    expect(checked.ok).toBe(false);
    if (checked.ok) return;
    expect(checked.field).toBe("visits");
  });

  it.each([
    [{ name: "  " }, "name"],
    [{ reportedDate: "" }, "reportedDate"],
    [{ reportedDate: "2026-02-31" }, "reportedDate"],
    [{ mainProblem: "" }, "mainProblem"],
    [{ mainProblem: "inventado" }, "mainProblem"],
    [{ mainProblem: "other", mainProblemOther: " " }, "mainProblemOther"],
    [{ description: " \n " }, "description"],
  ])("recusa %j apontando o campo %s", (patch, field) => {
    const checked = normalizeEmergencyEventInput({ ...valid, ...patch });
    expect(checked.ok).toBe(false);
    if (checked.ok) return;
    expect(checked.field).toBe(field);
    expect(checked.error).toMatch(/\S/);
  });

  it("mostra o texto digitado para 'Outro problema' e 'Outra atividade'", () => {
    expect(emergencyProblemText({ mainProblem: "other", mainProblemOther: "Rompimento de adutora" })).toBe("Rompimento de adutora");
    expect(emergencyProblemText({ mainProblem: "fish_kill", mainProblemOther: "" })).toBe("Mortandade de peixes");
    expect(emergencyActivitiesText({ activities: ["other", "edna"], activityOther: "Batimetria" })).toEqual(["Coleta de eDNA", "Batimetria"]);
  });

  it("reconhece o bloco de ida em branco", () => {
    expect(isBlankEmergencyVisit({ id: "a", date: "", objective: " ", activities: [], activityOther: "", notes: "" })).toBe(true);
    expect(isBlankEmergencyVisit({ activities: ["edna"] })).toBe(false);
    expect(isBlankEmergencyVisit({ activities: ["nao-existe"] })).toBe(true);
    expect(isBlankEmergencyVisit({ notes: "Fui lá" })).toBe(false);
  });

  it("lê as idas gravadas no banco em ordem de data, descartando o que não tem data válida", () => {
    expect(
      parseStoredEmergencyVisits([
        { id: "b", date: "2026-11-24", activities: ["water", "sumiu"], objective: "Nova coleta" },
        { id: "a", date: "2026-11-21T00:00:00Z", activities: ["photos", "edna"], notes: "ok" },
        { id: "c", date: "sem data" },
        "lixo",
      ]),
    ).toEqual([
      { id: "a", date: "2026-11-21", objective: "", activities: ["edna", "photos"], activityOther: "", notes: "ok" },
      { id: "b", date: "2026-11-24", objective: "Nova coleta", activities: ["water"], activityOther: "", notes: "" },
    ]);
    expect(parseStoredEmergencyVisits(null)).toEqual([]);
  });
});

describe("eventos emergenciais: datas e ordem", () => {
  it("confere datas do calendário e formata em DD/MM/AAAA", () => {
    expect(isValidIsoDate("2028-02-29")).toBe(true);
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(formatEmergencyDate("2026-11-05")).toBe("05/11/2026");
  });

  it("lista os mais recentes primeiro", () => {
    const sorted = sortEmergencyEvents([
      { name: "B", reportedDate: "2026-10-01", createdAt: "2026-10-01T10:00:00Z" },
      { name: "A", reportedDate: "2026-11-01", createdAt: "2026-11-01T10:00:00Z" },
      { name: "C", reportedDate: "2026-11-01", createdAt: "2026-11-02T10:00:00Z" },
    ]);
    expect(sorted.map((event) => event.name)).toEqual(["C", "A", "B"]);
  });
});
