import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { continuousResultColor } from "@/components/campaign-hydro-map";
import type { ResultPoint, ResultsCampaign } from "@/modules/results";
import {
  ResultsIndexDashboard,
  buildResultMapPoints,
  metricRange,
  summarizeMunicipalities,
  resultDetailHref,
  mapHelpSections,
} from "@/modules/results/components/results-index-dashboard";
import { orderPublishedResultsForHome, completeOverallSummary } from "@/modules/results/components/home-results-v2";

describe("results index dashboard v2 contract", () => {
  it("keeps map guidance contextual with live counts, metadata and scientific distinctions", () => {
    const campaign = fixtureCampaign();
    campaign.points[0].conditionOfUse = "Provisório; qualidade não informada";
    const sections = mapHelpSections(campaign, campaign.points, [campaign.points[0].key], "operational");
    const text = sections.map((section) => section.text).join(" ");
    for (const copy of ["Operacional", "1 de 3", "2 sem coordenada utilizável", "SIA-0559", "Provisório; qualidade não informada", "não sequenciamento ou aprovação", "não índice zero", "não representa probabilidade", "inferior à esquerda", "superior à direita", "sem valor central", "sem zoom"]) expect(text).toContain(copy);
    const source = readFileSync(new URL("../results-index-dashboard.tsx", import.meta.url), "utf8");
    expect(source).toContain('<ResultsReviewDialog title="Como ler o mapa"');
    expect(text).not.toContain("SANEPAR-INDICE");
    expect(source).toContain("{mapPoints.length} de {visiblePoints.length} resultados no mapa.");
    const legend = readFileSync(new URL("../result-marker-legend.tsx", import.meta.url), "utf8");
    for (const label of ["3/3", "2/3", "1/3", "0/3"]) expect(legend).toContain(label);
    expect(legend).not.toContain("<p>");
    expect(legend).toContain("RESULT_PALETTE");
  });
  it("summarizes only complete overall indices and preserves campaign and point in detail links", () => {
    expect(completeOverallSummary(fixtureCampaign())).toEqual({ count: 1, mean: 0.62 });
    expect(completeOverallSummary({ ...fixtureCampaign(), points: fixtureCampaign().points.slice(1) })).toEqual({ count: 0, mean: null });
    expect(resultDetailHref("C2", "SIA-0559")).toBe("/campanhas/resultados?campaign=campanha-2-outono-2026&sia=SIA-0559#results-index-dashboard");
    const page = readFileSync(new URL("../../../../app/(dashboard)/campanhas/resultados/page.tsx", import.meta.url), "utf8");
    expect(page).toContain("initialCampaignId={campaign}");
  });

  it("keeps the Home compact and map selection separate from explicit zoom", () => {
    const source = readFileSync(new URL("../results-index-dashboard.tsx", import.meta.url), "utf8");
    const home = readFileSync(new URL("../home-results-v2.tsx", import.meta.url), "utf8");
    expect(source).toContain("{!summary && <><div");
    expect(source).toContain("zoomOnSelect={false}");
    expect(source).toContain("focusRequest={focusRequest}");
    expect(home).toContain("<ProjectStatusPanel compact />");
    const page = readFileSync(new URL("../../../../app/(dashboard)/page.tsx", import.meta.url), "utf8");
    expect(page).toContain("<HomeProjectSummary pointSummary={pointSummary}");
    expect(page).toContain("cache(loadDashboardData)");
    expect(home.match(/<CanonicalKpi /g)).toHaveLength(3);
    expect(page).toContain("<HomeOperationalKpis monitored={pointSummary.monitored} />");
  });
  it("renders complete, partial and unavailable results without qualitative risk classes", () => {
    const source = readFileSync(
      new URL("../results-index-dashboard.tsx", import.meta.url),
      "utf8",
    );

    expect(ResultsIndexDashboard).toBeTypeOf("function");
    expect(source).toContain("Síntese integrada por ponto");
    expect(source).toContain("Completos (3/3)");
    expect(source).toContain("Parcial — 2/3");
    expect(source).toContain("Indisponível — 0/3");
    expect(source).toContain("Ponto parcial tem uma faixa.");
    expect(source).toContain("Resultados parciais e indisponíveis ficam fora do ranking");
    expect(source).not.toMatch(/risco (baixo|moderado|alto|crítico)/i);
  });

  it("keeps municipality summaries as state counts without synthetic scores", () => {
    expect(summarizeMunicipalities(fixtureCampaign().points)).toEqual([
      { name: "Curitiba", total: 2, complete: 1, partial: 1, unavailable: 0 },
      { name: "Pinhais", total: 1, complete: 0, partial: 0, unavailable: 1 },
    ]);
  });

  it("uses point values only for complete results and preserves partial bounds", () => {
    const campaign = fixtureCampaign();
    expect(metricRange(campaign.points[0], "overall").value).toBe(0.62);
    expect(metricRange(campaign.points[1], "overall")).toMatchObject({
      value: null,
      lower: 0.519230121182,
      upper: 0.776719365641,
    });
    expect(continuousResultColor(0)).toBe("#1A9850");
    expect(continuousResultColor(1)).toBe("#762A83");
  });

  it("starts Home with the most recently published campaign and uses campaign number as a stable tie-break", () => {
    const c1 = { ...fixtureCampaign(), campaignCode: "C1" };
    const c2 = fixtureCampaign();
    expect(orderPublishedResultsForHome([
      { campaign: c1, publishedAt: "2026-09-20T12:00:00.000Z" },
      { campaign: c2, publishedAt: "2026-09-21T12:00:00.000Z" },
    ]).map((campaign) => campaign.campaignCode)).toEqual(["C2", "C1"]);
    expect(orderPublishedResultsForHome([
      { campaign: c1, publishedAt: "2026-09-21T12:00:00.000Z" },
      { campaign: c2, publishedAt: "2026-09-21T12:00:00.000Z" },
    ])[0].campaignCode).toBe("C2");
  });

  it("uses the selected v2 publication count in the campaign KPI", () => {
    const source = readFileSync(
      new URL("../../../../components/campaigns-page-content.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("? v2Campaign.counts.total");
    expect(source).toContain("resultPoints={hasPublishedResults ? resultPointCount : null}");
    expect(source).toContain("> com resultado</>");
  });

  it("maps every localizable completeness state and keeps points without coordinates out of the map only", () => {
    const points = fixtureCampaign().points.map((item, index) => ({
      ...item,
      coordinates: {
        latitude: -25 + index * 0.1,
        longitude: -49 + index * 0.1,
        source: "workbook_metadata" as const,
      },
    }));
    const withoutLocation = { ...points[0], key: "C2|sem-local", coordinates: null };
    const mapPoints = buildResultMapPoints([...points, withoutLocation]);

    expect(mapPoints).toHaveLength(3);
    expect(mapPoints.map((point) => point.resultCompleteness)).toEqual([
      "complete",
      "partial_2",
      "unavailable",
    ]);
    expect([...points, withoutLocation]).toHaveLength(4);
  });

  it("preserves the real set mask across domain changes", () => {
    const point = fixtureCampaign().points[1];
    point.coordinates = { latitude: -25, longitude: -49, source: "workbook_metadata" };
    point.components.bacteria.included = true;
    point.components.cyanobacteria.included = false;
    point.components.coi.included = true;
    expect(buildResultMapPoints([point], "overall")[0].resultIncluded).toEqual([true, false, true]);
    expect(buildResultMapPoints([point], "humanHealth")[0].resultIncluded).toEqual([true, false, true]);
  });

  it("resets metric, completeness, search and selection whenever the campaign changes", () => {
    const source = readFileSync(
      new URL("../results-index-dashboard.tsx", import.meta.url),
      "utf8",
    );
    expect(source.match(/setMetric\("overall"\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source.match(/setCompleteness\("all"\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source.match(/setQuery\(""\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source.match(/setSelectedPointKey\(undefined\)/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

function fixtureCampaign(): ResultsCampaign {
  return {
    campaignCode: "C2",
    counts: { total: 3, complete: 1, partialWithTwoSets: 1, partialWithOneSet: 0, unavailable: 1 },
    points: [
      point("complete", "SIA-0780", "Curitiba", { value: 0.62, lower: 0.62, upper: 0.62, rank: 1 }),
      point("partial_2", "SIA-0559", "Curitiba", { value: null, lower: 0.519230121182, upper: 0.776719365641, rank: null }),
      point("unavailable", "SIA-0257", "Pinhais", { value: null, lower: 0, upper: 1, rank: null }),
    ],
  };
}

function point(
  completeness: ResultPoint["completeness"],
  siaCode: string,
  municipality: string,
  overall: ResultPoint["overall"],
): ResultPoint {
  const range = { value: overall.value, lower: overall.lower, upper: overall.upper };
  const component = {
    status: "approved" as const,
    sourceStatus: "Aprovado",
    reason: null,
    totalReads: 10,
    recordCount: 1,
    included: true,
    calculated: { environmental: 0.5, operational: 0.5, humanHealth: 0.5 },
    used: { environmental: 0.5, operational: 0.5, humanHealth: 0.5 },
    bibliographicCoverage: { environmental: 1, operational: 1, humanHealth: 1 },
  };
  return {
    key: `C2|${siaCode}`,
    campaignCode: "C2",
    siaCode,
    waterBody: "Rio de teste",
    municipality,
    coordinates: null,
    calculationVersion: "SANEPAR-INDICE-0.3",
    catalogVersion: "SANEPAR-RISCOS-0.3",
    completeness,
    availableSetCount: completeness === "complete" ? 3 : completeness === "partial_2" ? 2 : 0,
    usedSetCount: completeness === "complete" ? 3 : completeness === "partial_2" ? 2 : 0,
    unavailableSets: completeness === "complete" ? [] : ["coi"],
    conditionOfUse: null,
    impactedRecordCount: 0,
    observations: null,
    domains: { environmental: range, operational: range, humanHealth: range },
    overall,
    bibliographicCoverage: { environmental: 1, operational: 1, humanHealth: 1 },
    components: {
      bacteria: { ...component, set: "bacteria" },
      cyanobacteria: { ...component, set: "cyanobacteria" },
      coi: { ...component, set: "coi" },
    },
  };
}
