import { describe, expect, it } from "vitest";
import {
  emergencyActivities,
  emergencyActivitiesText,
  emergencyProblems,
  emergencyProblemText,
  formatEmergencyDate,
  isValidIsoDate,
  normalizeEmergencyEventInput,
  sortEmergencyEvents,
} from "@/lib/emergency-events";

const valid = {
  name: "  Cheiro forte na captação  ",
  reportedDate: "2026-11-20",
  visitDate: "2026-11-21",
  activities: ["photos", "edna", "nao-existe", "edna"],
  activityOther: "ignorado",
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
      visitDate: "2026-11-21",
      activities: ["edna", "photos"],
      activityOther: "",
      mainProblem: "taste_odor",
      mainProblemOther: "",
      sia: "780",
      location: "Captação ETA Iraí · Pinhais",
      description: "Moradores relataram cheiro.\nEquipe foi no dia seguinte.",
    });
  });

  it("aceita evento sem ida ao local e sem atividades", () => {
    const checked = normalizeEmergencyEventInput({ ...valid, visitDate: "", activities: [] });
    expect(checked.ok).toBe(true);
  });

  it.each([
    [{ name: "  " }, "name"],
    [{ reportedDate: "" }, "reportedDate"],
    [{ reportedDate: "2026-02-31" }, "reportedDate"],
    [{ visitDate: "21/11/2026" }, "visitDate"],
    [{ visitDate: "2026-11-19" }, "visitDate"],
    [{ mainProblem: "" }, "mainProblem"],
    [{ mainProblem: "inventado" }, "mainProblem"],
    [{ mainProblem: "other", mainProblemOther: " " }, "mainProblemOther"],
    [{ activities: ["other"], activityOther: "" }, "activityOther"],
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
