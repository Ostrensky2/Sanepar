import ExcelJS from "exceljs";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const activityOptions = [
  "Coleta realizada",
  "Deslocamento entre pontos",
  "Vistoria visual",
  "Medição em campo",
  "Contato com equipe local",
  "Coleta não realizada",
  "Outra atividade",
];

const waterVisualConditionOptions = [
  "Aparentemente normal",
  "Alteração de cor",
  "Turbidez visual elevada",
  "Espuma",
  "Material flutuante",
  "Odor perceptível",
  "Presença aparente de floração",
  "Resíduos",
  "Peixes ou organismos mortos",
  "Nível de água visualmente baixo",
  "Outra condição",
];

const occurrenceTypeOptions = [
  "Problema de acesso ao ponto",
  "Ponto inacessível",
  "Coleta parcial",
  "Coleta não realizada",
  "Atraso operacional",
  "Problema com equipamento",
  "Condição climática adversa",
  "Alteração ambiental observada",
  "Demanda recebida em campo",
  "Outro",
];

const wb = new ExcelJS.Workbook();
wb.creator = "Yva'e Monitoramento";
wb.created = new Date();

// ─── Sheet 1: Registros ────────────────────────────────────────────────────
const ws = wb.addWorksheet("Registros");

const NAVY = "FF004262";
const WHITE = "FFFFFFFF";
const LIGHT_BLUE = "FFE8F4FB";
const EXAMPLE_BG = "FFF8FAFC";
const EXAMPLE_FG = "FF64748B";

const columns = [
  { header: "Campanha *", key: "campaignName", width: 32 },
  { header: "Dia da campanha *", key: "campaignDay", width: 17 },
  { header: "Data * (AAAA-MM-DD)", key: "entryDate", width: 20 },
  { header: "Responsável *", key: "createdByName", width: 26 },
  { header: "Local / Reservatório *", key: "locationName", width: 32 },
  { header: "SIA", key: "sia", width: 14 },
  { header: "Latitude", key: "latitude", width: 14 },
  { header: "Longitude", key: "longitude", width: 14 },
  { header: "Município *", key: "municipality", width: 22 },
  { header: "Atividades realizadas * (separar por ;)", key: "activities", width: 46 },
  { header: "Condições visuais da água * (separar por ;)", key: "waterVisualConditions", width: 50 },
  { header: "Houve ocorrência? (Sim/Não)", key: "hasOccurrence", width: 27 },
  { header: "Tipo de ocorrência", key: "occurrenceType", width: 30 },
  { header: "Descrição da ocorrência", key: "occurrenceDescription", width: 40 },
  { header: "Exige acompanhamento?", key: "requiresFollowUp", width: 24 },
  { header: "Pendência / Encaminhamento", key: "followUpNotes", width: 36 },
  { header: "Resumo do dia *", key: "dailySummary", width: 52 },
  { header: "Status", key: "status", width: 14 },
];

ws.columns = columns;

// Header row styling
const headerRow = ws.getRow(1);
headerRow.height = 38;
headerRow.eachCell((cell) => {
  cell.font = { name: "Arial", bold: true, size: 9, color: { argb: WHITE } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = {
    bottom: { style: "thin", color: { argb: "FF002D44" } },
  };
});

// Example row
ws.addRow({
  campaignName: "1ª Campanha - Verão 2026",
  campaignDay: 1,
  entryDate: "2026-05-20",
  createdByName: "Antonio Ostrensky",
  locationName: "Reservatório Rio Verde",
  sia: "RV-001",
  latitude: "-25.4284",
  longitude: "-49.2733",
  municipality: "Curitiba",
  activities: "Coleta realizada;Vistoria visual",
  waterVisualConditions: "Aparentemente normal",
  hasOccurrence: "Não",
  occurrenceType: "",
  occurrenceDescription: "",
  requiresFollowUp: "Não",
  followUpNotes: "",
  dailySummary: "Coleta realizada sem intercorrências. Água com aparência normal.",
  status: "Rascunho",
});

const exampleRow = ws.getRow(2);
exampleRow.height = 22;
exampleRow.eachCell((cell) => {
  cell.font = { name: "Arial", italic: true, size: 9, color: { argb: EXAMPLE_FG } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXAMPLE_BG } };
  cell.alignment = { vertical: "middle" };
});

// Data rows pre-formatting (rows 3-502)
for (let r = 3; r <= 502; r++) {
  const row = ws.getRow(r);
  row.height = 20;
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.font = { name: "Arial", size: 9 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: r % 2 === 0 ? LIGHT_BLUE : WHITE },
    };
    cell.alignment = { vertical: "middle" };
    void colNumber;
  });
}

// Freeze top row
ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];

// ─── Sheet 2: Valores válidos ──────────────────────────────────────────────
const wsRef = wb.addWorksheet("Valores válidos");
wsRef.views = [];

const refColumns = [
  { header: "Campanhas", width: 32 },
  { header: "Atividades realizadas", width: 36 },
  { header: "Condições visuais da água", width: 36 },
  { header: "Tipos de ocorrência", width: 32 },
  { header: "Acompanhamento", width: 26 },
  { header: "Status", width: 18 },
];

