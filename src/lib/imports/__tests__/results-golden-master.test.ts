import ExcelJS from "exceljs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseLaboratoryResultsWorkbook } from "@/lib/imports/results";
import {
  RESULTS_DASHBOARD_HEADERS,
  RESULTS_DASHBOARD_SECTIONS,
  RESULTS_DICTIONARY_HEADERS,
  RESULTS_INSTRUCTION_FIELDS,
  RESULTS_INSTRUCTION_HEADERS,
  RESULTS_MOLECULAR_FIELDS,
  RESULTS_RANKING_FIELDS,
  RESULTS_SCHEMA_VERSION,
  RESULTS_WORKSHEETS,
  type ResultsViewModel,
} from "@/lib/imports/results-contract";

describe("results schema golden master", () => {
  it("round-trips o DATA homologado sem recalcular seus valores", async () => {
    const html = readFileSync(
      resolve(process.cwd(), "public/dashboards/Painel_eDNA_Campanha1_Sanepar.html"),
      "utf8",
    );
    const viewModel = JSON.parse(
      html.match(/const DATA\s*=\s*(\{[^\n]*\});/)![1],
    ) as ResultsViewModel;
    const ranking = JSON.parse(
      html.match(/<script id="DATA" type="application\/json">([\s\S]*?)<\/script>/)![1],
    ).ranking as Array<Record<string, unknown>>;
    const workbook = buildWorkbook(viewModel, ranking);
    const bytes = await workbook.xlsx.writeBuffer();
    const binary = bytes as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
    const buffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);
    const parsed = await parseLaboratoryResultsWorkbook(buffer, "campanha-1.xlsx");

    expect(parsed.viewModel).toEqual(viewModel);
    expect(parsed.viewModel.points).toHaveLength(73);
    expect(parsed.viewModel.alerts).toHaveLength(39);
    expect(parsed.viewModel.coi_all).toHaveLength(173);
    expect(parsed.metadata).toMatchObject({
      campaignId: "campanha-1",
      campaignNumber: 1,
      schemaVersion: RESULTS_SCHEMA_VERSION,
      publicationStatus: "published",
    });
  });

  it("usa campanha + data + SIA quando a identificação nominal está ausente", async () => {
    const html = readFileSync(
      resolve(process.cwd(), "public/dashboards/Painel_eDNA_Campanha1_Sanepar.html"),
      "utf8",
    );
    const viewModel = JSON.parse(
      html.match(/const DATA\s*=\s*(\{[^\n]*\});/)![1],
    ) as ResultsViewModel;
    const ranking = JSON.parse(
      html.match(/<script id="DATA" type="application\/json">([\s\S]*?)<\/script>/)![1],
    ).ranking as Array<Record<string, unknown>>;
    const workbook = buildWorkbook(viewModel, ranking);
    const molecular = workbook.getWorksheet(RESULTS_WORKSHEETS.molecular)!;
    const rankingSheet = workbook.getWorksheet(RESULTS_WORKSHEETS.ranking)!;
    molecular.getCell("A2").value = null;
    rankingSheet.getCell("B2").value = molecular.getCell("B2").value;
    const bytes = await workbook.xlsx.writeBuffer();
    const binary = bytes as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
    const buffer = binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength);

    const parsed = await parseLaboratoryResultsWorkbook(buffer, "campanha-1.xlsx");

    expect(parsed.fallbackSampleIdCount).toBe(1);
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.molecularRows[0].sampleId).toMatch(/^campanha-1-verao-2026\|\d{4}-\d{2}-\d{2}\|sia:\d+$/);
  });

  it("falha fechado quando identificação e SIA estão ausentes", async () => {
    const { viewModel, ranking } = readGoldenMaster();
    const workbook = buildWorkbook(viewModel, ranking);
    const molecular = workbook.getWorksheet(RESULTS_WORKSHEETS.molecular)!;
    molecular.getCell("A2").value = null;
    molecular.getCell("B2").value = null;
    const bytes = await workbook.xlsx.writeBuffer();
    const binary = bytes as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number };

    await expect(parseLaboratoryResultsWorkbook(
      binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength),
      "campanha-1.xlsx",
    )).rejects.toThrow("Banco_consolidado, linha 2, Cód. SIA: valor obrigatório ausente.");
  });

  it("bloqueia metadados conflitantes para campanha + data + SIA", async () => {
    const { viewModel, ranking } = readGoldenMaster();
    const workbook = buildWorkbook(viewModel, ranking);
    const molecular = workbook.getWorksheet(RESULTS_WORKSHEETS.molecular)!;
    molecular.getCell("B3").value = molecular.getCell("B2").value;
    molecular.getCell("C3").value = molecular.getCell("C2").value;
    const bytes = await workbook.xlsx.writeBuffer();
    const binary = bytes as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number };

    await expect(parseLaboratoryResultsWorkbook(
      binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength),
      "campanha-1.xlsx",
    )).rejects.toThrow("coordenadas ou metadados conflitantes para a mesma identidade");
  });

  it("bloqueia ranking por SIA quando duas amostras nominais compartilham a identidade", async () => {
    const { viewModel, ranking } = readGoldenMaster();
    const workbook = buildWorkbook(viewModel, ranking);
    const molecular = workbook.getWorksheet(RESULTS_WORKSHEETS.molecular)!;
    const rankingSheet = workbook.getWorksheet(RESULTS_WORKSHEETS.ranking)!;
    for (let column = 2; column <= 15; column += 1) {
      molecular.getRow(3).getCell(column).value = molecular.getRow(2).getCell(column).value;
    }
    rankingSheet.getCell("B2").value = molecular.getCell("B2").value;
    const bytes = await workbook.xlsx.writeBuffer();
    const binary = bytes as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number };

    await expect(parseLaboratoryResultsWorkbook(
      binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength),
      "campanha-1.xlsx",
    )).rejects.toThrow("SIA corresponde a mais de uma amostra no Banco_consolidado");
  });
});

