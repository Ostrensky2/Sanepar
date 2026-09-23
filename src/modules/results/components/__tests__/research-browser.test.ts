import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ResearchBrowser, ResearchMethod, researchFieldText, researchMonitoringHref, researchQuery, researchValueText } from "../research-browser";
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
  it("opens the calculation module on the step-by-step view and offers the full methodology PDF next to the title", () => {
    const markup = renderToStaticMarkup(createElement(ResearchBrowser, { module: "calculations" }));
    expect(markup).toContain("Passo a passo");
    expect(markup).toContain("Valores por ponto");
    expect(markup.indexOf("Passo a passo")).toBeLessThan(markup.indexOf("Valores por ponto"));
    expect(markup).not.toContain("Descrição metodológica");
    expect(markup).not.toContain("Como interpretar");
    const page = readFileSync(new URL("../../../../app/(dashboard)/resultados/calculos/page.tsx", import.meta.url), "utf8");
    expect(page).toContain('actions={<MethodologyPdfLink />');
    expect(page).toContain("help={<ResultsInterpretationHelp");
    const repository = readFileSync(new URL("../../../../components/spreadsheet-repository.tsx", import.meta.url), "utf8");
    expect(repository).not.toContain("MethodologyDocumentEntry");
  });
  it("recalcula um ponto passo a passo, com os números dele em cada passo, sem versões nem decimais longos", () => {
    const domain = (used: number | null, signal: number | null, calculated: number | null, coverage: number | null) => ({ scoredReads: 339, coverage, signal, calculated, used });
    const stages = ["denominator", "score", "signal", "component", "aggregate", "coverage"].map((id) => ({ id, title: `Título ${id}`, formula: "f", variables: "v", explanation: `Explicação ${id}` }));
    const markup = renderToStaticMarkup(createElement(ResearchMethod, { method: {
      version: "SYNTHETIC-METHOD", parameters: { alpha: 100, severityExponent: 1, requiredSetCount: 3, domainCount: 3 }, stages, example: null,
      points: [{ sia: "SIA-0011", label: "SIA-0011 · Ribeirão dos Apertados · Arapongas", overall: 0.396, rank: 18 }],
      trace: {
        campaign: "C1", sia: "SIA-0011", waterBody: "Ribeirão dos Apertados", municipality: "Arapongas", rank: 18, usedSetCount: 3,
        sets: [{ set: "Bactérias", totalReads: 25425, organismCount: 2, included: true, analyticalStatus: "Disponível",
          organisms: [{ label: "Organismo A", reads: 20000, proportion: 20000 / 25425, scores: { Ambiental: 2, Operacional: null, "Saúde humana": 3 } }, { label: "Organismo B", reads: 5425, proportion: 5425 / 25425, scores: { Ambiental: null, Operacional: null, "Saúde humana": null } }],
          domains: { Ambiental: domain(0.158, 0.01075057358243199, 0.1581732899853036, 0.013333333333333334), Operacional: domain(0.081, 0.001, 0.081, 0.01), "Saúde humana": domain(0.258, 0.03, 0.258, 0.02) } }],
        domains: { Ambiental: { value: 0.58, lower: 0.58, upper: 0.58 }, Operacional: { value: 0, lower: 0, upper: 0 }, "Saúde humana": { value: 0.581, lower: 0.581, upper: 0.581 } },
        overall: { value: 0.387, lower: 0.387, upper: 0.387 },
      },
    } }));
    expect(markup).not.toContain("SYNTHETIC-METHOD");
    expect(markup).not.toContain("Exemplo");
    expect(markup).toContain("Refaça o cálculo de um ponto");
    expect(markup).toContain("Passo 1");
    expect(markup).toContain("25.425");
    expect(markup).toContain("78,7%");
    expect(markup).toContain("Q = 0,011");
    expect(markup).toContain("0,158");
    expect(markup).toContain("1,3% dos reads têm nota");
    expect(markup).toMatch(new RegExp("÷ 3 = <strong[^>]*>0,387</strong>"));
    expect(markup).toContain("18º da campanha");
    expect(markup).not.toContain("0.01075057358243199");
    expect(markup).toContain("não altera o cálculo publicado");
  });
  it("shows every number with at most three decimals; proportions as percentages", () => {
    expect([0, 1, 1 / 3].map((value) => formatResultIndex(value))).toEqual(["0,000", "1,000", "0,333"]);
    expect(`${formatResultIndex(0.2)}–${formatResultIndex(0.9)}`).toBe("0,200–0,900");
    expect(formatResultIndex(null)).toBe("Não disponível");
    expect(formatResultIndex("NA")).toBe("NA");
    expect(formatResultIndex(NaN)).toBe("Não disponível");
    expect(researchFieldText("environmentalUsed", 0.158173289)).toBe("0,158");
    expect(researchFieldText("environmentalSignal", 0.01075057358243199)).toBe("0,011");
    expect(researchFieldText("environmentalCoverage", 0.006)).toBe("0,6%");
    expect(researchFieldText("proportion", 0.7137)).toBe("71,4%");
    const help = readFileSync(new URL("../results-interpretation-help.tsx", import.meta.url), "utf8");
    expect(help).toContain("<ResultsReviewDialog");
    expect(help).toContain("{children}");
    expect(help).toContain("<CircleHelp");
    const browser = readFileSync(new URL("../research-method.tsx", import.meta.url), "utf8");
    expect(browser).toContain("{formula}");
    expect(browser).toContain("{variables}");
    expect(browser).toContain("{explanation}");
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
    expect(source).toContain("nenhum resultado foi substituído automaticamente");
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
