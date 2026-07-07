import ExcelJS from "exceljs";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const wb = new ExcelJS.Workbook();
wb.creator = "Yva'e Monitoramento";
wb.created = new Date();

const NAVY = "FF004262";
const WHITE = "FFFFFFFF";
const LIGHT_BLUE = "FFE8F4FB";
const EXAMPLE_BG = "FFF8FAFC";
const EXAMPLE_FG = "FF64748B";
const REQUIRED_BG = "FFFFE4E1";

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
];

const accessibilityOptions = ["Fácil", "Moderado", "Difícil", "Inacessível"];
const waterAspectOptions = [
  "Incolor / transparente",
  "Levemente amarelada",
  "Amarelada",
  "Amarronzada / Turva",
  "Esverdeada",
  "Acinzentada",
  "Não informado",
];
const weatherOptions = [
  "Sol",
  "Sol entre nuvens",
  "Nublado",
  "Nublado Pós Chuva",
  "Chuvoso",
  "Garoando",
  "Nublado / Neblina",
  "Não informado",
];
const statusOptions = ["Rascunho", "Enviado", "Revisado"];
const yesNoOptions = ["Não", "Sim"];
const followUpOptions = ["Não", "Sim", "Avaliar posteriormente"];

// Sheet 1: import data. The import endpoint requires this exact worksheet name.
const ws = wb.addWorksheet("Campanhas");

const columns = [
  { header: "Campanha", key: "campaign", width: 28 },
  { header: "Cód. SIA", key: "code", width: 14 },
  { header: "Ponto", key: "point", width: 16 },
  { header: "Dia", key: "day", width: 10 },
  { header: "Data", key: "date", width: 14 },
  { header: "Manancial / Corpo Hídrico", key: "waterBody", width: 38 },
  { header: "Município", key: "municipality", width: 24 },
  { header: "Latitude  Original", key: "originalLat", width: 16 },
  { header: "Longitude Original", key: "originalLon", width: 17 },
  { header: " Latitude efetiva", key: "effectiveLat", width: 16 },
  { header: "Longitude Efetiva", key: "effectiveLon", width: 17 },
  { header: "Acessibilidade do Ponto", key: "accessibility", width: 24 },
  { header: "Aspecto da água", key: "waterAspect", width: 26 },
  { header: "Condições Climaticas", key: "weatherConditions", width: 26 },
  { header: "Problemas Enfrentados", key: "problems", width: 34 },
  { header: "Amostras e Réplicas", key: "samples", width: 36 },
  { header: "ID Zooplacton", key: "zooplacktonId", width: 18 },
  { header: "Hora de coleta", key: "collectionTime", width: 16 },
  { header: "Responsável", key: "createdByName", width: 24 },
  { header: "Atividades realizadas (;)", key: "activities", width: 34 },
  { header: "Houve ocorrência?", key: "hasOccurrence", width: 18 },
  { header: "Tipo de ocorrência", key: "occurrenceType", width: 28 },
  { header: "Descrição da ocorrência", key: "occurrenceDescription", width: 38 },
  { header: "Exige acompanhamento?", key: "requiresFollowUp", width: 24 },
  { header: "Pendência / Encaminhamento", key: "followUpNotes", width: 34 },
  { header: "Resumo do dia", key: "dailySummary", width: 42 },
  { header: "Status", key: "status", width: 18 },
  { header: "Drive", key: "driveUrl", width: 36 },
  { header: "Dropbox", key: "dropboxUrl", width: 36 },
];

ws.columns = columns;

