/**
 * Geração das planilhas Excel exportadas pela tela de Campanhas
 * (Diário de campo e resultados). Extraído de campaigns-page-content.tsx.
 */
import type { Workbook, Worksheet } from "exceljs";
import type { CampaignView } from "@/lib/campaign-management";
import type { FieldDiaryEntry } from "@/lib/field-diary";
import type { ResultsPublication } from "@/lib/imports/results-contract";
import type { LaboratoryRiskPoint } from "@/lib/laboratory-risk";
import { diaryEntryMatchesSelectedCampaign, findDiaryEntryForMapPoint } from "@/lib/campaign-point-matching";

export function getExportDiaryEntries(
  entries: FieldDiaryEntry[],
  campaigns: CampaignView[],
  selectedCampaignIds: string[],
) {
  if (selectedCampaignIds.includes("all")) {
    return entries;
  }

  const selectedCampaigns = campaigns.filter((campaign) => selectedCampaignIds.includes(campaign.id));

  return entries.filter((entry) =>
    selectedCampaigns.some((campaign) =>
      diaryEntryMatchesSelectedCampaign(entry, campaign.id, campaign.title),
    ),
  );
}

export function formatExportCampaignSelection(campaigns: CampaignView[], selectedCampaignIds: string[]) {
  if (selectedCampaignIds.includes("all")) {
    return "Todas as campanhas";
  }

  const labels = campaigns
    .map((campaign, index) => ({
      id: campaign.id,
      label: `Campanha ${index + 1}`,
    }))
    .filter((campaign) => selectedCampaignIds.includes(campaign.id))
    .map((campaign) => campaign.label);

  return labels.length ? labels.join(" + ") : "Campanhas selecionadas";
}

export function addFieldDiarySummarySheet(
  workbook: Workbook,
  entries: FieldDiaryEntry[],
  campaignTitle: string,
  sheetName = "Resumo agregado",
) {
  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "Campanha", key: "campaign", width: 34 },
    { header: "Dia da campanha", key: "campaignDay", width: 16 },
    { header: "Data", key: "entryDate", width: 14 },
    { header: "Registros", key: "entries", width: 12 },
    { header: "Pontos/SIA distintos", key: "points", width: 18 },
    { header: "Municípios distintos", key: "municipalities", width: 20 },
    { header: "Com coordenadas", key: "coordinates", width: 16 },
    { header: "Com ocorrência", key: "occurrences", width: 16 },
    { header: "Com follow-up", key: "followUps", width: 16 },
    { header: "Atividades", key: "activities", width: 36 },
    { header: "Condições visuais da água", key: "waterConditions", width: 40 },
  ];

  const grouped = new Map<string, FieldDiaryEntry[]>();

  for (const entry of entries) {
    const key = [entry.campaignName || campaignTitle, entry.campaignDay, entry.entryDate].join("|");
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }

  for (const groupEntries of [...grouped.values()].sort(compareFieldDiaryGroups)) {
    sheet.addRow({
      campaign: groupEntries[0]?.campaignName || campaignTitle,
      campaignDay: groupEntries[0]?.campaignDay ?? "",
      entryDate: formatExportDate(groupEntries[0]?.entryDate),
      entries: groupEntries.length,
      points: uniqueExportValues(groupEntries.map((entry) => entry.sia || entry.locationName)).length,
      municipalities: uniqueExportValues(groupEntries.map((entry) => entry.municipality)).length,
      coordinates: groupEntries.filter((entry) => entry.latitude && entry.longitude).length,
      occurrences: groupEntries.filter((entry) => entry.hasOccurrence).length,
      followUps: groupEntries.filter((entry) => entry.requiresFollowUp !== "Não").length,
      activities: uniqueExportValues(groupEntries.flatMap((entry) => entry.activities)).join("; "),
      waterConditions: uniqueExportValues(groupEntries.flatMap((entry) => entry.waterVisualConditions)).join("; "),
    });
  }

  styleWorksheet(sheet, "K");
}

