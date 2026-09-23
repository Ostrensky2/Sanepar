import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FlaskConical } from "lucide-react";
import { CanonicalKpi } from "../home-canonical-kpis";

describe("indicadores do Início", () => {
  it("mostram o detalhe como texto visível, sem depender de passar o mouse", () => {
    const markup = renderToStaticMarkup(createElement(CanonicalKpi, {
      icon: FlaskConical,
      label: "Índice médio — pontos completos",
      value: "0,333",
      detail: "C1 · média de 56 pontos completos; parciais fora da média",
    }));
    // Nada de tooltip nativo (title) nem texto só para leitor de tela: o detalhe precisa funcionar no toque e no teclado.
    expect(markup).not.toContain("title=");
    expect(markup).not.toContain("sr-only");
    expect(markup).toMatch(/<p[^>]*>C1 · média de 56 pontos completos; parciais fora da média<\/p>/);
  });
});
