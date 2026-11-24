import ExcelJS from "exceljs";

/** Abas da planilha unificada da campanha que trazem as matrizes por SIA do laboratório. */
export const UNIFIED_SHEETS = {
  "16S generos": { marker: "16S", level: "genero" }, "16S familias": { marker: "16S", level: "familia" }, "Associações 16S": { marker: "16S", level: "risco" },
  "COI generos": { marker: "COI", level: "genero" }, "COI familias": { marker: "COI", level: "familia" }, "Exóticas COI": { marker: "COI", level: "exoticas" },
} as const;
export type UnifiedSheetName = keyof typeof UNIFIED_SHEETS;
/** Uma linha por biblioteca (SIA + corrida). `present` é falso quando a matriz registra a biblioteca como ausente. */
export type UnifiedRow = { sia: string; run: string; present: boolean; values: number[] };
export type UnifiedSheet = { headers: string[]; rows: UnifiedRow[] };
export type UnifiedMatrices = Record<UnifiedSheetName, UnifiedSheet>;

const text = (value: unknown) => typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
/** "SIA-0011", "SIA 11" e "11" são o mesmo ponto. */
export const siaKey = (value: unknown) => text(value).replace(/^SIA[-\s]*/i, "").replace(/^0+(?=\d)/, "");

/** Lê as seis abas de matrizes da planilha unificada. Recusa aba ausente, cabeçalho inesperado, SIA repetido na mesma
 * corrida ou contagem que não seja inteiro não negativo: planilha fora do formato nunca vira resultado parcial. */
export async function parseUnifiedWorkbook(bytes: Uint8Array): Promise<UnifiedMatrices> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(bytes).buffer);
  const found = {} as UnifiedMatrices;
  for (const name of Object.keys(UNIFIED_SHEETS) as UnifiedSheetName[]) {
    const sheet = workbook.getWorksheet(name);
    if (!sheet) throw new Error(`Planilha unificada: aba ${name} ausente.`);
    const labels = (sheet.getRow(1).values as unknown[]).slice(1).map(text);
    if (labels[0] !== "SIA" || !/^Plataforma/.test(labels[1] ?? "")) throw new Error(`Planilha unificada: cabeçalho inesperado em ${name}.`);
    const first = labels[2] === "Biblioteca" ? 3 : 2;         // matrizes trazem a situação da biblioteca; associações e exóticas, não
    const headers = labels.slice(first);
    if (!headers.length || headers.some(label => !label) || new Set(headers).size !== headers.length) throw new Error(`Planilha unificada: colunas inválidas em ${name}.`);
    const rows: UnifiedRow[] = [], seen = new Set<string>();
    for (let index = 2; index <= sheet.rowCount; index++) {
      const cells = sheet.getRow(index).values as unknown[];
      const sia = siaKey(cells[1]), run = text(cells[2]);
      if (!sia) continue;
      if (seen.has(`${sia}|${run}`)) throw new Error(`Planilha unificada: SIA ${sia} repetido em ${name}.`);
      seen.add(`${sia}|${run}`);
      const values = headers.map((_, column) => {
        const value = cells[1 + first + column] ?? 0;
        if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`Planilha unificada: contagem inválida em ${name}, SIA ${sia}.`);
        return value;
      });
      rows.push({ sia, run, present: first === 2 || text(cells[3]) !== "BIBLIOTECA_AUSENTE", values });
    }
    found[name] = { headers, rows };
  }
  return found;
}
