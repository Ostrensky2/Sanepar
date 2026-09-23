import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/components/spreadsheet-repository.tsx"), "utf8");

describe("results spreadsheet actions contract", () => {
  it("seleciona todas as campanhas reais da prévia e exige ao menos uma", () => {
    expect(source).toContain('fetch("/api/imports/results/preview"');
    expect(source).toContain("setSelectedResultCampaigns(payload.campaigns.map((campaign) => campaign.code))");
    expect(source).toContain('type="checkbox"');
    expect(source).toContain("checked={selectedResultCampaigns.includes(campaign.code)}");
    expect(source).toContain("!selectedResultCampaigns.length");
    expect(source).toContain("if (!resultsPreview || !selectedResultCampaigns.length) return null;");
    expect(source).not.toContain("Selecione explicitamente C1 ou C2");
    expect(source).toContain("planCampaignPublicationScope(resultsPreview.currentCampaigns");
    for (const label of ["Adicionar", "Substituir integralmente", "Já vigente, sem nova publicação", "Preservar fora do escopo"]) expect(source).toContain(`label="${label}"`);
    expect(source).toContain("Não há merge com pontos da publicação anterior.");
  });

  it("envia seleção, hash, heads e identificador estável; conflito exige nova prévia", () => {
    expect(source).toContain('for (const code of selectedResultCampaigns) resultsData.append("selectedCampaigns", code)');
    expect(source).toContain('resultsData.append("expectedHeads", JSON.stringify(resultsPreview.expectedHeads))');
    expect(source).toContain('resultsData.append("sourceSha256", resultsPreview.sourceSha256 ?? "")');
    expect(source).toContain('resultsRequestRef.current?.key !== requestKey');
    expect(source).toContain('resultsData.append("requestId", resultsRequestRef.current.id)');
    expect(source).toMatch(/response.status === 409[\s\S]*?setResultsPreview\(null\)/);
    expect(source).toContain("Revalidar prévia do arquivo selecionado");
  });

  it("usa inventário autoritativo e download da publicação exata, nunca cache de resultados", () => {
    expect(source).toContain('fetch("/api/imports/results?inventory=1", { cache: "no-store", signal })');
    // Só resultados: nenhuma lista local no navegador (localStorage/IndexedDB).
    expect(source).not.toContain("localStorage.setItem");
    expect(source).not.toContain("indexedDB");
    expect(source).toMatch(/finally \{[\s\S]*?await refreshResultsInventory\(\);/);
    expect(source).toContain("Estado não confirmado");
    expect(source).toContain("Atualizar lista");
    expect(source).toContain("source=published&campaignCode=${encodeURIComponent(sheet.campaignCode)}&publicationId=${encodeURIComponent(sheet.publicationId)}");
    expect(source).toContain("Não é um recorte da campanha selecionada.");
    expect(source).not.toContain("source=local-corrected-preview");
    expect(source).not.toContain("/modelo-planilha-resultados.xlsx");
  });

  it("preserva timeout honesto e bloqueia DELETE de resultados sem afetar Campo", () => {
    expect(source).toContain("RESULTS_IMPORT_TIMEOUT_MS");
    expect(source).toContain("readResultsApiPayload<LaboratoryResultsPayload>");
    expect(source).toContain("window.clearTimeout(resultsTimeout)");
    expect(source).toContain("stopOperation();");
    expect(source).toContain("setIsPending(false);");
    expect(source).toContain("A interface não confirmou a conclusão; consulte o estado da campanha antes de repetir.");
    expect(source).not.toContain("operação transacional");
    expect(source).not.toContain("deleteSelectedCampaignResults");
    expect(source).not.toContain('method: "DELETE"');
    // Planilhas de campo entram só pelo Diário de campo (importador único).
    expect(source).not.toContain("/api/imports/campaigns");
  });
});
