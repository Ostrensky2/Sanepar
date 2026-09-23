export const MOLECULAR_SHEET = "Metadados";
export const LEGACY_MOLECULAR_SHEET = "Metadata-C2";
export const RESULTS_SHEETS = [MOLECULAR_SHEET, "Riscos_bibliografia", "Evidencias_risco", "Criterios_scores", "Indices_pontos", "Calculo_conjuntos", "Metodo_calculo"] as const;
export function molecularSheetName(names: readonly string[]): string {
  const matches = names.filter(name => name === MOLECULAR_SHEET || name === LEGACY_MOLECULAR_SHEET);
  if (matches.length !== 1) throw new Error(matches.length ? "Abas moleculares ambíguas: envie somente Metadados ou Metadata-C2 (legado)." : "Aba obrigatória ausente: Metadados.");
  return matches[0];
}
export function canonicalSheetName(name: string) { return name === LEGACY_MOLECULAR_SHEET ? MOLECULAR_SHEET : name; }
