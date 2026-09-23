import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ResultsPublication, ResultsViewModel } from "@/lib/imports/results-contract";
import type { ResultsInventoryItem } from "@/lib/results-publication-contract";
import { hasAvailableResultsSource, samePublishedSource } from "../../presentation";
import { isPublishedLegacyResponse, isPublishedV2Response, type PublishedResultsResponse } from "../../published-response";
import { LegacyPublishedResults } from "../legacy-published-results";
import { isMethodologyPdfAvailable, MethodologyPdfLink } from "../methodology-pdf-link";
import { researchQuery } from "../research-browser";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
function legacy(number: number): PublishedResultsResponse {
  const viewModel = { meta: { campanha: number, amostras: number === 2 ? 75 : 73 }, points: [{ sia: "SIA-0011", ponto: "<img onerror=alert(1)>", score: 0.5778986515401948, classe: "Moderado", justificativa: "Texto original integral" }, { sia: "SIA-0017", score: null, classe: null }], alerts: [{ reasons: ["Alerta original"] }] } as unknown as ResultsViewModel;
  const publication = { campaignId: `campanha-${number}`, campaignNumber: number, campaignTitle: `Campanha ${number}`, importedAt: "2026-01-01", schemaVersion: "yvae-results/1.0", fileName: "original.xlsx", methodology: { origin: "Fonte original" }, molecularRows: [], rankingRows: [], viewModel } as unknown as ResultsPublication;
  return { status: "published", format: "legacy-v1", publicationId: `head-${number}`, publication, viewModel, campaign: null, sourceAvailability: "missing_source_artifact" };
}
describe("cloud legacy DTO UI, synthetic only and no database", () => {
  it("discriminates C1/C2 V1 from V2 despite campaign:null, and never converts an unassigned array", () => {
    for (const number of [1, 2]) {
      const response = legacy(number);
      expect(isPublishedLegacyResponse(response)).toBe(true);
      expect(isPublishedV2Response(response)).toBe(false);
    }
    const v2 = { status: "published", format: "v2", campaign: { campaignCode: "C3", points: [] }, publication: {} } as unknown as PublishedResultsResponse;
    expect(isPublishedV2Response(v2)).toBe(true);
    expect(isPublishedLegacyResponse(v2)).toBe(false);
    expect(isPublishedV2Response({ status: "empty", campaign: null, publication: null })).toBe(false);
    expect(isPublishedLegacyResponse(Array(69).fill({ score: 1 }) as unknown as PublishedResultsResponse)).toBe(false);
  });
  it("renders the exact published legacy values and all sections, escaped, without local HTML or V2 inference", () => {
    const response = legacy(2);
    if (!isPublishedLegacyResponse(response)) throw new Error("fixture");
    const before = JSON.stringify(response);
    const markup = renderToStaticMarkup(createElement(LegacyPublishedResults, { publication: response.publication }));
    for (const value of ["Campanha 2", "75", "0.5778986515401948", "Moderado", "Texto original integral", "Alerta original", "Não informado na publicação", "arquivo-fonte"]) expect(markup).toContain(value);
    expect(markup).not.toContain("<img");
    expect(markup).toContain("&lt;img");
    expect(markup).not.toContain("<iframe");
    expect(markup).not.toContain("Nenhuma campanha publicada");
    expect(JSON.stringify(response)).toBe(before);
  });
  it("blocks source-dependent queries for null hashes but preserves real inventory totals", () => {
    const item: ResultsInventoryItem = { campaignCode: "C2", canonicalId: "campanha-2", canonicalName: "Campanha 2", publicationId: "head-2", publishedAt: "2026-01-01", format: "legacy-v1", sourceAvailability: "missing_source_artifact", source: { sha256: null, fileName: "original.xlsx" }, counts: { total: 74, complete: null, partialWithTwoSets: null, partialWithOneSet: null, unavailable: null }, downloadAvailable: false };
    expect(hasAvailableResultsSource(item)).toBe(false);
    expect(researchQuery(item, "impacts", {}, "", 0)).toBeNull();
    expect(samePublishedSource({ publicationId: "head-2", sha256: null }, { publicationId: "head-2", sha256: null })).toBe(false);
    expect(item.counts).toEqual({ total: 74, complete: null, partialWithTwoSets: null, partialWithOneSet: null, unavailable: null });
    const v2 = { ...item, format: "v2" as const, sourceAvailability: "available" as const, source: { ...item.source, sha256: "a".repeat(64) } };
    expect(researchQuery(v2, "method", {}, "", 0)?.get("sourceHash")).toBe("a".repeat(64));
  });
  it("does not present a PDF link until the private GET confirms status and MIME", () => {
    expect(isMethodologyPdfAvailable(new Response(null, { status: 503 }))).toBe(false);
    expect(isMethodologyPdfAvailable(new Response(null, { status: 401 }))).toBe(false);
    expect(isMethodologyPdfAvailable(new Response(null, { status: 200, headers: { "content-type": "text/html" } }))).toBe(false);
    expect(isMethodologyPdfAvailable(new Response(null, { status: 200, headers: { "content-type": "application/pdf" } }))).toBe(true);
    expect(renderToStaticMarkup(createElement(MethodologyPdfLink))).not.toContain("href=");
  });
  it("keeps unassigned history separate and never maps read errors to empty", () => {
    const repository = readFileSync(new URL("../../../../components/spreadsheet-repository.tsx", import.meta.url), "utf8");
    expect(repository).toContain("Histórico preservado — sem campanha demonstrada");
    expect(repository).toContain("resultsInventory.historicalPublications.map");
    expect(repository).toContain("item.recordCount === null");
    const campaigns = readFileSync(new URL("../../../../components/campaigns-page-content.tsx", import.meta.url), "utf8");
    expect(campaigns).toContain('failure?.code === "legacy_head_unavailable"');
    expect(campaigns).not.toContain('setPublishedResults({ status: "empty"');
    const panels = readFileSync(new URL("../../../../components/campaign-results-panels.tsx", import.meta.url), "utf8");
    expect(panels).not.toContain("Painel_eDNA_Campanha1_Sanepar.html");
  });
});