refColumns.forEach((col, i) => {
  const cell = wsRef.getCell(1, i + 1);
  cell.value = col.header;
  cell.font = { name: "Arial", bold: true, size: 9, color: { argb: WHITE } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  cell.alignment = { vertical: "middle", horizontal: "center" };
  wsRef.getColumn(i + 1).width = col.width;
});

const campaigns = [
  "1ª Campanha - Verão 2026",
  "2ª Campanha - Outono 2026",
  "3ª Campanha - Inverno 2026",
  "4ª Campanha - Primavera 2026",
  "5ª Campanha - Verão 2027",
  "6ª Campanha - Outono 2027",
  "7ª Campanha - Inverno 2027",
  "8ª Campanha - Primavera 2027",
  "9ª Campanha - Verão 2028",
  "Ação pontual",
  "Deslocamento técnico",
];

const followUpValues = ["Não", "Sim", "Avaliar posteriormente"];
const statusValues = ["Rascunho", "Enviado", "Revisado"];

const maxLen = Math.max(
  campaigns.length,
  activityOptions.length,
  waterVisualConditionOptions.length,
  occurrenceTypeOptions.length,
  followUpValues.length,
  statusValues.length
);

for (let r = 0; r < maxLen; r++) {
  const row = wsRef.getRow(r + 2);
  row.getCell(1).value = campaigns[r] ?? "";
  row.getCell(2).value = activityOptions[r] ?? "";
  row.getCell(3).value = waterVisualConditionOptions[r] ?? "";
  row.getCell(4).value = occurrenceTypeOptions[r] ?? "";
  row.getCell(5).value = followUpValues[r] ?? "";
  row.getCell(6).value = statusValues[r] ?? "";
  row.height = 18;
  row.eachCell({ includeEmpty: false }, (cell) => {
    cell.font = { name: "Arial", size: 9 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: r % 2 === 0 ? WHITE : LIGHT_BLUE },
    };
    cell.alignment = { vertical: "middle" };
  });
}

// ─── Sheet 3: Instruções ──────────────────────────────────────────────────
const wsInstr = wb.addWorksheet("Instruções");
wsInstr.getColumn(1).width = 90;

const instructions = [
  ["INSTRUÇÕES DE PREENCHIMENTO - Diário de Campo (Yva'e Monitoramento)", true],
  [""],
  ["CAMPOS OBRIGATÓRIOS (marcados com * no cabeçalho da aba Registros)"],
  ["  • Campanha — use exatamente os nomes da aba Valores válidos, coluna A"],
  ["  • Dia da campanha — número inteiro ≥ 1"],
  ["  • Data — formato AAAA-MM-DD (ex: 2026-05-20)"],
  ["  • Responsável — nome completo do técnico de campo"],
  ["  • Local / Reservatório — nome do ponto de coleta"],
  ["  • Município — nome do município"],
  ["  • Atividades realizadas — veja aba Valores válidos, coluna B; separe múltiplos valores com ponto e vírgula (;)"],
  ["  • Condições visuais da água — veja aba Valores válidos, coluna C; separe múltiplos valores com (;)"],
  ["  • Resumo do dia — texto livre, máximo 700 caracteres"],
  [""],
  ["CAMPOS OPCIONAIS"],
  ["  • SIA — código ou referência interna"],
  ["  • Latitude / Longitude — coordenadas decimais (ex: -25.4284 / -49.2733)"],
  ["  • Houve ocorrência? — Sim ou Não (padrão: Não)"],
  ["  • Tipo de ocorrência — obrigatório apenas se 'Houve ocorrência?' = Sim; use aba Valores válidos, coluna D"],
  ["  • Descrição da ocorrência — texto livre"],
  ["  • Exige acompanhamento? — use aba Valores válidos, coluna E (padrão: Não)"],
  ["  • Pendência / Encaminhamento — texto livre"],
  ["  • Status — use aba Valores válidos, coluna F (padrão: Rascunho)"],
  [""],
  ["DICAS"],
  ["  • A linha 2 da aba Registros é um exemplo — pode ser apagada antes de importar"],
  ["  • Não altere os nomes das colunas na linha 1"],
  ["  • Linhas completamente vazias são ignoradas na importação"],
  ["  • O separador para múltiplos valores em Atividades e Condições é ponto e vírgula (;)"],
  ["  • Registros duplicados (mesmo Local + Data + Campanha + Responsável) podem ser re-importados"],
];

instructions.forEach(([text, bold], i) => {
  const cell = wsInstr.getCell(i + 1, 1);
  cell.value = text ?? "";
  cell.font = { name: "Arial", size: 9, bold: Boolean(bold) };
  cell.alignment = { wrapText: true };
  if (i === 0) {
    cell.font = { name: "Arial", size: 11, bold: true, color: { argb: NAVY } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BLUE } };
  }
  if (text && String(text).match(/^[A-ZÁÉÍÓÚÃÕÇ]{3,}/)) {
    cell.font = { name: "Arial", size: 9, bold: true, color: { argb: NAVY } };
  }
  wsInstr.getRow(i + 1).height = 18;
});

// ─── Write output ──────────────────────────────────────────────────────────
const outPath = join(__dirname, "..", "public", "template-diario-de-campo.xlsx");
const buffer = await wb.xlsx.writeBuffer();
writeFileSync(outPath, buffer);
console.log(`Template gerado: ${outPath}`);
