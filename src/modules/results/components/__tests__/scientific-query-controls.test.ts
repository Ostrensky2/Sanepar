import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getNavigationAccessForPath, navigationItems } from "@/lib/navigation";
import { ScientificMultiFilter, ScientificRecordDetail, ScientificSourceLinks, ScientificViews, safeScientificHref, searchScientificOptions } from "../scientific-query-controls";

describe("scientific results navigation and filters", () => {
  it("exposes the current view and complete escaped detail without replacing missing values with zero", () => {
    const views = renderToStaticMarkup(createElement(ScientificViews, { views: [{ value: "impacts", label: "Explorar impactos" }, { value: "occurrences", label: "Ocorrências nas campanhas" }], selected: "impacts", onChange: () => undefined }));
    expect(views.match(/aria-current="page"/g)).toHaveLength(1);
    const detail = renderToStaticMarkup(createElement(ScientificRecordDetail, { groups: [{ title: "Limitações", fields: [{ label: "Score bibliográfico", value: "NA — não atribuído" }, { label: "Contexto", value: "Via hídrica não demonstrada <img>" }, { label: "Toxina", value: null }, { label: "Reads registrados", value: 0 }] }] }));
    expect(detail).toContain("NA — não atribuído");
    expect(detail).toContain("Via hídrica não demonstrada &lt;img&gt;");
    expect(detail).toContain("Não informado na fonte");
    expect(detail).toContain(">0</dd>");
  });
  it("renders separate safe source links without implying citation pairing or verification", () => {
    expect(safeScientificHref("javascript:alert(1)")).toBeNull();
    expect(safeScientificHref("https://user:password@example.org")).toBeNull();
    const markup = renderToStaticMarkup(createElement(ScientificSourceLinks, { originalText: "Texto original <img onerror=x>", links: [{ href: "https://doi.org/10.1/example", label: "DOI informado" }, { href: "https://example.org/source", label: "URL informada" }], needsReview: true }));
    expect(markup.match(/<a /g)).toHaveLength(2);
    expect(markup).not.toContain("<img");
    expect(markup).toContain("requer conferência");
    expect(markup).not.toContain("verificada");
  });
  it("groups consultation routes as section tabs with existing privileges and technical URLs", () => {
    const campaigns = navigationItems.find((item) => item.href === "/campanhas/campo")!;
    expect(campaigns.children?.map((item) => item.label)).toEqual(["Campo", "Resultados"]);
    const science = navigationItems.find((item) => item.href === "/resultados/impactos")!;
    expect(science.children?.map((item) => item.label)).toEqual(["Impactos potenciais", "Como o índice é calculado"]);
    expect(navigationItems.find((item) => item.label === "Atividades complementares")?.href).toBe("/acoes-pontuais");
    expect(getNavigationAccessForPath("/campanhas/resultados")?.requiredPrivileges).toEqual(["nav.results"]);
    for (const path of ["/resultados/impactos", "/resultados/calculos"]) expect(getNavigationAccessForPath(path)?.requiredPrivileges).toContain("nav.results");
  });
  it("searches text without accents without changing option identities", () => {
    const options = [{ value: "record-1", label: "Saúde humana" }, { value: "record-2", label: "Ambiental" }];
    expect(searchScientificOptions(options, "SAUDE")).toEqual([options[0]]);
    expect(searchScientificOptions(options, "saudx")).toEqual([]);
  });
  it("keeps native multiple choices and NA visible without numeric substitution", () => {
    const markup = renderToStaticMarkup(createElement(ScientificMultiFilter, { label: "Score", options: [{ value: "NA", label: "NA — não atribuído" }, { value: "1", label: "1" }], selected: ["NA", "1"], onChange: () => undefined }));
    expect(markup).toContain("<fieldset");
    expect(markup.match(/type="checkbox"/g)).toHaveLength(2);
    expect(markup.match(/checked=""/g)).toHaveLength(2);
    expect(markup).toContain("NA — não atribuído");
    expect(markup).toContain("Limpar score");
  });
});
