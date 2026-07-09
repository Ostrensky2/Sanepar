const ExcelJS = require('exceljs');
const path = require('path');

async function main() {
  const filePath = "C:\\Users\\AntonioOstrenskyNeto\\Downloads\\template-planilha-de-campo_agosto_preenchida (1).xlsx";
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.getWorksheet("Campanhas");

  if (!worksheet) {
    console.error("Aba 'Campanhas' não encontrada!");
    return;
  }

  console.log("Aba 'Campanhas' carregada com sucesso.");
  console.log("Número de linhas:", worksheet.rowCount);

  // Headers
  const row1 = worksheet.getRow(1).values;
  console.log("Cabeçalhos:", JSON.stringify(row1));

  // Find column for 'Campanha'
  let campaignColIndex = -1;
  if (Array.isArray(row1)) {
    for (let i = 1; i < row1.length; i++) {
      const val = row1[i];
      if (val && String(val).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes("campanha")) {
        campaignColIndex = i;
        break;
      }
    }
  }
  console.log("Índice da coluna Campanha:", campaignColIndex);

  if (campaignColIndex === -1) {
    console.log("Coluna 'Campanha' não encontrada.");
    return;
  }

  const campaigns = new Set();
  const rowsWithCampaigns = [];

  for (let r = 2; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r);
    const cellVal = row.getCell(campaignColIndex).value;
    if (cellVal) {
      campaigns.add(String(cellVal).trim());
      rowsWithCampaigns.push({ row: r, value: cellVal });
    }
  }

  console.log("Campanhas únicas encontradas na planilha:", Array.from(campaigns));
  console.log("Amostra das primeiras 10 linhas preenchidas na coluna de Campanha:");
  console.log(rowsWithCampaigns.slice(0, 10));
}

main().catch(console.error);
