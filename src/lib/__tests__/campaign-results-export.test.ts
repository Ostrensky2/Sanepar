import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  addCampaignResultsSheet,
  addFieldDiaryEntriesSheet,
  addFieldDiarySummarySheet,
  buildCampaignResultsFileName,
} from "@/components/campaigns-page-content";
import type { FieldDiaryEntry } from "@/lib/field-diary";
import type { LaboratoryRiskPoint } from "@/lib/laboratory-risk";

const resultPoint = {
  id: "result-sia-93",
  code: "SIA-0093",
  point: "25",
  day: "14",
  campaign: "1ª Campanha - Verão 2026",
  date: "2026-02-22",
  municipality: "Francisco Beltrão",
  waterBody: "Rio Marrecas",
  original: null,
  effective: { lat: -26.081433, lon: -53.07515 },
  accessibility: "planejado não exportável",
  waterAspect: "",
  weatherConditions: "",
  problems: "planejado não exportável",
  driveUrl: "",
  dropboxUrl: "",
  photoUrl: "",
  riskLevel: "alto",
  riskLabel: "Risco alto",
  riskClassification: "Alto",
  environmentalRisk: "Alto",
  operationalRisk: "Moderado",
  sanitaryRisk: "Baixo",
  environmentalRiskLevel: "alto",
  operationalRiskLevel: "moderado",
  sanitaryRiskLevel: "baixo",
  eta: "Rio Marrecas",
  detectedMarkers: ["Ciano: 10 reads"],
  ednaSignal: "Alto",
  laboratoryStatus: "homologado",
  resultSummary: "Resultado final homologado",
  score: 0.75,
  confidence: "Alta",
  recommendations: "Acompanhar",
  rankingPosition: 1,
  sampleId: "A-93",
} satisfies LaboratoryRiskPoint;

const diaryEntry = {
  id: "diary-sia-93",
  campaignId: "campanha-1-verao-2026",
  campaignName: "1ª Campanha - Verão 2026",
  campaignDay: 14,
  entryDate: "2026-02-22",
  fieldTeamMembers: [],
  collectionTime: "09:00",
  locationName: "Rio Marrecas",
  sia: "SIA-0093",
  municipality: "Francisco Beltrão",
  activities: ["Coleta realizada"],
  waterVisualConditions: ["Turbidez visual elevada"],
  hasOccurrence: true,
  occurrenceType: "Alteração ambiental observada",
  occurrenceDescription: "Espuma registrada",
  requiresFollowUp: "Sim",
  followUpNotes: "Reavaliar na próxima campanha",
  pointAccessibility: "Difícil",
  dailySummary: "Coleta concluída",
  status: "Revisado",
  createdAt: "2026-02-22T12:00:00.000Z",
  updatedAt: "2026-02-22T13:00:00.000Z",
  photos: [],
} satisfies FieldDiaryEntry;

describe("campaign results workbook", () => {
  it("materializa somente resultados homologados e enriquece apenas com diário registrado", () => {
    const workbook = new ExcelJS.Workbook();
    addFieldDiarySummarySheet(workbook, [diaryEntry], resultPoint.campaign, "Resumo");
    addCampaignResultsSheet(workbook, [resultPoint], [diaryEntry]);
    addFieldDiaryEntriesSheet(workbook, [diaryEntry]);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Resumo",
      "Resultados por ponto",
      "Diário de campo completo",
    ]);
    expect(workbook.getWorksheet("Resumo")?.getRow(2).getCell("D").value).toBe(1);
    const sheet = workbook.getWorksheet("Resultados por ponto");
    expect(sheet?.rowCount).toBe(2);
    expect(sheet?.getRow(2).getCell("A").value).toBe("1ª Campanha - Verão 2026");
    expect(sheet?.getRow(2).getCell("B").value).toBe("SIA-0093");
    expect(sheet?.getRow(2).getCell("H").value).toBe(-26.081433);
    expect(sheet?.getRow(2).getCell("I").value).toBe(-53.07515);
    expect(sheet?.getRow(2).getCell("K").value).toBe(0.75);
    expect(sheet?.getRow(2).getCell("L").value).toBe("Alto");
    expect(sheet?.getRow(2).getCell("V").value).toBe("Difícil");
    expect(sheet?.getRow(2).getCell("Y").value).toBe("Sim");
    expect(sheet?.getRow(2).getCell("AA").value).toBe("Espuma registrada");
    expect(sheet?.getRow(2).getCell("AB").value).toBe("Sim");
    expect(sheet?.getRow(2).values).not.toContain("planejado não exportável");
    expect(workbook.getWorksheet("Diário de campo completo")?.rowCount).toBe(2);
  });

  it("gera filename com campanha e data", () => {
    expect(buildCampaignResultsFileName("1ª Campanha - Verão 2026", new Date(2026, 7, 21))).toBe(
      "1-campanha-verao-2026-resultados-2026-08-21.xlsx",
    );
  });

  it("mantém o botão e as três abas no fluxo da campanha selecionada", () => {
    const page = readFileSync(resolve(process.cwd(), "src/components/campaigns-page-content.tsx"), "utf8");
    const header = readFileSync(resolve(process.cwd(), "src/components/campaign-results-panels.tsx"), "utf8");
    const route = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/campanhas/resultados/page.tsx"),
      "utf8",
    );

    expect(header).toContain("Baixar planilha (.xlsx)");
    expect(header).toContain("Gerando planilha...");
    expect(header).toContain("sm:flex-row");
    expect(header).toContain("disabled={!canDownload || isDownloading || !onDownload}");
    expect(page).toContain('addFieldDiarySummarySheet(workbook, selectedDiaryEntries, selectedCampaign.title, "Resumo")');
    expect(page).toContain("addCampaignResultsSheet(workbook, selectedResultExportPoints, selectedDiaryEntries)");
    expect(page).toContain("addFieldDiaryEntriesSheet(workbook, selectedDiaryEntries)");
    expect(route).toContain("resultExportPoints={laboratoryRiskPoints}");
  });
});