function readGoldenMaster() {
  const html = readFileSync(
    resolve(process.cwd(), "public/dashboards/Painel_eDNA_Campanha1_Sanepar.html"),
    "utf8",
  );
  return {
    viewModel: JSON.parse(html.match(/const DATA\s*=\s*(\{[^\n]*\});/)![1]) as ResultsViewModel,
    ranking: JSON.parse(
      html.match(/<script id="DATA" type="application\/json">([\s\S]*?)<\/script>/)![1],
    ).ranking as Array<Record<string, unknown>>,
  };
}

function buildWorkbook(viewModel: ResultsViewModel, ranking: Array<Record<string, unknown>>) {
  const workbook = new ExcelJS.Workbook();
  const instructions = workbook.addWorksheet(RESULTS_WORKSHEETS.instructions);
  instructions.addRow([...RESULTS_INSTRUCTION_HEADERS]);
  const values: Record<string, string | number> = {
    schema_version: RESULTS_SCHEMA_VERSION,
    campaign_id: "campanha-1",
    campaign_number: 1,
    campaign_title: String(viewModel.meta.campanha),
    publication_status: "published",
    methodology_origin: "Golden master Campanha 1 homologado",
    methodology_version: "2026-08-21",
  };
  RESULTS_INSTRUCTION_FIELDS.forEach((field) => instructions.addRow([field.key, values[field.key]]));

  const dictionary = workbook.addWorksheet(RESULTS_WORKSHEETS.dictionary);
  dictionary.addRow([...RESULTS_DICTIONARY_HEADERS]);
  RESULTS_INSTRUCTION_FIELDS.forEach((field) => dictionary.addRow([RESULTS_WORKSHEETS.instructions, field.key]));
  RESULTS_MOLECULAR_FIELDS.forEach((field) => dictionary.addRow([RESULTS_WORKSHEETS.molecular, field.header]));
  RESULTS_RANKING_FIELDS.forEach((field) => dictionary.addRow([RESULTS_WORKSHEETS.ranking, field.header]));
  RESULTS_DASHBOARD_SECTIONS.forEach((section) => dictionary.addRow([RESULTS_WORKSHEETS.dashboard, section]));

  const molecular = workbook.addWorksheet(RESULTS_WORKSHEETS.molecular);
  molecular.addRow(RESULTS_MOLECULAR_FIELDS.map((field) => field.header));
  const campaignDatesBySample = new Map(
    ranking.map((row) => [String(row["Amostra"]), String(row["Campanha/Data"])]),
  );
  for (const point of viewModel.points) {
    const tags = [point.tox_reads > 0 ? "TOX" : "", point.odor_reads > 0 ? "ODOR" : "", point.inv_reads > 0 ? "INV" : ""].filter(Boolean);
    molecular.addRow([
      String(point.amostra), String(point.sia), campaignDatesBySample.get(String(point.amostra)) ?? "2026-01-01", point.manancial, point.municipio,
      "", "", point.lat, point.lon, "", point.turbidez, "", point.clima,
      "16S", "Cianobactérias", `Táxon explícito ${point.amostra}`, "", tags.join(";"),
      tags.length ? "Associação explícita do golden master" : "", tags.includes("INV") ? "Sim" : "Não",
      point.ciano_reads, point.ciano_pct,
    ]);
  }

  const alertsBySample = new Map(viewModel.alerts.map((alert) => [String(alert.amostra), alert]));
  const rankingSheet = workbook.addWorksheet(RESULTS_WORKSHEETS.ranking);
  rankingSheet.addRow(RESULTS_RANKING_FIELDS.map((field) => field.header));
  for (const row of ranking) {
    const sampleId = String(row["Amostra"]);
    const alert = alertsBySample.get(sampleId);
    rankingSheet.addRow([
      row["Posição"], sampleId, row["Ponto de coleta"], row["Manancial/corpo hídrico"],
      row["Município"], row["Campanha/Data"], "", "", row["Principais organismos"],
      row["Principais drivers de risco"], row["Risco ambiental"], row["Risco operacional"],
      row["Risco sanitário"], row["Classificação integrada"], row["Score integrado"],
      row["Ciano reads"], "", row["Bact. sanitárias reads"], "", row["COI invasores reads"],
      row["Justificativa técnica"], row["Nível de confiança"], row["Recomendações"], "",
      alert ? "Sim" : "Não", alert?.tags.map((tag) => tag.toUpperCase()).join(";") ?? "",
      alert?.reasons.join(";") ?? "",
    ]);
  }

  const dashboard = workbook.addWorksheet(RESULTS_WORKSHEETS.dashboard);
  dashboard.addRow([...RESULTS_DASHBOARD_HEADERS]);
  RESULTS_DASHBOARD_SECTIONS.forEach((section) => dashboard.addRow([
    section,
    JSON.stringify(viewModel[section]),
    "Golden master Campanha 1 homologado",
    "2026-08-21",
  ]));
  return workbook;
}
