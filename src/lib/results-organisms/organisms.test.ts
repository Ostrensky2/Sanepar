import { existsSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { captureFichas, captureIndexRows } from "@/lib/capture-index";
import { workbookStore } from "@/lib/sia-workbook-store";
import { buildOrganismDocument, organismDocument, organismOccurrences, organismsCampaign, type LibraryChoice, type OrganismSource } from "./index";
import { parseUnifiedWorkbook, siaKey } from "./workbook";

/** Exóticas com identificação sustentada: as únicas que podem aparecer em espécie na nota e nas fichas. */
const SUSTAINED = ["Aquarana catesbeiana", "Cordylophora caspia", "Craspedacusta sowerbii", "Kellicottia bostoniensis", "Limnoperna fortunei", "Micropterus salmoides"];
const binomial = /^[A-Z][a-z]+ [a-z]{3,}$/;

/** Planilha unificada sintética (nenhum dado real): duas corridas, três pontos. SIA 3 só tem COI no MiSeq; SIA 9 não tem biblioteca COI. */
async function syntheticWorkbook(change: (book: ExcelJS.Workbook) => void = () => {}) {
  const book = new ExcelJS.Workbook();
  const add = (name: string, header: string[], rows: (string | number)[][]) => { const sheet = book.addWorksheet(name); sheet.addRow(header); for (const row of rows) sheet.addRow(row); };
  add("Resumo", ["Item", "Valor"], [["Campanha", "Sintética"]]);
  const lib = ["SIA", "Plataforma / run da fonte", "Biblioteca"], run = ["SIA", "Plataforma / run da fonte"];
  add("16S generos", [...lib, "Alfa", "Beta", "Sem gênero: Gamaceae"], [["SIA-0001", "MiSeq", "PRESENTE", 1, 0, 9], ["SIA-0001", "NextSeq", "PRESENTE", 10, 0, 40], ["SIA-0003", "MiSeq", "PRESENTE", 2, 3, 0], ["SIA-0003", "NextSeq", "PRESENTE", 20, 30, 0], ["SIA-0009", "NextSeq", "PRESENTE", 0, 5, 0]]);
  add("16S familias", [...lib, "Alfaceae", "Sem família: Gamales"], [["SIA-0001", "MiSeq", "PRESENTE", 1, 9], ["SIA-0001", "NextSeq", "PRESENTE", 10, 40], ["SIA-0003", "MiSeq", "PRESENTE", 5, 0], ["SIA-0003", "NextSeq", "PRESENTE", 50, 0], ["SIA-0009", "NextSeq", "PRESENTE", 5, 0]]);
  add("Associações 16S", [...run, "Toxinas", "Biofilmes", "Total de reads 16S"], [["SIA-0001", "MiSeq", 1, 1, 10], ["SIA-0001", "NextSeq", 10, 20, 100], ["SIA-0003", "MiSeq", 0, 2, 5], ["SIA-0003", "NextSeq", 0, 20, 50], ["SIA-0009", "NextSeq", 0, 0, 5]]);
  add("COI generos", [...lib, "Limnoperna", "Corbicula"], [["SIA-0001", "MiSeq", "PRESENTE", 1, 1], ["SIA-0001", "NextSeq", "PRESENTE", 30, 0], ["SIA-0003", "MiSeq", "PRESENTE", 0, 8], ["SIA-0003", "NextSeq", "BIBLIOTECA_AUSENTE", 0, 0], ["SIA-0009", "NextSeq", "BIBLIOTECA_AUSENTE", 0, 0]]);
  add("COI familias", [...lib, "Mytilidae", "Cyrenidae"], [["SIA-0001", "MiSeq", "PRESENTE", 1, 1], ["SIA-0001", "NextSeq", "PRESENTE", 30, 0], ["SIA-0003", "MiSeq", "PRESENTE", 0, 8], ["SIA-0003", "NextSeq", "BIBLIOTECA_AUSENTE", 0, 0], ["SIA-0009", "NextSeq", "BIBLIOTECA_AUSENTE", 0, 0]]);
  add("Exóticas COI", [...run, "Limnoperna fortunei", "Salminus brasiliensis (status regional pendente)", "Corbicula spp. (candidata; espécie não resolvida)", "Total de reads COI"], [["SIA-0001", "MiSeq", 1, 0, 1, 4], ["SIA-0001", "NextSeq", 30, 2, 0, 300], ["SIA-0003", "MiSeq", 0, 0, 8, 80]]);
  change(book);
  return new Uint8Array(await book.xlsx.writeBuffer());
}
const library: LibraryChoice = (sia, marker) => marker === "16S" ? { run: "C3_NextSeq", status: "disponível" } : sia === "3" ? { run: "C3_MiSeq", status: "disponível" } : { run: "C3_NextSeq", status: sia === "1" ? "inconclusivo" : "ausente" };

describe("organismos pela planilha unificada da campanha", () => {
  it("lê só as abas de matrizes e recusa planilha fora do formato", async () => {
    const matrices = await parseUnifiedWorkbook(await syntheticWorkbook());
    expect(matrices["16S generos"]).toMatchObject({ headers: ["Alfa", "Beta", "Sem gênero: Gamaceae"] });
    expect(matrices["16S generos"].rows[0]).toEqual({ sia: "1", run: "MiSeq", present: true, values: [1, 0, 9] });
    expect(matrices["COI generos"].rows.filter(row => !row.present).map(row => `${row.sia}:${row.run}`)).toEqual(["3:NextSeq", "9:NextSeq"]);
    expect(["SIA-0011", "SIA 782", "0257", 1037].map(siaKey)).toEqual(["11", "782", "257", "1037"]);
    await expect(parseUnifiedWorkbook(await syntheticWorkbook(book => book.removeWorksheet("Exóticas COI")))).rejects.toThrow(/Exóticas COI ausente/);
    await expect(parseUnifiedWorkbook(await syntheticWorkbook(book => { book.getWorksheet("COI generos")!.getCell("D2").value = -1; }))).rejects.toThrow(/contagem inválida/);
    await expect(parseUnifiedWorkbook(await syntheticWorkbook(book => { book.getWorksheet("COI generos")!.addRow(["SIA-0001", "MiSeq", "PRESENTE", 1, 1]); }))).rejects.toThrow(/repetido/);
  });

  it("usa, em cada SIA, a corrida que deu a nota e nunca soma corridas", async () => {
    const document = buildOrganismDocument(3, { id: "x", arquivo: "sintetica.xlsx" }, await parseUnifiedWorkbook(await syntheticWorkbook()), library);
    const data = organismsCampaign(document);
    expect(data.markers["16S"]).toMatchObject({ points: 3, usablePoints: 3, runs: ["NextSeq"], inconclusive: [] });
    // COI: SIA 1 pelo NextSeq (inconclusiva), SIA 3 pelo MiSeq; SIA 9 não tem biblioteca.
    expect(data.markers.COI).toMatchObject({ points: 2, usablePoints: 1, runs: ["MiSeq", "NextSeq"], inconclusive: ["1"] });
    expect(data.markers["16S"].levels.genero!.map(row => [row.name, row.reads, row.points, row.unresolved ?? false])).toEqual([["Sem gênero: Gamaceae", 40, 1, true], ["Beta", 35, 2, false], ["Alfa", 30, 2, false]]);
    expect(data.markers["16S"].levels.risco!.map(row => row.name)).toEqual(["Biofilmes", "Toxinas"]);   // a coluna de total não é organismo
    expect(organismOccurrences(document, "16S", "genero", "Alfa")!.rows).toEqual([
      { sia: "3", reads: 20, total: 50, share: 0.4, run: "NextSeq", inconclusive: false }, { sia: "1", reads: 10, total: 100, share: 0.1, run: "NextSeq", inconclusive: false }]);
    expect(organismOccurrences(document, "COI", "genero", "Corbicula")!.rows).toEqual([{ sia: "3", reads: 8, total: 80, share: 0.1, run: "MiSeq", inconclusive: false }]);
    expect(organismOccurrences(document, "COI", "genero", "Dalbulus")).toBeNull();
  });

  it("espécie só nas exóticas, com a categoria do laboratório", async () => {
    const document = buildOrganismDocument(3, { id: "x", arquivo: "sintetica.xlsx" }, await parseUnifiedWorkbook(await syntheticWorkbook()), library);
    expect(organismsCampaign(document).markers.COI.levels.exoticas!.map(row => [row.name, row.category, row.reads, row.sias])).toEqual([
      ["Limnoperna fortunei", "confirmada", 30, ["1"]], ["Corbicula spp.", "candidata", 8, ["3"]], ["Salminus brasiliensis", "pendente", 2, ["1"]]]);
  });

  it("lê a planilha vigente do acervo e responde sem planilha quando a campanha não tem", async () => {
    const bytes = await syntheticWorkbook();
    const source: OrganismSource = { latest: async campaign => campaign === 3 ? { id: "a".repeat(64), filename: "sintetica.xlsx" } : null, read: async () => bytes };
    expect((await organismDocument(3, source, library))!.fonte).toEqual({ id: "a".repeat(64), arquivo: "sintetica.xlsx" });
    expect(await organismDocument(4, source, library)).toBeNull();
  });
});

// Conferência com as planilhas reais: só roda onde existe o acervo privado local (nunca no repositório público nem no CI).
const localStore = [path.resolve(process.cwd(), "../.local-nuvem"), path.resolve(process.cwd(), "../../.local-nuvem")].map(base => path.join(base, "artifacts", "sia-workbooks")).find(existsSync);
describe.skipIf(!localStore)("planilhas unificadas do acervo local (C1 a C3)", () => {
  const store = workbookStore(localStore ?? "");
  const source: OrganismSource = { latest: async campaign => { const artifact = (await store.list()).find(item => item.campaign === campaign); return artifact ? { id: artifact.id, filename: artifact.filename } : null; }, read: async id => (await store.read(id)).bytes };
  it("cobre as três campanhas por grupo, gênero e família; espécie só nas exóticas do COI", async () => {
    const data = await Promise.all([1, 2, 3].map(async campaign => organismsCampaign((await organismDocument(campaign, source))!)));
    expect(data.map(item => item.markers["16S"].points)).toEqual([73, 75, 76]);
    expect(data.map(item => item.markers.COI.points)).toEqual([59, 75, 50]);
    expect(data.map(item => item.markers.COI.inconclusive.length)).toEqual([1, 3, 2]);
    expect(data[2].markers["16S"].runs).toEqual(["NextSeq"]);
    for (const item of data) {
      expect(item.markers["16S"].levels.risco!.map(row => row.name).sort()).toEqual(["Biofilmes", "Enxofre / corrosão", "Ferro / manganês", "Gosto e odor", "Nitrificação", "Patogenicidade", "Toxinas"]);
      for (const level of ["genero", "familia"] as const) {
        const names = item.markers.COI.levels[level]!.map(row => row.name);
        expect(names.filter(name => binomial.test(name))).toEqual([]);
        for (const outside of ["Dalbulus", "Hypanus", "Salmo", "Perna", "Rhizoprionodon"]) expect(names).not.toContain(outside);
      }
      const exotics = item.markers.COI.levels.exoticas!;
      expect(exotics.every(row => row.category && (row.category === "candidata") === !binomial.test(row.name))).toBe(true);
      expect(exotics.filter(row => row.category === "confirmada").every(row => SUSTAINED.includes(row.name))).toBe(true);
      for (const marker of ["16S", "COI"] as const) for (const rows of Object.values(item.markers[marker].levels)) for (const row of rows!) expect(row.maxShare).toBeLessThanOrEqual(1);
    }
  }, 240000);
});

describe("índice de captação alinhado às matrizes do laboratório", () => {
  it("só pontua espécie quando é exótica sustentada; a cigarrinha-do-milho não entra", () => {
    const rows = captureIndexRows();
    const contributions = rows.flatMap(row => Object.values(row.scores).flatMap(score => score?.contributions ?? []));
    expect(contributions.filter(item => item.rank === "species").map(item => item.taxon).filter(taxon => !SUSTAINED.includes(taxon))).toEqual([]);
    const names = [...contributions.map(item => item.taxon), ...rows.flatMap(row => row.alerts.map(alert => alert.taxon))];
    expect(names.filter(name => /Dalbulus/.test(name))).toEqual([]);
    expect(names.filter(name => /^(Tanytarsus|Corynoneura) [a-z]/.test(name))).toEqual([]);
    expect(captureFichas().filter(ficha => ficha.level === "species").map(ficha => ficha.taxon).filter(taxon => !SUSTAINED.includes(taxon))).toEqual([]);
    expect(captureFichas().some(ficha => ficha.taxon === "Dalbulus maidis")).toBe(false);
  });

  it("muda só a nota ambiental dos dois pontos em que a cigarrinha pontuava", () => {
    const point = (campaign: number, sia: string) => captureIndexRows(campaign).find(row => row.sia === sia)!;
    expect(point(2, "125").scores.Ambiental!.score).toBeCloseTo(0.004940738836566752, 15);
    expect(point(2, "125").general).toBeCloseTo(0.02208773279075664, 15);
    expect(point(3, "78").scores.Ambiental!.score).toBe(0);
    expect(point(3, "78").general).toBeCloseTo(0.3512559173952099, 15);
  });
});
