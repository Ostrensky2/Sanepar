import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { samePublishedSource } from "../../presentation";
import { buildPointReport, buildResearchReport, safeReportUrl, type ReportSnapshot } from "../../report-snapshot";
import { humanReportTables, readingOverview, summaryReportTables, pdfText, reportCampaignLabel, reportCell, reportDate, reportNotes, reportPdfDefinition, reportWorkbook } from "../../report-export";
import type { ResultsCampaign } from "../../types";
import type { ResultsResearchResponse, ResearchRow } from "@/lib/results-research-contract";

const hash = "a".repeat(64);
const point = { key: "C2|SIA-0011", campaignCode: "C2", siaCode: "SIA-0011", waterBody: "Iraí", municipality: "Pinhais", completeness: "complete", usedSetCount: 3, calculationVersion: "SANEPAR-INDICE-0.3", catalogVersion: "SANEPAR-RISCOS-0.3", domains: { environmental: { value: 0.123456, lower: 0.123456, upper: 0.123456 }, operational: { value: null, lower: 0, upper: 1 }, humanHealth: { value: 0, lower: 0, upper: 0 } }, overall: { value: 0.123456, lower: 0.123456, upper: 0.123456 } };
const campaign = { campaignCode: "C2", points: [point] } as ResultsCampaign;
const source = { campaign, publicationId: "publication", sourceHash: hash.toUpperCase() };
afterEach(() => vi.unstubAllGlobals());

function mockPoint(outside = false, stale = false) {
  const fetcher = vi.fn(async (url: string) => {
    const params = new URL(url, "http://localhost").searchParams;
    const identity = { published: true, publicationId: stale ? "other" : "publication", sha256: hash, fileName: "Fonte.xlsx" };
    if (url.includes("source-analytics")) return { ok: true, json: async () => ({ source: identity, campaignCode: "C2", set: params.get("set"), contributions: [], contributionsTotal: 0 }) };
    const offset = Number(params.get("offset"));
    return { ok: true, json: async () => ({ source: identity, campaignCode: "C2", section: params.get("section"), scope: "campaign", offset, counts: { filtered: 2 }, rows: [{ Campanha: outside ? "C1" : "C2", "Cód. SIA": "SIA-0011", Espécie: offset ? "Último táxon" : "Primeiro táxon" }], columns: ["Campanha", "Cód. SIA", "Espécie"], calculationVersion: "SANEPAR-INDICE-0.3", catalogVersion: "SANEPAR-RISCOS-0.3", warnings: [] }) };
  });
  vi.stubGlobal("fetch", fetcher); return fetcher;
}

