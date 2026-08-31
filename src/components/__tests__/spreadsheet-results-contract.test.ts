import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/spreadsheet-repository.tsx"),
  "utf8",
);

describe("results spreadsheet actions contract", () => {
  it("sempre encerra pending, trata timeout e resposta não JSON", () => {
    expect(source).toContain("RESULTS_IMPORT_TIMEOUT_MS");
    expect(source).toContain("readResultsApiPayload<LaboratoryResultsPayload>");
    expect(source).toContain("formatResultsImportError(response.status, payload.error)");
    expect(source).toContain("window.clearTimeout(resultsTimeout)");
    expect(source).toContain("stopOperation();");
    expect(source).toContain("setIsPending(false);");
    expect(source).toContain("A interface não confirmou a conclusão; consulte o estado da campanha antes de repetir.");
    expect(source).toContain(
      "Importação cancelada. A interface não confirmou a conclusão; consulte o estado da campanha antes de repetir.",
    );
    expect(source).not.toContain("Importação cancelada. Nenhum dado novo foi publicado.");
  });

  it("apaga somente após confirmação e envia a campanha canônica", () => {
    const confirmation = source.indexOf("if (!window.confirm(");
    const destructiveFetch = source.indexOf('method: "DELETE"', confirmation);

    expect(source).toContain("Apagar resultados desta campanha");
    expect(source).toContain('{isDeletingResults ? "Apagando resultados desta campanha..." : "Apagar resultados desta campanha"}');
    expect(source).toContain("resolveCanonicalCampaign(formState.campaign)");
    expect(source).toContain("Somente administradores podem apagar resultados publicados.");
    expect(source).toContain("body: JSON.stringify({ campaignId: campaign.id, confirmation: campaign.id })");
    expect(confirmation).toBeGreaterThan(-1);
    expect(destructiveFetch).toBeGreaterThan(confirmation);
    expect(source).toContain('canDeleteSpreadsheets && view === "campo"');
    expect(source).toContain('className="grid gap-2 lg:grid-cols-12"');
    expect(source).toContain("disabled:opacity-60 lg:col-span-3");
    expect(source).toContain("disabled:opacity-50 lg:col-span-3");
    expect(source).not.toContain("lg:col-start-");
    expect(source).not.toContain('className="text-[10px] leading-tight"');
    expect(source).not.toContain('className="mb-2 flex justify-end"');
    expect(source).toContain('href: "/modelo-planilha-resultados.xlsx"');
    expect(source).toContain("campanha + data + SIA como identificação interna");
  });

  it("preserva outras campanhas no cache local", () => {
    expect(source).toContain("campaignIdentityKey(null, point.campaign) !== campaign.id");
    expect(source).toContain("malformed browser data is not deleted");
  });
});
