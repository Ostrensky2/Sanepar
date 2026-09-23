import { describe, expect, it, vi } from "vitest";
import { localSourcePreviewAllowed, selectSourcePreview } from "./results-source-preview";
import type { ResultsWorkbookExportModel } from "@/modules/results/types";
const model = { campaignCodes: ["C1", "C2"], calculationVersion: "SANEPAR-INDICE-0.3", catalogVersion: "SANEPAR-RISCOS-0.3", sheets: [
  { name: "Metadata-C2", rows: [
    ["Campanha", "Cód. SIA", "Conjunto analisado", "Número de Reads", "Espécie"],
    ["C1", "SIA-01", "COI", 999, "A"],
    ["C2", "SIA-01", "COI", 10, "B"],
    ["C2", "SIA-02", "Bactérias", 20, "C"],
    ["C2", "SIA-01", "COI", 5, "D"],
  ] },
] } as ResultsWorkbookExportModel;
describe("local source preview", () => {
  it("supports the explicit Metadados alias without changing campaign filtering", () => {
    const renamed = structuredClone(model); renamed.sheets[0].name="Metadados";
    expect(selectSourcePreview(renamed,new URLSearchParams("campaignCode=C2")).counts.population).toBe(3);
  });
  it("isolates campaign, set/SIA, counts and pagination without changing input", () => {
    const before = JSON.stringify(model);
    const result = selectSourcePreview(model, new URLSearchParams("campaignCode=C2&set=coi&sia=SIA-01&limit=1&sort=Número+de+Reads&direction=desc"));
    expect(result.counts).toEqual({ population: 3, filtered: 2, returned: 1 });
    expect(result.readsBySet).toEqual({ coi: 15 });
    expect(result.rows[0]["Número de Reads"]).toBe(10);
    expect(JSON.stringify(model)).toBe(before);
    expect(result.source.published).toBe(false);
  });
  it("never adds reads across sets and exposes all pages", () => {
    const result = selectSourcePreview(model, new URLSearchParams("campaignCode=C2&offset=2&limit=1"));
    expect(result.readsBySet).toEqual({ coi: 15, bacteria: 20 });
    expect(result.counts).toEqual({ population: 3, filtered: 3, returned: 1 });
  });
  it("rejects invalid selection/limits", () => {
    expect(() => selectSourcePreview(model, new URLSearchParams("campaignCode=C3"))).toThrow();
    expect(() => selectSourcePreview(model, new URLSearchParams("campaignCode=C2&limit=9999"))).toThrow();
  });
  it("joins alerts only to a unique literal taxon and documented evidence", () => {
    const references = structuredClone(model);
    const padding = [[], [], [], []];
    references.sheets.push(
      {name:"Riscos_bibliografia", rows:[...padding,["ID organismo","Organismo do banco"],["ID-B","B"]]},
      {name:"Evidencias_risco", rows:[...padding,["ID organismo","Domínio","Score bibliográfico","Contexto"],["ID-B","Ambiental",2,"Bibliografia"],["ID-B","Saúde",null,"Sem score"]]},
    );
    const result = selectSourcePreview(references, new URLSearchParams("campaignCode=C2&section=alerts&organism=B"));
    expect(result.counts).toEqual({population:1,filtered:1,returned:1});
    expect(result.rows[0]["Evidência: Contexto"]).toBe("Bibliografia");
    expect(result.readsBySet).toEqual({});
  });
  it("summarizes alerts one point per row with literal evidence of the strongest organism", () => {
    const references = structuredClone(model);
    const padding = [[], [], [], []];
    references.sheets[0].rows.push(["C2", "SIA-01", "Bactérias", 40, "C"]);
    references.sheets.push(
      {name:"Riscos_bibliografia", rows:[...padding,["ID organismo","Organismo do banco"],["ID-B","B"],["ID-C","C"],["ID-D","D"]]},
      {name:"Evidencias_risco", rows:[...padding,["ID organismo","Domínio","Score bibliográfico","Efeito ou mecanismo documentado","Toxina ou composto"],
        ["ID-B","Ambiental",2,"Efeito B","Não identificado"],["ID-C","Saúde humana",3,"Efeito C","Toxina C"],["ID-C","Operacional",1,"Efeito C2",null],["ID-D","Ambiental",null,"Sem score",null]]},
    );
    const result = selectSourcePreview(references, new URLSearchParams("campaignCode=C2&section=alerts&groupBy=point"));
    expect(result.counts).toEqual({population:2,filtered:2,returned:2});
    expect(result.rows.find((row) => row["Cód. SIA"] === "SIA-01")).toMatchObject({"Organismos com associação":2,"Ambiental":1,"Operacional":1,"Saúde humana":1,"Maior score bibliográfico":3,"Organismo em destaque":"C","Conjunto do destaque":"Bactérias","Reads do destaque":40,"Efeito documentado":"Efeito C","Toxina ou composto":"Toxina C"});
    expect(result.rows.find((row) => row["Cód. SIA"] === "SIA-02")).toMatchObject({"Organismos com associação":1,"Saúde humana":1,"Ambiental":0,"Reads do destaque":20});
    expect(() => selectSourcePreview(references, new URLSearchParams("campaignCode=C2&section=molecular&groupBy=point"))).toThrow();
  });
  it("rejects production and external hosts", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(localSourcePreviewAllowed(new Request("http://localhost:3001/x", { headers: {host:"localhost:3001"} }))).toBe(false);
    vi.stubEnv("NODE_ENV", "development");
    expect(localSourcePreviewAllowed(new Request("http://localhost:3001/x", { headers: {host:"localhost:3001"} }))).toBe(true);
    expect(localSourcePreviewAllowed(new Request("http://localhost:3001/x", { headers: {host:"localhost:3001", "x-forwarded-host":"external.test"} }))).toBe(false);
    vi.unstubAllEnvs();
  });
});
