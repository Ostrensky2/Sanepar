import ExcelJS from 'exceljs';
import path from 'path';

const files = [
  'template-acoes-pontuais.xlsx',
  'template-diario-de-campo.xlsx',
  'template-planilha-de-campo.xlsx'
];

async function inspect(fileName) {
  const filePath = path.join('public', fileName);
  console.log(`\n========================================`);
  console.log(`Inspecting file: ${fileName}`);
  console.log(`========================================`);
  
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
    console.log(`Sheets in workbook:`, workbook.worksheets.map(w => w.name));
    for (const sheet of workbook.worksheets) {
      console.log(`\nSheet Name: ${sheet.name}`);
      console.log(`Row count: ${sheet.rowCount}, Column count: ${sheet.columnCount}`);
      // Print first 2 rows
      const rows = [];
      sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        if (rowNumber <= 3) {
          const vals = Array.isArray(row.values) ? row.values.slice(1) : Object.values(row.values);
          rows.push({ rowNumber, values: vals });
        }
      });
      console.log(`First few rows:`, JSON.stringify(rows, null, 2));
    }
  } catch (err) {
    console.error(`Error reading ${fileName}:`, err.message);
  }
}

async function run() {
  for (const file of files) {
    await inspect(file);
  }
}

run();
