import ExcelJS from "exceljs";
import { expect, it } from "vitest";
import { parseCampaignWorkbook } from "../campaigns";
import { readFieldReferences } from "../field-references";
import { campaignPointToFieldDiaryPayload } from "../field-spreadsheet-to-diary";

it("serializa XLSX real, lê Date Excel em São Paulo e diagnostica datas impossíveis", async () => {
  const previous = process.env.TZ;
  process.env.TZ = "America/Sao_Paulo";
  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Campanhas");
    sheet.addRow(["Campanha", "Cód. SIA", "Ponto", "Dia", "Data", "Manancial", "Município", "Latitude Original", "Longitude Original", "Latitude efetiva", "Longitude Efetiva"]);
    const dates = [new Date("2026-03-07T00:00:00.000Z"), "31/02/2026", "29/02/2026", "29/02/2024", "2026-04-31", "2026-03-08"];
    dates.forEach((date, i) => {
      const row = sheet.addRow(["1", String(i + 1), "Ponto", "1", date, "Rio", "Cidade", -25, -49, -25, -49]);
      if (date instanceof Date) row.getCell(5).numFmt = "dd/mm/yyyy";
    });
    const bytes = await workbook.xlsx.writeBuffer();
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(bytes);
    expect(reloaded.getWorksheet("Campanhas")!.getCell("E2").value).toBeInstanceOf(Date);
    const parsed = await parseCampaignWorkbook(bytes as ArrayBuffer, "campo.xlsx");
    expect(parsed.points.map(p => p.date)).toEqual(["07/03/2026", "Data inválida", "Data inválida", "29/02/2024", "Data inválida", "08/03/2026"]);
    expect(parsed.rowIssues).toHaveLength(3);
    expect(parsed.rowIssues[0]).toContain("Linha 3");
    for (const index of [1, 2, 4]) {
      expect(campaignPointToFieldDiaryPayload({ ...parsed.points[index], activities: ["Coleta de eDNA"] })).toBeNull();
    }
    expect(campaignPointToFieldDiaryPayload({ ...parsed.points[0], activities: ["Coleta de eDNA"] })?.entryDate).toBe("2026-03-07");
    const refs = readFieldReferences([{ id: "fixture", file_name: "campo.xlsx", created_at: "", points: parsed.points }], 1);
    expect(refs.filter(r => r.datePrecision === "civil_day").map(r => r.sourceDate)).toEqual(["2026-03-07", "2024-02-29", "2026-03-08"]);
    expect(refs.filter(r => r.sourceDateRaw === "Data inválida").every(r => r.sourceDate === "")).toBe(true);
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
});
