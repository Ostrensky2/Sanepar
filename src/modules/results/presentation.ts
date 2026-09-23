// Identificadores de versão do método/catálogo (ex.: SANEPAR-INDICE-0.3) permanecem na fonte e no
// banco para rastreabilidade, mas não são exibidos ao usuário: a publicação e o arquivo já a garantem.

export function sameSourceHash(left: unknown, right: unknown): boolean {
  return typeof left === "string" && typeof right === "string" && /^[a-f\d]{64}$/i.test(left) && /^[a-f\d]{64}$/i.test(right) && left.toLowerCase() === right.toLowerCase();
}

export function hasAvailableResultsSource(source: { source: { sha256: string | null }; sourceAvailability?: string } | undefined) {
  return !!source && source.sourceAvailability !== "missing_source_artifact" && typeof source.source.sha256 === "string" && /^[a-f\d]{64}$/i.test(source.source.sha256);
}

export function samePublishedSource(actual: { publicationId?: string | null; sha256?: string | null } | undefined, expected: { publicationId?: string | null; sha256?: string | null } | undefined) {
  return !!actual?.publicationId && actual.publicationId === expected?.publicationId && sameSourceHash(actual.sha256, expected?.sha256);
}

const ANALYTICAL_STATUS_LABELS: Record<string, string> = {
  approved: "Aprovado",
  available_unassessed: "Disponível; qualidade não informada",
  inconclusive: "Inconclusivo",
  confirmed_failure: "Falha confirmada",
  not_performed: "Não realizado",
  missing_records: "Sem registros",
  unknown: "Situação não informada",
};

/** Texto legível da situação analítica: nunca expõe o código interno (ex.: missing_records). */
export function analyticalStatusText(component: { sourceStatus?: string | null; status: string }) {
  return component.sourceStatus?.trim() || ANALYTICAL_STATUS_LABELS[component.status] || "Situação não informada";
}
