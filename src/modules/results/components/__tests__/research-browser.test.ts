import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ResearchBrowser, researchFieldText, researchMonitoringHref, researchQuery, researchValueText } from "../research-browser";
import { formatResultIndex } from "../../format-index";
import type { ResearchRow } from "@/lib/results-research-contract";
import type { ResultsInventoryItem } from "@/lib/results-publication-contract";

const fixture: ResultsInventoryItem = {
  campaignCode: "C2", canonicalId: "synthetic-c2", canonicalName: "Campanha sintética — teste", publicationId: "synthetic-publication",
  publishedAt: "2026-09-22", source: { sha256: "a".repeat(64), fileName: "fixture.xlsx" }, downloadAvailable: true,
  counts: { total: 1, complete: 0, partialWithTwoSets: 0, partialWithOneSet: 0, unavailable: 1 },
};
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("research consultation contract (synthetic fixtures only)", () => {
  it("shows every number with at most three decimals; proportions as percentages", () => {
    expect([0, 1, 1 / 3].map((value) => formatResultIndex(value))).toEqual(["0,000", "1,000", "0,333"]);
    expect(`${formatResultIndex(0.2)}–${formatResultIndex(0.9)}`).toBe("0,200–0,900");
    expect(formatResultIndex(null)).toBe("Não disponível");
    expect(formatResultIndex("NA")).toBe("NA");
    expect(formatResultIndex(NaN)).toBe("Não disponível");
    expect(researchFieldText("environmentalSignal", 0.01075057358243199)).toBe("0,011");
    expect(researchFieldText("environmentalCoverage", 0.006)).toBe("0,6%");
    expect(researchFieldText("proportion", 0.7137)).toBe("71,4%");
    const help = readFileSync(new URL("../results-interpretation-help.tsx", import.meta.url), "utf8");
    expect(help).toContain("<ResultsReviewDialog");
    expect(help).toContain("{children}");
    expect(help).toContain("<CircleHelp");
    // O "passo a passo" do cálculo anterior saiu do aplicativo.
    const browser = readFileSync(new URL("../research-browser.tsx", import.meta.url), "utf8");
    expect(browser).not.toMatch(/ResearchMethod|Passo a passo|Valores por ponto|calculations/);
  });
  it("links only a matching campaign, publication and source, never another campaign", () => {
    const row = { values: { campaign: "C2", sia: "SIA-0011" }, provenance: { publicationId: fixture.publicationId, sourceHash: fixture.source.sha256 } } as unknown as ResearchRow;
    expect(researchMonitoringHref(row, [fixture])).toContain("campaign=synthetic-c2");
    expect(researchMonitoringHref(row, [fixture])).toContain("sia=SIA-0011");
    expect(researchMonitoringHref(row, [{ ...fixture, publicationId: "other-head" }])).toBeNull();
    expect(researchMonitoringHref({ ...row, values: { ...row.values, campaign: "C1" } }, [fixture])).toBeNull();
  });
  it("preserves identity and multiple filters without changing values or calculating scores", () => {
    const params = researchQuery(fixture, "impacts", { domain: ["environmental", "humanHealth"], score: ["NA"] }, "  água  ", 25)!;
    expect(params.getAll("filter.domain")).toEqual(["environmental", "humanHealth"]);
    expect(params.get("filter.score")).toBe("NA");
    expect(params.get("publicationId")).toBe(fixture.publicationId);
    expect(params.get("sourceHash")).toBe(fixture.source.sha256);
    expect(params.get("q")).toBe("água");
    expect(params.get("offset")).toBe("25");
    expect(researchValueText(null)).toBe("Não informado na fonte");
    expect(researchValueText(0)).toBe("0");
    expect(researchValueText("NA")).toBe("NA");
    expect(researchValueText(0.1581732899853036)).toBe("0,158");
    expect(researchValueText(1827)).toBe("1.827");
  });
  it("is read-only, rejects stale identity and exposes original provenance without raw column offsets", () => {
    const source = readFileSync(new URL("../research-browser.tsx", import.meta.url), "utf8");
    expect(source).not.toContain('method: "POST"');
    expect(source).not.toContain('type="file"');
    expect(source).not.toContain("sourceValues[");
    expect(source).toContain("value.source.publicationId === requested.get");
    expect(source).toContain("sameSourceHash(value.source.sha256, requested.get");
    expect(source).toContain('value.source.kind === "preparation"');
    expect(source).toContain('value.source.revisionHash === requested.get("revisionHash")');
    expect(source).toContain("identityMismatch");
    expect(source).toContain("controller.abort()");
    expect(source).toContain("Nenhuma publicação histórica disponível para");
    expect(source).toContain("não corresponde à publicação vigente.");
    expect(source).toContain("Consultar a publicação histórica disponível de");
    expect(source).toContain("Abrir catálogo {item.campaignCode}");
    expect(source).toContain("Consultar a visão da rede no índice atual");
    expect(source).toContain("detail.provenance.sheet");
  });
  it("keeps fragment preparation in data entry and never labels its preview persisted", () => {
    const source = readFileSync(new URL("../results-preparation-panel.tsx", import.meta.url), "utf8");
    expect(source).toContain('fetch("/api/imports/results/preview"');
    expect(source).not.toContain('fetch("/api/imports/results"');
    expect(source).toContain("value.persisted !== false");
    expect(source).toContain("nada é salvo nem publicado");
    expect(source).toContain('type: "global-bibliography"');
    const repository = readFileSync(new URL("../../../../components/spreadsheet-repository.tsx", import.meta.url), "utf8");
    expect(repository).toContain("<ResultsPreparationPanel canImport={canImportSpreadsheets} />");
  });
});
