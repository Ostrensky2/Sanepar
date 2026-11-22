import { resolveCanonicalCampaign } from "./campaign-identity";
import type { FieldDiaryEntry } from "./field-diary";
import { matrixExecutionStatus, normalizeMatrixSia } from "./imports/sia-matrices";

/** Recebe somente as entradas já conciliadas com a campanha selecionada. */
export function collectedPhysicalPoints(entries: FieldDiaryEntry[], campaignId: string, fieldCodes: readonly string[], campaignCodes: readonly string[] = fieldCodes) {
  const points = new Set<string>();
  const exact = new Set(fieldCodes.map(normalizeMatrixSia).filter(Boolean));
  const ambiguous = new Set(campaignCodes.filter(code => !normalizeMatrixSia(code)).map(code =>
    normalizeMatrixSia(String(code).match(/\d+/g)?.join(""))).filter(Boolean));
  let pending = 0;
  for (const entry of entries) {
    const id = resolveCanonicalCampaign(entry.campaignId);
    const name = resolveCanonicalCampaign(entry.campaignName);
    if ((id ?? name)?.id !== campaignId || (name && name.id !== campaignId)) continue;
    const status = matrixExecutionStatus(entry);
    if (status !== "realized" && status !== "relocated") continue;
    const sia = normalizeMatrixSia(entry.sia);
    if (sia && exact.has(sia) && !ambiguous.has(sia)) points.add(sia);
    else pending++;

  }
  return { identified: points.size, pending };
}

export function molecularAvailability(count: number | null, version: string) {
  if (count === null) return "Resultado molecular: consulta indisponível";
  return count > 0
    ? `Resultado molecular disponível: ${count} ${count === 1 ? "ponto" : "pontos"} (índice ${version})`
    : `Sem análise molecular registrada no índice ${version}`;
}
