/**
 * Versões de catálogo e de método são controle interno de importação/publicação.
 * Nunca aparecem em tela nem em exportação (PDF, impressão ou XLSX de relatório).
 */
const VERSION_FIELD = /^(?:catalogVersion|calculationVersion|methodVersion)$|^(?:[^:]+:\s*)?vers[aã]o\s+(?:d[oa]s?\s+)?(?:cat[aá]logo|m[eé]todo|c[aá]lculo|metodologia)/i;
const VERSION_CODE = /SANEPAR-(?:INDICE|RISCOS)-\d+(?:\.\d+)*/i;

export const isHiddenVersionField = (name: string) => VERSION_FIELD.test(name.trim());
export const mentionsInternalVersion = (value: unknown) => typeof value === "string" && VERSION_CODE.test(value);
/** Remove campos de versão de um registro exibido, sem alterar o objeto original. */
export function withoutVersionFields<T>(row: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(row).filter(([key, value]) => !isHiddenVersionField(key) && !mentionsInternalVersion(value)));
}