describe("Selective scientific reports", () => {
  it("projects readable PDF/print without changing granular XLSX or collapsing different evidence origins", () => {
    const evidence = { title: "Associações bibliográficas relacionadas — não confirmação local", columns: ["Número de Reads", "Conjunto analisado", "Evidência: _sourceRow", "Evidência: ID organismo", "Evidência: Organismo do banco", "Evidência: Domínio", "Evidência: Condições e limites de aplicação", "Evidência: Referências bibliográficas completas"], rows: [[20, "Bactérias", 6, "T1", "Táxon", "Operacional", "Texto científico integral. ".repeat(40), "Referência integral"], [30, "COI", 6, "T1", "Táxon", "Operacional", "Texto científico integral. ".repeat(40), "Referência integral"], [20, "Bactérias", 7, "T1", "Táxon", "Operacional", "Outra associação, origem distinta", "Outra referência"]] };
    const record = { id: "point", title: "C2 SIA-0011", tables: [{ title: "Identificação e condição de uso", columns: ["Campo", "Valor"], rows: [["Completude", "partial_2"]] }, { title: "Ocorrências moleculares — campos originais", columns: ["Táxon"], rows: [["GRANULAR_ONLY_SENTINEL"]] }, evidence] };
    const before = JSON.stringify(record);
    const human = humanReportTables(record);
    expect(human.filter((table) => table.title === "Táxon — Operacional")).toHaveLength(2);
    expect(JSON.stringify(human)).toContain("Texto científico integral. ".repeat(40));
    expect(JSON.stringify(human)).toContain("Outra associação, origem distinta");
    expect(JSON.stringify(human)).not.toContain("GRANULAR_ONLY_SENTINEL");
    expect(JSON.stringify(human)).toContain("Parcial — 2/3");
    expect(JSON.stringify(record)).toBe(before);
    const snapshot = { title: "Ficha", unit: "ponto", selectedIds: ["point"], generatedAt: "today", provenance: {}, limitations: [], records: [record] };
    const definition = reportPdfDefinition(snapshot, "detailed");
    expect(JSON.stringify(definition)).toContain(reportNotes[0]);
    expect(JSON.stringify(definition)).not.toContain("GRANULAR_ONLY_SENTINEL");
    expect(definition.pageBreakBefore({ headlineLevel: 2 }, { getFollowingNodesOnPage: () => [] })).toBe(true);
    expect(definition.pageBreakBefore({ headlineLevel: 2 }, { getFollowingNodesOnPage: () => [{}] })).toBe(false);
    expect(definition.pageBreakBefore({}, { getFollowingNodesOnPage: () => [] })).toBe(false);
    expect(record.tables[2].rows).toHaveLength(3);
    const summary = JSON.stringify(reportPdfDefinition(snapshot));
    expect(summary).toContain("Ficha-síntese".toUpperCase());
    expect(summary).not.toContain("Texto científico integral.");
    expect(summary).not.toContain("GRANULAR_ONLY_SENTINEL");
    expect(summary).toContain("Parcial — 2/3");
    expect(JSON.stringify(summaryReportTables(record))).not.toContain("nenhuma conclusão foi inferida");
    expect(JSON.stringify(record)).toBe(before);
  });
  it("accepts hex case only, rejects another publication/hash and unknown versions", () => {
    expect(samePublishedSource({ publicationId: "p", sha256: hash }, { publicationId: "p", sha256: hash.toUpperCase() })).toBe(true);
    expect(samePublishedSource({ publicationId: "other", sha256: hash }, { publicationId: "p", sha256: hash })).toBe(false);
    expect(samePublishedSource({ publicationId: "p", sha256: "b".repeat(64) }, { publicationId: "p", sha256: hash })).toBe(false);
    expect(samePublishedSource({ publicationId: "p", sha256: "bad" }, { publicationId: "p", sha256: "bad" })).toBe(false);
    const types = readFileSync(new URL("../../types.ts", import.meta.url), "utf8");
    expect(types).toContain('RESULTS_CALCULATION_VERSION = "SANEPAR-INDICE-0.3"');
    expect(types).toContain('RESULTS_CATALOG_VERSION = "SANEPAR-RISCOS-0.3"');
  });
  it("retrieves all pages for only selected campaign and SIA, empty means zero", async () => {
    const fetcher = mockPoint();
    await expect(buildPointReport(source, [])).rejects.toThrow("explicitamente");
    expect(fetcher).not.toHaveBeenCalled();
    const report = await buildPointReport(source, [point.key]);
    expect(report.records).toHaveLength(1);
    expect(report.records[0].tables.find((table) => table.title.startsWith("Ocorrências"))?.rows).toHaveLength(2);
    expect(JSON.stringify(report)).toContain("Último táxon");
    for (const [url] of fetcher.mock.calls) { const params = new URL(url, "http://localhost").searchParams; expect(params.get("sia")).toBe("SIA-0011"); expect(params.get("campaignCode")).toBe("C2"); expect(params.get("publicationId")).toBe("publication"); }
    expect(report.provenance).not.toHaveProperty("Método técnico");
    expect(report.provenance).not.toHaveProperty("Apresentação");
    expect(JSON.stringify(report.records)).not.toContain("SANEPAR-INDICE");
  });
  it("rejects same SIA in another campaign and stale publication", async () => {
    mockPoint(true); await expect(buildPointReport(source, [point.key])).rejects.toThrow("fora da seleção");
    mockPoint(false, true); await expect(buildPointReport(source, [point.key])).rejects.toThrow("incompatível");
  });
  it("fetches research pages but exports exact selected IDs, not whole filtered population", async () => {
    const row = { id: "a1", values: { organismLabel: "Táxon áçã", references: "Fonte integral", score: "NA" }, organismIds: ["T1"], associationIds: ["a1"], links: [], referenceLinks: [{ id: "doi", href: "javascript:alert(1)", label: "Origem", correspondence: "check_required" }], provenance: { sourceHash: hash, publicationId: "publication", revisionId: "rev", sheet: "Evidencias_risco", row: 2, sourceValues: { Texto: "=1+1" }, headers: {} } } as ResearchRow;
    const context = { contractVersion: "yvae-research/1", section: "impacts", source: { published: true, publicationId: "publication", sha256: hash }, revision: { id: "rev", calculationVersion: "SANEPAR-INDICE-0.3", catalogVersion: "SANEPAR-RISCOS-0.3" }, detailGroups: [], limitations: [], fieldLabels: {} } as unknown as ResultsResearchResponse;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { const offset = Number(new URL(url, "http://localhost").searchParams.get("offset")); return { ok: true, json: async () => ({ ...context, rows: [offset ? row : { ...row, id: "not-selected" }], pagination: { offset }, counts: { filtered: 2 } }) }; }));
    const report = await buildResearchReport(context, "C2", [row]);
    expect(report.selectedIds).toEqual(["a1"]); expect(report.records[0].title).toBe("Táxon áçã");
    expect(JSON.stringify(report)).not.toContain("not-selected"); expect(JSON.stringify(report)).not.toContain("javascript:");
    expect(JSON.stringify(report)).toContain("NA");
  });
  it("preserves full XLSX precision and formula-like strings, with three-decimal presentation", async () => {
    expect(pdfText("Ablabesmyia → Chironomidae (família)")).toBe("Ablabesmyia -> Chironomidae (família)");
    const table = { title: "Índices", columns: ["Índice", "Texto"], indexColumns: [0], rows: [[0.123456789, "=1+1"], [null, "+cmd"], [0, "@SUM(1)"]] };
    const snapshot: ReportSnapshot = { title: "Ação científica", unit: "ponto", selectedIds: ["one"], generatedAt: "2026-09-22", provenance: {}, limitations: [], records: [{ id: "one", title: "Água — ação", tables: [table] }] };
    expect(reportCell(table, table.rows[0], 0)).toBe("0,123");
    const workbook = await reportWorkbook(snapshot);
    expect(workbook.worksheets.map((item) => item.name)).toEqual(["Leitura", "Resumo", "01 Água — ação", "Rastreabilidade"]);
    const sheet = workbook.getWorksheet("01 Água — ação")!;
    const cells: unknown[] = []; sheet.eachRow((row) => row.eachCell((cell) => cells.push(cell.value)));
    expect(cells).toContain(0.123456789); expect(cells).toContain("=1+1"); expect(cells).toContain("+cmd"); expect(cells).toContain("@SUM(1)");
    expect(cells.every((value) => typeof value !== "object")).toBe(true);
    const definition = reportPdfDefinition(snapshot, "detailed"); expect(JSON.stringify(definition)).toContain("Água — ação"); expect(JSON.stringify(definition)).toContain("0,123");
    expect(safeReportUrl("javascript:alert(1)")).toBeNull(); expect(safeReportUrl("https://user:pass@example.com")).toBeNull();
  });
  it("preserves explicit selection, print isolation and read-only methodology", () => {
    const actions = readFileSync(new URL("../report-actions.tsx", import.meta.url), "utf8");
    expect(actions).toContain("mounted.current = false"); expect(actions).toContain("!count || busy");
    expect(actions).toContain("Filtros não selecionam registros");
    expect(actions).toContain("const [detailed, setDetailed] = useState(false)");
    expect(actions).toContain("XLSX sempre completo");
    expect(actions).toContain("Relatório detalhado — incluir evidências e referências integrais");
    const renderer = readFileSync(new URL("../../report-export.ts", import.meta.url), "utf8");
    expect(renderer).toContain("node.textContent = value"); expect(renderer).not.toContain("innerHTML"); expect(renderer).toContain('import("pdfmake/build/pdfmake")');
    const form = readFileSync(new URL("../../../../app/(dashboard)/resultados/calculos/page.tsx", import.meta.url), "utf8");
    expect(form).toContain('/api/results/methodology-pdf'); expect(form).not.toContain("localStorage"); expect(form).not.toContain('method: "POST"'); expect(form).not.toContain("MethodologyDocumentEntry");
  });
  it("keeps technical provenance and internal versions out of the readable PDF, with readable dates and campaign names", async () => {
    const record = { id: "C2|SIA-0011", title: "SIA-0011 · Iraí · Pinhais", tables: [{ title: "Identificação e condição de uso", columns: ["Campo", "Valor"], rows: [["Campanha", "C2"], ["SIA", "SIA-0011"], ["Completude", "complete"], ["Conjuntos utilizados", 3], ["Latitude", -25.4], ["Longitude", -49.2]] }, { title: "Índices e intervalos publicados (0–1)", columns: ["Domínio", "Índice", "Limite inferior", "Limite superior"], indexColumns: [1, 2, 3], rows: [["Geral", 0.369, 0.369, 0.369], ["Operacional", null, 0.519230121182, 0.776719365641]] }] };
    const snapshot: ReportSnapshot = { title: "Fichas de pontos de monitoramento", unit: "ponto", selectedIds: [record.id], generatedAt: "2026-09-23T11:40:48.800Z", provenance: { Campanha: "C2", Publicação: "602b39b3-1669", "SHA-256": "A14638A2", Arquivo: "Banco.xlsx" }, limitations: ["30432 caches zero originais recuperados por cell.result"], records: [record] };
    for (const mode of ["summary", "detailed"] as const) {
      const pdf = JSON.stringify(reportPdfDefinition(snapshot, mode));
      for (const hidden of ["602b39b3", "A14638A2", "Banco.xlsx", "caches zero", "unidade(s)", "2026-09-23T", "SANEPAR-", "Versão do catálogo"]) expect(pdf).not.toContain(hidden);
      expect(pdf).toContain("Emitido em 23/09/2026 às 08:40");
      expect(pdf).toContain("2ª Campanha · Outono 2026 (C2)");
      expect(pdf).toContain("0,519 – 0,777");
      expect(pdf).toContain("Sem valor pontual");
    }
    expect(reportDate("2026-09-22")).toBe("22/09/2026");
    expect(reportCampaignLabel("C9")).toBe("9ª Campanha · Verão 2028 (C9)");
    const workbook = await reportWorkbook(snapshot);
    const trace: unknown[] = []; workbook.getWorksheet("Rastreabilidade")!.eachRow((row) => row.eachCell((cell) => trace.push(cell.value)));
    expect(trace).toContain("A14638A2");
    const front: unknown[] = []; workbook.getWorksheet("Resumo")!.eachRow((row) => row.eachCell((cell) => front.push(cell.value)));
    expect(JSON.stringify(front)).not.toContain("A14638A2");
  });
});
describe("aba Leitura do XLSX", () => {
  it("abre com um quadro dos pontos e a ficha-síntese de cada um, antes das abas integrais", async () => {
    const point = (sia: string, overall: number | null) => ({ id: `C1|${sia}`, title: `${sia} · Iraí · Pinhais`, tables: [
      { title: "Identificação e condição de uso", columns: ["Campo", "Valor"], rows: [["Campanha", "C1"], ["SIA", sia], ["Manancial", "Iraí"], ["Município", "Pinhais"], ["Completude", overall === null ? "partial_2" : "complete"]] },
      { title: "Índices e intervalos publicados (0–1)", columns: ["Domínio", "Índice", "Limite inferior", "Limite superior"], indexColumns: [1, 2, 3], rows: [["Geral", overall, overall ?? 0.2, overall ?? 0.6], ["Ambiental", 0.5, 0.5, 0.5], ["Operacional", 0.4, 0.4, 0.4], ["Saúde humana", 0.3, 0.3, 0.3]] },
    ] });
    const records = [point("SIA-0001", 0.544), point("SIA-0002", null)];
    const snapshot: ReportSnapshot = { title: "Fichas de pontos", unit: "ponto", selectedIds: records.map((record) => record.id), generatedAt: "2026-09-23", provenance: { Campanha: "C1" }, limitations: [], records };
    const workbook = await reportWorkbook(snapshot);
    expect(workbook.worksheets.map((item) => item.name)).toEqual(["Leitura", "Resumo", "01 SIA-0001", "02 SIA-0002", "Rastreabilidade"]);
    const cells: unknown[] = []; workbook.getWorksheet("Leitura")!.eachRow((row) => row.eachCell((cell) => cells.push(cell.value)));
    expect(cells).toContain("Pontos exportados (2)"); expect(cells).toContain(0.544); expect(cells).toContain("Sem valor pontual");
    expect(cells).toContain("1. SIA-0001 · Iraí · Pinhais"); expect(cells).toContain("Identificação do ponto"); expect(cells).toContain("Parcial — 2/3");
    expect(readingOverview([records[0]])).toBeNull();
  });
});