export function addCampaignResultsSheet(
  workbook: Workbook,
  points: LaboratoryRiskPoint[],
  diaryEntries: FieldDiaryEntry[],
) {
  const sheet = workbook.addWorksheet("Resultados por ponto", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "Campanha", key: "campaign", width: 34 },
    { header: "SIA", key: "sia", width: 16 },
    { header: "Amostra", key: "sampleId", width: 18 },
    { header: "Ponto/local", key: "point", width: 34 },
    { header: "Corpo hídrico", key: "waterBody", width: 34 },
    { header: "Município", key: "municipality", width: 22 },
    { header: "Data", key: "date", width: 14 },
    { header: "Latitude efetiva", key: "latitude", width: 18 },
    { header: "Longitude efetiva", key: "longitude", width: 18 },
    { header: "Ranking", key: "ranking", width: 12 },
    { header: "Score integrado", key: "score", width: 16 },
    { header: "Classificação integrada", key: "classification", width: 24 },
    { header: "Risco ambiental", key: "environmentalRisk", width: 24 },
    { header: "Risco operacional", key: "operationalRisk", width: 24 },
    { header: "Risco sanitário", key: "sanitaryRisk", width: 24 },
    { header: "Marcadores eDNA", key: "markers", width: 42 },
    { header: "Sinal eDNA", key: "ednaSignal", width: 28 },
    { header: "Confiança", key: "confidence", width: 18 },
    { header: "Síntese técnica", key: "summary", width: 54 },
    { header: "Recomendações", key: "recommendations", width: 54 },
    { header: "Status laboratorial", key: "laboratoryStatus", width: 20 },
    { header: "Acessibilidade registrada", key: "accessibility", width: 24 },
    { header: "Atividades registradas", key: "activities", width: 36 },
    { header: "Condições da água registradas", key: "waterConditions", width: 42 },
    { header: "Ocorrência registrada?", key: "hasOccurrence", width: 22 },
    { header: "Tipo de ocorrência", key: "occurrenceType", width: 28 },
    { header: "Problema/descrição", key: "occurrenceDescription", width: 48 },
    { header: "Follow-up", key: "followUp", width: 20 },
    { header: "Notas de follow-up", key: "followUpNotes", width: 48 },
  ];

  for (const point of points) {
    const diaryEntry = findDiaryEntryForMapPoint(point, diaryEntries);
    sheet.addRow({
      campaign: point.campaign,
      sia: point.code,
      sampleId: point.sampleId,
      point: point.point ?? point.waterBody,
      waterBody: point.waterBody,
      municipality: point.municipality,
      date: formatExportDate(point.date),
      latitude: point.effective?.lat ?? "",
      longitude: point.effective?.lon ?? "",
      ranking: point.rankingPosition ?? "",
      score: point.score ?? "",
      classification: point.riskClassification,
      environmentalRisk: point.environmentalRisk,
      operationalRisk: point.operationalRisk,
      sanitaryRisk: point.sanitaryRisk,
      markers: point.detectedMarkers.join("; "),
      ednaSignal: point.ednaSignal,
      confidence: point.confidence,
      summary: point.resultSummary,
      recommendations: point.recommendations,
      laboratoryStatus: point.laboratoryStatus,
      accessibility: diaryEntry?.pointAccessibility ?? "",
      activities: diaryEntry?.activities.join("; ") ?? "",
      waterConditions: diaryEntry?.waterVisualConditions.join("; ") ?? "",
      hasOccurrence: diaryEntry ? (diaryEntry.hasOccurrence ? "Sim" : "Não") : "",
      occurrenceType: diaryEntry?.occurrenceType ?? "",
      occurrenceDescription: diaryEntry?.occurrenceDescription ?? "",
      followUp: diaryEntry?.requiresFollowUp ?? "",
      followUpNotes: diaryEntry?.followUpNotes ?? "",
    });
  }

  styleWorksheet(sheet, "AC");
}

