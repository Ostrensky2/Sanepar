import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { navigationItems } from "@/lib/navigation";
import { countLabel } from "@/lib/number-format";
import { MAJOR_RELEASES, majorOf } from "@/lib/release-notes";
import { campaignSheetScopeError, normalizeCampaignKeys, type CampaignSheetImport } from "@/lib/imports/campaign-sheet-import";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("4ª rodada — importador único de campo", () => {
  it("não há mais a tela Planilhas de campo; o link antigo abre o importador do Diário", () => {
    const hrefs = navigationItems.flatMap((item) => [item.href, ...(item.children ?? []).map((child) => child.href)]);
    expect(hrefs).not.toContain("/dados/campo");
    expect(read("next.config.ts")).toContain('{ source: "/dados/campo", destination: "/dados/diario-de-campo?importar=1", permanent: false }');
    expect(read("src/components/field-diary-page-content.tsx")).toContain('get("importar") !== "1"');
  });

  it("a rota antiga de importação de campo só mantém a exclusão administrativa", () => {
    const route = read("src/app/api/imports/campaigns/route.ts");
    expect(route).not.toMatch(/export\s+async\s+function\s+POST/);
    expect(route).toMatch(/export\s+async\s+function\s+DELETE/);
  });

  it("o importador do Diário faz o que só o outro fazia: campanha única, fotos por link e cópia da planilha", () => {
    const route = read("src/app/api/field-diary/import/route.ts");
    for (const step of ["campaignSheetScopeError", "attachStoredPhotos", "persistCampaignImport", "sanitizeCampaignMedia"]) expect(route).toContain(step);
    const point = (campaign: string) => ({ campaign }) as CampaignSheetImport["points"][number];
    const points = [point("2ª Campanha"), point(""), point("2ª Campanha")];
    normalizeCampaignKeys(points);
    expect(points[1].campaign).toBe("2ª Campanha");
    expect(campaignSheetScopeError(points)).toBeNull();
    expect(campaignSheetScopeError([point("C1"), point("C2")])).toMatch(/mais de uma campanha/);
  });
});

describe("4ª rodada — Ajuda › Versões e versão 2.0.0", () => {
  it("lista as versões principais da mais nova para a mais antiga, com a 1 e a 2", () => {
    expect(MAJOR_RELEASES.map((release) => release.major)).toEqual([2, 1]);
    expect(MAJOR_RELEASES.find((release) => release.major === 1)?.range).toContain("1.2.7");
    expect(MAJOR_RELEASES[0].moved?.some((item) => item.before.includes("Planilhas de campo"))).toBe(true);
    expect(majorOf("2.0.1")).toBe(2);
  });

  it("Versões é aberta pela Ajuda, pelo rodapé e pelo aviso da nova versão", () => {
    expect(read("src/app/(dashboard)/ajuda/page.tsx")).toContain('params.get("secao") === "versoes"');
    expect(read("src/components/app-version-stamp.tsx")).toContain('href="/ajuda?secao=versoes"');
    expect(read("src/components/results-review-dialog.tsx")).toContain('href="/ajuda?secao=versoes"');
  });

  it("o próximo deploy está programado para 2.0.0", () => {
    expect(JSON.parse(read("release-plan.json")).nextVersion).toBe("2.0.0");
  });
});

describe("4ª rodada — acabamentos", () => {
  it("plural por extenso, sem “ponto(s)”", () => {
    expect(countLabel(1, "ponto", "pontos")).toBe("1 ponto");
    expect(countLabel(1234, "ponto", "pontos")).toBe("1.234 pontos");
    expect(countLabel(0, "aviso", "avisos")).toBe("0 avisos");
  });

  it("tabela com rolagem própria segura os textos de leitor de tela (celular sem rolagem lateral)", () => {
    expect(read("src/app/globals.css")).toMatch(/\.overflow-x-auto:has\(table\)\s*\{\s*position: relative;/);
  });

  it("Impactos abre só com os organismos detectados na campanha", () => {
    expect(read("src/modules/results/components/research-browser.tsx")).toContain('(isPreparation ? "associations" : "detected")');
  });
});
