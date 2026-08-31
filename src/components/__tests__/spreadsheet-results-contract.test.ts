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
    expect(source).toContain("resolveCanonicalCampaign(formState.campaign)");
    expect(source).toContain("Somente administradores podem apagar resultados publicados.");
    expect(source).toContain("body: JSON.stringify({ campaignId: campaign.id, confirmation: campaign.id })");
    expect(confirmation).toBeGreaterThan(-1);
    expect(destructiveFetch).toBeGreaterThan(confirmation);
    expect(source).toContain('canDeleteSpreadsheets && view === "campo"');
  });

  it("preserva outras campanhas no cache local", () => {
    expect(source).toContain("campaignIdentityKey(null, point.campaign) !== campaign.id");
    expect(source).toContain("malformed browser data is not deleted");
  });
});
