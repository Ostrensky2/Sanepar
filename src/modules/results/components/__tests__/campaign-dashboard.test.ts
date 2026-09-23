import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignDataTable, campaignTableCounter, campaignTableRows, constantColumns } from "../campaign-data-table";
import { readCampaignPreview, sourcePoint } from "../campaign-source-table";
import { completeStatistics, leadingCompletePoints, campaignLocationIssue, municipalityGroups } from "../campaign-overview";
import { CampaignKpiCards, CampaignQuickRead, CONFIRMATION_GUIDANCE, PriorityCards } from "../campaign-story";
import type { ResultPoint, ResultsCampaign } from "@/modules/results/types";

const source = readFileSync(new URL("../campaign-results-dashboard.tsx", import.meta.url), "utf8");
afterEach(() => vi.unstubAllGlobals());
describe("Campaign-only dashboard", () => {
  it("keeps contribution columns readable in an accessible internal scroll region", () => {
    const ficha = readFileSync(new URL("../campaign-point-ficha.tsx", import.meta.url), "utf8");
    expect(ficha).toContain('aria-label="Tabela de contribuições para Q — rolagem horizontal" tabIndex={0}');
    expect(ficha).toContain('min-w-[42rem]');
    expect(ficha).toContain('[&_td]:whitespace-nowrap');
    expect(ficha).toContain('[&_td]:px-3');
    expect(ficha).toContain('"Não calculado"');
  });
  it("opens the same point only for exact SIA in the selected campaign", () => {
    const point = { campaignCode: "C2", siaCode: "SIA-0011" } as ResultPoint;
    const campaign = { campaignCode: "C2", points: [point, { ...point, campaignCode: "C1", siaCode: "SIA-0012" }] } as ResultsCampaign;
    expect(sourcePoint(campaign, { "Cód. SIA": 11 })).toBe(point);
    expect(sourcePoint(campaign, { "Ponto": "SIA-0011" })).toBe(point);
    expect(sourcePoint(campaign, { "Cód. SIA": "11/12" })).toBeUndefined();
    expect(sourcePoint(campaign, { "Cód. SIA": 12 })).toBeUndefined();
  });
  it("describes only finite complete values, preserves histogram endpoints and top ties", () => {
    const point = (value: number | null, completeness = "complete") => ({ completeness, overall: { value } } as ResultPoint);
    const rows = [point(0), point(0.2), point(0.8), point(0.8), point(1), point(null, "partial_2")];
    const stats = completeStatistics(rows);
    expect(stats).toMatchObject({ included: 5, excluded: 1, median: 0.8 });
    expect(stats.mean).toBeCloseTo(0.56, 12);
    expect(stats.bins.map((bin) => bin.count)).toEqual([1, 1, 0, 0, 3]);
    expect(leadingCompletePoints(rows, 2)).toHaveLength(3);
    expect(completeStatistics([point(null, "unavailable")])).toMatchObject({ included: 0, mean: null, median: null });
  });
  it("isolates the documented location anomaly without universal equality rule", () => {
    const point = { campaignCode: "C2", siaCode: "SIA-0770", coordinates: { latitude: -25, longitude: -25 } } as ResultPoint;
    expect(campaignLocationIssue(point)).toBe(true);
    expect(campaignLocationIssue({ ...point, siaCode: "SIA-0011" })).toBe(false);
    expect(campaignLocationIssue({ ...point, campaignCode: "C3" })).toBe(false);
    expect(campaignLocationIssue({ ...point, coordinates: null })).toBe(false);
  });
  it("keeps history extra, private source export and common point detail", () => {
    expect(source).toContain('["history", "Evolução"]');
    expect(source).toContain("<CampaignPointFicha");
    expect(source).toContain("<CampaignOnlyMap");
    expect(source).not.toContain("<ResultsIndexDashboard");
    expect(source).toContain("todas as campanhas do arquivo");
    expect(source).toContain('params.set("sourceHash", sourceHash)');
    expect(source).not.toContain("/modelo-planilha-resultados.xlsx");
    const molecular = readFileSync(new URL("../campaign-molecular.tsx", import.meta.url), "utf8");
    expect(molecular).toContain("cell.proportion");
    expect(molecular).toContain("cell.denominator");
    expect(molecular).toContain("Próximos táxons");
    expect(molecular).toContain("overflow-y-auto");
    expect(molecular).toContain("data.source.sha256.toLowerCase() !== sourceHash.toLowerCase()");
  });
  it("keeps seven areas, explicit preview, complete ranking and source warnings", () => {
    for (const label of ["Panorama", "Prioridades", "Associações", "Cianobactérias", "Bactérias", "Eucariotos COI", "Método"]) expect(source).toContain(`"${label}"`);
    expect(source).toContain('point.completeness === "complete" && point.overall.value !== null');
    expect(source).toContain("Posição na campanha");
    const story = readFileSync(new URL("../campaign-story.tsx", import.meta.url), "utf8");
    expect(story).toContain("const partial = campaign.counts.partialWithTwoSets + campaign.counts.partialWithOneSet;");
    expect(story).not.toContain("partial.length");
    expect(source).toContain("Parciais e indisponíveis — sem ranking");
    expect(source).toContain('section="alerts"');
    expect(source).toContain("preview?.campaign ?? publishedCampaign");
    expect(source).toContain("CacheRecovery");
    expect(source).toContain("preview.warnings.map");
    expect(source).toContain('role="tablist"');
    expect(source).toContain('"ArrowRight", "ArrowLeft", "Home", "End"');
  });
  it("searches accents, sorts numbers stably and leaves null last", () => {
    const rows = [{ name: "Iraí", score: null }, { name: "Iraí", score: 0.2 }, { name: "Iraí", score: 0.7 }, { name: "Outro", score: 1 }];
    const columns = [{ key: "name", label: "Nome", value: (row: typeof rows[number]) => row.name }, { key: "score", label: "Índice", value: (row: typeof rows[number]) => row.score }];
    expect(campaignTableRows(rows, columns, "irai", "score", true).map((row) => row.score)).toEqual([0.7, 0.2, null]);
  });
  it("paginates twelve records and reports all population counts", () => {
    const rows = Array.from({ length: 25 }, (_, id) => ({ id }));
    const html = renderToStaticMarkup(createElement(CampaignDataTable<{ id: number }>, { title: "Pontos", rows, columns: [{ key: "id", label: "SIA", value: (row) => row.id }], rowKey: (row) => String(row.id) }));
    expect(html.match(/<tr/g)).toHaveLength(13);
    expect(html).toContain("Mostrando 1–12 de 25");
    expect(campaignTableCounter({ first: 1, last: 12 }, 20, 56, 73)).toBe("Mostrando 1–12 de 20 (filtrados de 56) · 73 no total");
    expect(constantColumns([{ a: 1, b: "x" }, { a: 2, b: "x" }], [{ key: "a", label: "A", value: (row: { a: number; b: string }) => row.a }, { key: "b", label: "B", value: (row: { a: number; b: string }) => row.b }]).map((column) => column.key)).toEqual(["b"]);
    expect(html).toContain("Página 1 de 3");
  });
  it("fails closed on unavailable or mismatched source and accepts unpublished exact campaign", async () => {
    const params = new URLSearchParams({ campaignCode: "C2" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(readCampaignPreview(params)).rejects.toThrow("não foi alterada");
    const payload = { source: { kind: "local-corrected-preview", published: false }, campaignCode: "C1" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    await expect(readCampaignPreview(params)).rejects.toThrow("incompatível");
    payload.campaignCode = "C2";
    await expect(readCampaignPreview(params)).resolves.toBe(payload);
  });
  it("rejects a stale publication or hash and never falls back to local preview", async () => {
    const params = new URLSearchParams({ campaignCode: "C2", source: "published", publicationId: "head-new", sourceHash: "hash-new" });
    const payload = { source: { kind: "published", published: true, publicationId: "head-old", sha256: "hash-new" }, campaignCode: "C2" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    await expect(readCampaignPreview(params)).rejects.toThrow("incompatível");
    payload.source.publicationId = "head-new";
    payload.source.sha256 = "hash-old";
    await expect(readCampaignPreview(params)).rejects.toThrow("Fonte alterada");
    payload.source.sha256 = "hash-new";
    await expect(readCampaignPreview(params)).resolves.toBe(payload);
    const molecular = readFileSync(new URL("../campaign-molecular.tsx", import.meta.url), "utf8");
    expect(molecular).toContain("data.source.publicationId !== publicationId");
    expect(molecular).toContain("result?.key === key ? result : undefined");
    const panels = readFileSync(new URL("../../../../components/campaign-results-panels.tsx", import.meta.url), "utf8");
    expect(panels).toContain("resultsV2Publication?.publicationId");
    expect(source).toContain('source: "published"');
    expect(source).toContain("Nenhuma prévia local foi usada como substituta.");
  });
});
describe("Campaign story (official-panel narrative on the 2.0 data)", () => {
  const range = (value: number | null, lower = value ?? 0, upper = value ?? 1) => ({ value, lower, upper });
  const component = (reads: number) => ({ totalReads: reads, recordCount: reads ? 2 : 0, included: reads > 0 });
  const point = (sia: string, municipality: string, value: number | null, rank: number | null, completeness = value === null ? "partial_2" : "complete") => ({
    key: `C9|${sia}`, campaignCode: "C9", siaCode: sia, municipality, waterBody: `Rio ${sia}`, completeness, usedSetCount: completeness === "complete" ? 3 : 2,
    overall: { ...range(value, value ?? 0.1, value ?? 0.9), rank },
    domains: { environmental: range(value), operational: range(value), humanHealth: range(value === null ? null : value / 2) },
    components: { cyanobacteria: component(completeness === "complete" ? 10 : 0), bacteria: component(20), coi: component(5) },
  } as unknown as ResultPoint);
  const points = [point("SIA-0001", "Alfa", 0.4, 2), point("SIA-0002", "Beta", 0.6, 1), point("SIA-0003", "Alfa", null, null), point("SIA-0004", "Gama", null, null)];
  const campaign = { campaignCode: "C9", points, counts: { total: 4, complete: 2, partialWithTwoSets: 2, partialWithOneSet: 0, unavailable: 0 } } as ResultsCampaign;
  it("orders municipalities only by complete values; partial-only municipalities go last without a value", () => {
    const groups = municipalityGroups(points);
    expect(groups.map((group) => [group.name, group.max])).toEqual([["Beta", 0.6], ["Alfa", 0.4], ["Gama", null]]);
    expect(groups[1].items.map((item) => item.siaCode)).toEqual(["SIA-0001", "SIA-0003"]);
  });
  it("renders number cards, the quick read and lean top cards (identification and domains, no organisms), never classes", () => {
    const html = renderToStaticMarkup(createElement("div", null,
      createElement(CampaignKpiCards, { campaign, taxaCount: 1820 }),
      createElement(CampaignQuickRead, { campaign, campaignLabel: "C9", cyanoTop: { taxon: "Anathece clathrata", reads: 24653, positivePoints: 33, denominatorPoints: 71 }, onPoint: () => undefined }),
      createElement(PriorityCards, { points: [points[1]], onPoint: () => undefined }),
    ));
    expect(html).toContain("1.820");
    expect(html).toContain("2 completos · 2 parciais");
    expect(html).toContain("Anathece clathrata");
    expect(html).toContain("Cianobactérias sem registros em 2 pontos");
    // A média informa quais pontos entram no cálculo.
    expect(html).toContain("Índice médio — pontos completos");
    expect(html).toContain("2 pontos completos");
    expect(html).toContain("Abrir ficha");
    expect(html).toContain("Operacional");
    expect(html).not.toMatch(/\b(Alto|Moderado|Baixo)\b/);
  });
  it("labels the confirmation text as general method guidance and keeps technical details collapsed", () => {
    const ficha = readFileSync(new URL("../campaign-point-ficha.tsx", import.meta.url), "utf8");
    expect(ficha).toContain("orientação geral do método");
    expect(ficha).toContain("não é recomendação calculada para este ponto");
    expect(ficha).toContain("{technical && <FichaTechnical");
    expect(Object.keys(CONFIRMATION_GUIDANCE).sort()).toEqual(["bacteria", "coi", "cyanobacteria"]);
  });
  it("shows a single methodological notice and moves per-tab caveats to the help icon", () => {
    expect(source.match(/role="note"/g)).toHaveLength(1);
    expect(source).toContain("não comparável ao painel anterior");
    expect(source).not.toContain("description=");
  });
});
