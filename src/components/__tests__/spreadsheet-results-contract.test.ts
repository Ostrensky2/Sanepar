import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SpreadsheetRepository } from "../spreadsheet-repository";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("planilhas de resultados: só as matrizes por SIA", () => {
  it("oferece o preparo das matrizes e não oferece a publicação da planilha antiga", () => {
    const current = renderToStaticMarkup(createElement(SpreadsheetRepository));
    expect(current).toContain("Preparar matrizes por SIA");
    expect(current).not.toMatch(/Fluxo legado|Publicar campanhas selecionadas/);
    for (const path of ["src/components/spreadsheet-repository.tsx", "src/app/(dashboard)/dados/pendencias/page.tsx", "src/app/(dashboard)/dados/resultados/page.tsx"]) {
      const source = read(path);
      expect(source).not.toContain("LegacyPublicationFlow");
      expect(source).not.toContain("/api/imports/results");
    }
  });
});
