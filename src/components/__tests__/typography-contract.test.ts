import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("contrato tipográfico global", () => {
  it("mantém uma escala semântica legível sobre a família canônica", () => {
    const css = source("src/app/globals.css");
    const layout = source("src/app/layout.tsx");

    expect(layout).toContain('"Arial, Helvetica, sans-serif"');
    expect(css).toContain("--text-page-title: 2rem");
    expect(css).toContain("--text-body: 1rem");
    expect(css).toContain("--text-metadata: 0.875rem");
    expect(css).toContain("--text-label: 0.8125rem");
    expect(css).toContain("--text-caption: 0.75rem");
    expect(css).toContain("--text-kpi: 1.75rem");
    expect(css).toContain(".type-eyebrow");
    expect(css).toContain(".type-panel-title");
    expect(css).toContain(".type-table");
    expect(css).toContain(".type-button");
    expect(css).toContain(".type-kpi");
  });

  it("usa a primitive canônica para títulos de página e seção", () => {
    const header = source("src/components/page-header.tsx");
    const section = source("src/components/section-card.tsx");

    expect(header).toContain('<h1 className="heading-font type-page-title');
    expect(section).toContain('<h2 className="heading-font type-section-title');
  });

  it("mantém o shell como contexto e a campanha como único título principal", () => {
    const shell = source("src/components/app-shell.tsx");
    const campaigns = source("src/components/campaigns-page-content.tsx");
    const results = source("src/components/campaign-results-panels.tsx");

    expect(shell).toContain('<p className="heading-font type-metadata');
    expect(shell).not.toMatch(/<h2[^>]*>[\s\S]*?currentItem\.headerTitle/);
    expect(campaigns).toContain('<h1 className="heading-font type-page-title');
    expect(results).toContain('<h2 className="heading-font type-section-title');
    expect(results).toContain("Dashboard de resultados");
    expect(results).toContain('className="type-metadata mt-1 font-semibold');
  });

  it("expõe um título principal no repositório de documentos", () => {
    const repository = source("src/components/document-repository.tsx");

    expect(repository).toContain("<PageHeader");
    expect(repository).toContain('title="Repositório Oficial de Documentos"');
  });

  it("mantém um título principal único na página inicial", () => {
    const home = source("src/app/(dashboard)/page.tsx");

    expect(home).toContain('<h1 className="heading-font type-page-title');
    expect(home).toContain("Painel de Monitoramento");
  });

  it("harmoniza o dashboard científico apenas por CSS local", () => {
    const dashboard = source("public/dashboards/Painel_eDNA_Campanha1_Sanepar.html");

    expect(dashboard).toContain("--sans:Arial,Helvetica,sans-serif");
    expect(dashboard).toContain(".sec-h{color:var(--brand-navy-strong);font-size:20px");
    expect(dashboard).toContain(".kpi .v{font-size:24px");
    expect(dashboard).toContain(".disc{margin:12px 0 2px");
    expect(dashboard).toContain("font-size:14px;line-height:1.55");
  });
});
