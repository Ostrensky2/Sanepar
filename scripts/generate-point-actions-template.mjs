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

// ─── Sheet 1: Pontos ───────────────────────────────────────────────────────
const ws = wb.addWorksheet("Pontos");

const columns = [
  { header: "Evento *", key: "eventName", width: 34 },
  { header: "Objetivos *", key: "objectives", width: 50 },
  { header: "Manancial *", key: "waterBody", width: 30 },
  { header: "Datas *", key: "dates", width: 22 },
  { header: "Município *", key: "municipality", width: 22 },
  { header: "Latitude *", key: "latitude", width: 14 },
  { header: "Longitude *", key: "longitude", width: 14 },
  { header: "Resultados *", key: "results", width: 50 },
  { header: "Foto 1 - URL Dropbox", key: "photo1Url", width: 36 },
  { header: "Foto 1 - Legenda", key: "photo1Caption", width: 32 },
  { header: "Foto 2 - URL Dropbox", key: "photo2Url", width: 36 },
  { header: "Foto 2 - Legenda", key: "photo2Caption", width: 32 },
  { header: "Foto 3 - URL Dropbox", key: "photo3Url", width: 36 },
  { header: "Foto 3 - Legenda", key: "photo3Caption", width: 32 },
];

ws.columns = columns;

const headerRow = ws.getRow(1);
headerRow.height = 38;
headerRow.eachCell((cell) => {
  cell.font = { name: "Arial", bold: true, size: 9, color: { argb: WHITE } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = { bottom: { style: "thin", color: { argb: "FF002D44" } } };
});

const exampleRows = [
  {
    eventName: "Monitoramento emergencial - Floração de cianobactérias",
    objectives: "Avaliar extensão da floração detectada pela equipe de operação no manancial Rio Verde.",
    waterBody: "Reservatório Rio Verde",
    dates: "12/03/2026 a 14/03/2026",
    municipality: "Campo Largo",
    latitude: "-25.4284",
    longitude: "-49.6733",
    results: "Clorofila-a 38,2 µg/L; presença de Microcystis aeruginosa.",
    photo1Url: "https://dropbox.com/s/exemplo1",
    photo1Caption: "Vista geral da floração na margem leste",
    photo2Url: "https://dropbox.com/s/exemplo2",
    photo2Caption: "Coleta superficial - ponto P1",
    photo3Url: "",
    photo3Caption: "",
  },
  {
    eventName: "Monitoramento emergencial - Floração de cianobactérias",
    objectives: "Avaliar extensão da floração detectada pela equipe de operação no manancial Rio Verde.",
    waterBody: "Reservatório Rio Verde",
    dates: "12/03/2026 a 14/03/2026",
    municipality: "Campo Largo",
    latitude: "-25.4310",
    longitude: "-49.6755",
    results: "Clorofila-a 12,4 µg/L; ausência de organismos visíveis.",
    photo1Url: "https://dropbox.com/s/exemplo3",
    photo1Caption: "Ponto P2 - margem oeste",
    photo2Url: "",
    photo2Caption: "",
    photo3Url: "",
    photo3Caption: "",
  },
];

exampleRows.forEach((row) => ws.addRow(row));

for (let r = 2; r <= 3; r++) {
  const row = ws.getRow(r);
  row.height = 22;
  row.eachCell((cell) => {
    cell.font = { name: "Arial", italic: true, size: 9, color: { argb: EXAMPLE_FG } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXAMPLE_BG } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
}

for (let r = 4; r <= 503; r++) {
  const row = ws.getRow(r);
  row.height = 20;
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { name: "Arial", size: 9 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: r % 2 === 0 ? LIGHT_BLUE : WHITE },
    };
    cell.alignment = { vertical: "middle" };
  });
}

ws.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];

// ─── Sheet 2: Instruções ──────────────────────────────────────────────────
const wsInstr = wb.addWorksheet("Instruções");
wsInstr.getColumn(1).width = 110;

const instructions = [
  ["INSTRUÇÕES DE PREENCHIMENTO - Ações Pontuais (Yva'e Monitoramento)", true],
  [""],
  ["ESTRUTURA"],
  ["  • Cada linha representa UM ponto de coleta dentro de um evento."],
  ["  • Para registrar um evento com vários pontos, repita o nome do evento (e objetivos) em cada linha do mesmo evento."],
  ["  • Linhas com o mesmo 'Evento' são agrupadas em um único registro no app."],
  [""],
  ["CAMPOS OBRIGATÓRIOS (marcados com * no cabeçalho)"],
  ["  • Evento — nome do evento/ação (ex: 'Monitoramento emergencial - Floração de cianobactérias')"],
  ["  • Objetivos — descrição do propósito do evento (texto livre)"],
  ["  • Manancial — nome do manancial/corpo hídrico amostrado"],
  ["  • Datas — período ou data única (ex: '12/03/2026' ou '12/03/2026 a 14/03/2026')"],
  ["  • Município — nome do município"],
  ["  • Latitude — coordenada decimal entre -90 e 90 (ex: -25.4284)"],
  ["  • Longitude — coordenada decimal entre -180 e 180 (ex: -49.6733)"],
  ["  • Resultados — texto livre com os resultados ou observações da coleta"],
  [""],
  ["FOTOS (opcionais)"],
  ["  • É possível anexar até 3 fotos por ponto."],
  ["  • Para cada foto, preencha URL (link Dropbox público) e Legenda."],
  ["  • Para mais de 3 fotos por ponto, adicione fotos extras pelo formulário do app após a importação."],
  [""],
  ["DICAS"],
  ["  • As linhas 2 e 3 são exemplos — podem ser apagadas antes de importar."],
  ["  • Não altere os nomes das colunas na linha 1."],
  ["  • Linhas completamente vazias são ignoradas na importação."],
  ["  • A importação CRIA novos eventos. Para editar eventos existentes, use a tela do app."],
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
  if (text && String(text).match(/^[A-ZÁÉÍÓÚÃÕÇ ]{4,}/)) {
    cell.font = { name: "Arial", size: 9, bold: true, color: { argb: NAVY } };
  }
  wsInstr.getRow(i + 1).height = 18;
});

const outPath = join(__dirname, "..", "public", "template-acoes-pontuais.xlsx");
const buffer = await wb.xlsx.writeBuffer();
writeFileSync(outPath, buffer);
console.log(`Template gerado: ${outPath}`);