const headerRow = ws.getRow(1);
headerRow.height = 38;
headerRow.eachCell((cell) => {
  const isRequired = String(cell.value ?? "").includes("*");
  cell.font = { name: "Arial", bold: true, size: 9, color: { argb: WHITE } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = { bottom: { style: "thin", color: { argb: "FF002D44" } } };
  if (isRequired) {
    cell.note = "Campo obrigatório para alimentar os dados de campo.";
  }
});

const exampleRows = [
  {
    campaign: "1",
    code: "770",
    point: "2",
    day: "1",
    date: "09/02/2026",
    waterBody: "120 - Captação ETA Iguaçu (Canal Água Limpa)",
    municipality: "Curitiba",
    originalLat: "-25.4833",
    originalLon: "-49.1897",
    effectiveLat: "-25.481933",
    effectiveLon: "-49.192517",
    accessibility: "Fácil",
    waterAspect: "Amarronzada / Turva",
    weatherConditions: "Nublado Pós Chuva",
    problems: "",
    samples: "C1770R1 / C1770R2 / C1770R3 / C1770R4 / C1770R5 / C1770B",
    zooplacktonId: "7244271",
    collectionTime: "08:30",
    createdByName: "Equipe de campo",
    activities: "Coleta realizada; Vistoria visual",
    hasOccurrence: "Não",
    occurrenceType: "",
    occurrenceDescription: "",
    requiresFollowUp: "Não",
    followUpNotes: "",
    dailySummary: "Coleta concluída sem ocorrência.",
    status: "Enviado",
    driveUrl: "https://drive.google.com/file/d/1ExemploArquivoFoto/view?usp=sharing",
    dropboxUrl: "",
  },
  {
    campaign: "1",
    code: "771",
    point: "3",
    day: "1",
    date: "09/02/2026",
    waterBody: "117 - Rio Pequeno",
    municipality: "São José dos Pinhais",
    originalLat: "-25.4853",
    originalLon: "-49.1762",
    effectiveLat: "-25.4852",
    effectiveLon: "-49.176417",
    accessibility: "Moderado",
    waterAspect: "Amarronzada / Turva",
    weatherConditions: "Sol - Pos chuva",
    problems: "",
    samples: "C1771R1 / C1771R2 / C1771R3 / C1771R4 / C1771R5 / C1771B",
    zooplacktonId: "1312811",
    collectionTime: "10:15",
    createdByName: "Equipe de campo",
    activities: "Coleta realizada; Medição em campo",
    hasOccurrence: "Sim",
    occurrenceType: "Condição climática adversa",
    occurrenceDescription: "Chuva recente alterou a turbidez visual.",
    requiresFollowUp: "Avaliar posteriormente",
    followUpNotes: "Reavaliar acesso no próximo ciclo.",
    dailySummary: "Coleta concluída com observação de condição climática.",
    status: "Rascunho",
    driveUrl: "",
    dropboxUrl: "https://dropbox.com/s/exemplo",
  },
];

exampleRows.forEach((row) => ws.addRow(row));

for (let r = 2; r <= 3; r++) {
  const row = ws.getRow(r);
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { name: "Arial", italic: true, size: 9, color: { argb: EXAMPLE_FG } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXAMPLE_BG } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
}

for (let r = 4; r <= 503; r++) {
  const row = ws.getRow(r);
  row.height = 20;
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const header = String(ws.getRow(1).getCell(colNumber).value ?? "");
    const isRequired = header.includes("*");
    cell.font = { name: "Arial", size: 9 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: isRequired ? REQUIRED_BG : r % 2 === 0 ? LIGHT_BLUE : WHITE },
    };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
}

ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];
ws.autoFilter = "A1:AC1";

const dateColumn = ws.getColumn("E");
dateColumn.numFmt = "dd/mm/yyyy";
["H", "I", "J", "K"].forEach((column) => {
  ws.getColumn(column).numFmt = "0.000000";
});

// Sheet 2: reference values.
const wsRef = wb.addWorksheet("Valores válidos");
const refColumns = [
  { header: "Campanhas", values: campaigns, width: 32 },
  { header: "Acessibilidade", values: accessibilityOptions, width: 24 },
  { header: "Aspecto da água", values: waterAspectOptions, width: 30 },
  { header: "Condições climáticas", values: weatherOptions, width: 28 },
  { header: "Status", values: statusOptions, width: 18 },
  { header: "Sim/Não", values: yesNoOptions, width: 14 },
  { header: "Acompanhamento", values: followUpOptions, width: 26 },
];