export function addFieldDiaryEntriesSheet(
  workbook: Workbook,
  entries: FieldDiaryEntry[],
) {
  const sheet = workbook.addWorksheet("Diário de campo completo", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = [
    { header: "Campanha", key: "campaignName", width: 34 },
    { header: "ID da campanha", key: "campaignId", width: 26 },
    { header: "Dia da campanha", key: "campaignDay", width: 16 },
    { header: "Data", key: "entryDate", width: 14 },
    { header: "Horário", key: "collectionTime", width: 12 },
    { header: "Local/ponto", key: "locationName", width: 32 },
    { header: "SIA", key: "sia", width: 16 },
    { header: "Amostras/réplicas eDNA", key: "samplesReplicasEdna", width: 22 },
    { header: "ID Zooplâncton", key: "zooplanktonId", width: 18 },
    { header: "Latitude", key: "latitude", width: 14 },
    { header: "Longitude", key: "longitude", width: 14 },
    { header: "Município", key: "municipality", width: 22 },
    { header: "Atividades", key: "activities", width: 36 },
    { header: "Condições visuais da água", key: "waterVisualConditions", width: 40 },
    { header: "Ocorrência?", key: "hasOccurrence", width: 14 },
    { header: "Tipo de ocorrência", key: "occurrenceType", width: 26 },
    { header: "Descrição da ocorrência", key: "occurrenceDescription", width: 44 },
    { header: "Requer follow-up", key: "requiresFollowUp", width: 18 },
    { header: "Notas de follow-up", key: "followUpNotes", width: 44 },
    { header: "Clima", key: "weatherConditions", width: 20 },
    { header: "Acessibilidade", key: "pointAccessibility", width: 18 },
    { header: "Resumo diário", key: "dailySummary", width: 48 },
    { header: "Status", key: "status", width: 14 },
    { header: "Equipe", key: "createdByName", width: 24 },
    { header: "Criado em", key: "createdAt", width: 22 },
    { header: "Atualizado em", key: "updatedAt", width: 22 },
  ];

  for (const entry of entries) {
    sheet.addRow({
      campaignName: entry.campaignName,
      campaignId: entry.campaignId ?? "",
      campaignDay: entry.campaignDay,
      entryDate: formatExportDate(entry.entryDate),
      collectionTime: entry.collectionTime,
      locationName: entry.locationName,
      sia: entry.sia ?? "",
      samplesReplicasEdna: entry.samplesReplicasEdna ?? "",
      zooplanktonId: entry.zooplanktonId ?? "",
      latitude: entry.latitude ?? "",
      longitude: entry.longitude ?? "",
      municipality: entry.municipality,
      activities: entry.activities.join("; "),
      waterVisualConditions: entry.waterVisualConditions.join("; "),
      hasOccurrence: entry.hasOccurrence ? "Sim" : "Não",
      occurrenceType: entry.occurrenceType ?? "",
      occurrenceDescription: entry.occurrenceDescription ?? "",
      requiresFollowUp: entry.requiresFollowUp,
      followUpNotes: entry.followUpNotes ?? "",
      weatherConditions: entry.weatherConditions ?? "",
      pointAccessibility: entry.pointAccessibility ?? "",
      dailySummary: entry.dailySummary,
      status: entry.status,
      createdByName: entry.createdByName ?? "",
      createdAt: formatExportDateTime(entry.createdAt),
      updatedAt: formatExportDateTime(entry.updatedAt),
    });
  }

  styleWorksheet(sheet, "Z");
}

export function addPublishedResultsSheets(workbook: Workbook, publication: ResultsPublication) {
  const ranking = workbook.addWorksheet("Resultados por ponto", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ranking.columns = [
    { header: "Campanha", key: "campaign", width: 34 },
    { header: "Amostra", key: "sampleId", width: 18 },
    { header: "Ponto/local", key: "pointName", width: 34 },
    { header: "Corpo hídrico", key: "waterBody", width: 34 },
    { header: "Município", key: "municipality", width: 22 },
    { header: "Data", key: "campaignDate", width: 18 },
    { header: "Ranking", key: "position", width: 12 },
    { header: "Score integrado", key: "score", width: 18 },
    { header: "Classificação integrada", key: "classification", width: 24 },
    { header: "Confiança", key: "confidence", width: 18 },
    { header: "Justificativa técnica", key: "technicalJustification", width: 54 },
    { header: "Recomendações", key: "recommendations", width: 54 },
  ];
  publication.rankingRows.forEach((row) => ranking.addRow({
    campaign: publication.campaignTitle,
    ...row,
    position: row.position ?? "Não calculado",
    score: row.score ?? "Não calculado",
    classification: row.classification ?? "Não calculado",
  }));
  styleWorksheet(ranking, "L");

  const molecular = workbook.addWorksheet("Banco molecular", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const keys = Object.keys(publication.molecularRows[0] ?? {});
  molecular.columns = keys.map((key) => ({ header: key, key, width: 22 }));
  publication.molecularRows.forEach((row) => molecular.addRow(row));
  if (keys.length) styleWorksheet(molecular, molecular.getColumn(keys.length).letter);
}

export function styleWorksheet(sheet: Worksheet, lastColumn: string) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF004262" },
  };
  sheet.autoFilter = `A1:${lastColumn}1`;
}

export function compareFieldDiaryGroups(left: FieldDiaryEntry[], right: FieldDiaryEntry[]) {
  const leftEntry = left[0];
  const rightEntry = right[0];

  if (!leftEntry || !rightEntry) {
    return left.length - right.length;
  }

  return (
    leftEntry.entryDate.localeCompare(rightEntry.entryDate) ||
    leftEntry.campaignDay - rightEntry.campaignDay ||
    leftEntry.campaignName.localeCompare(rightEntry.campaignName, "pt-BR")
  );
}

export function uniqueExportValues(values: Array<string | number | null | undefined>) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { numeric: true }),
  );
}

export function formatExportDate(value: string | undefined | null) {
  if (!value) {
    return "";
  }

  const datePart = value.slice(0, 10);
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export function formatExportDateTime(value: string | undefined | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function slugifyFileName(value: string) {
  return String(value || "campanha")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function buildCampaignResultsFileName(campaignTitle: string, date = new Date()) {
  const dateStamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");

  return `${slugifyFileName(campaignTitle)}-resultados-${dateStamp}.xlsx`;
}

export async function downloadWorkbook(workbook: Workbook, fileName: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, fileName);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