refColumns.forEach((col, index) => {
  const columnNumber = index + 1;
  const cell = wsRef.getCell(1, columnNumber);
  cell.value = col.header;
  cell.font = { name: "Arial", bold: true, size: 9, color: { argb: WHITE } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  cell.alignment = { vertical: "middle", horizontal: "center" };
  wsRef.getColumn(columnNumber).width = col.width;
});

const maxRefRows = Math.max(...refColumns.map((col) => col.values.length));
for (let r = 0; r < maxRefRows; r++) {
  const row = wsRef.getRow(r + 2);
  refColumns.forEach((col, index) => {
    row.getCell(index + 1).value = col.values[r] ?? "";
  });
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

const validations = [
  ["A", "$A$2:$A$10"],
  ["L", "$B$2:$B$5"],
  ["M", "$C$2:$C$8"],
  ["N", "$D$2:$D$9"],
  ["U", "$F$2:$F$3"],
  ["X", "$G$2:$G$4"],
  ["AA", "$E$2:$E$4"],
];

for (const [column, formula] of validations) {
  for (let rowNumber = 2; rowNumber <= 503; rowNumber += 1) {
    ws.getCell(`${column}${rowNumber}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`'Valores válidos'!${formula}`],
      showErrorMessage: true,
      errorStyle: "warning",
      errorTitle: "Valor fora da lista",
      error: "Escolha um valor da lista ou deixe em branco.",
    };
  }
}

// Sheet 3: instructions.
const wsInstr = wb.addWorksheet("Instruções");
wsInstr.getColumn(1).width = 112;

const instructions = [
  ["INSTRUÇÕES DE PREENCHIMENTO - Planilha de Campo (Yva'e Monitoramento)", true],
  [""],
  ["ESTRUTURA"],
  ["  • A importação usa obrigatoriamente a aba Campanhas."],
  ["  • Cada linha representa um ponto de campo da campanha."],
  ["  • As linhas 2 e 3 são exemplos e podem ser apagadas antes do carregamento."],
  [""],
  ["CAMPOS OBRIGATÓRIOS"],
  ["  • Campanha — número ou nome da campanha."],
  ["  • Cód. SIA — código do ponto sem o prefixo SIA, quando possível."],
  ["  • Manancial / Corpo Hídrico — nome do rio, reservatório, captação ou ponto monitorado."],
  ["  • Município — município do ponto."],
  ["  • Latitude efetiva e Longitude Efetiva — coordenadas decimais dentro do Paraná."],
  [""],
  ["COORDENADAS"],
  ["  • Use coordenadas decimais, preferencialmente negativas. Exemplo: -25.481933 / -49.192517."],
  ["  • Caso haja latitude/longitude original e efetiva, o mapa usará a coordenada efetiva."],
  ["  • Se houver apenas coordenada original válida, ela será usada como referência."],
  [""],
  ["DICAS"],
  ["  • Não altere o nome da aba Campanhas."],
  ["  • Não altere os nomes das colunas da linha 1."],
  ["  • Linhas sem Cód. SIA ou sem coordenada válida são ignoradas."],
  ["  • Links de Drive ou Dropbox alimentam as evidências visuais no painel."],
  ["  • Use links de arquivo do Google Drive; links de pasta não são suportados nesta fase."],
  ["  • Para várias fotos do mesmo ponto, separe os links por ponto-e-vírgula (;)."],
  ["  • Amostras e Réplicas e ID Zooplacton podem ser preenchidos manualmente ou via fórmula."],
];

instructions.forEach(([text, bold], index) => {
  const cell = wsInstr.getCell(index + 1, 1);
  cell.value = text ?? "";
  cell.font = { name: "Arial", size: 9, bold: Boolean(bold) };
  cell.alignment = { wrapText: true };
  if (index === 0) {
    cell.font = { name: "Arial", size: 11, bold: true, color: { argb: NAVY } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT_BLUE } };
  }
  if (text && String(text).match(/^[A-ZÁÉÍÓÚÃÕÇ ]{4,}/)) {
    cell.font = { name: "Arial", size: 9, bold: true, color: { argb: NAVY } };
  }
  wsInstr.getRow(index + 1).height = 18;
});

const outPath = join(__dirname, "..", "public", "template-planilha-de-campo.xlsx");
const buffer = await wb.xlsx.writeBuffer();
writeFileSync(outPath, buffer);
console.log(`Template gerado: ${outPath}`);
