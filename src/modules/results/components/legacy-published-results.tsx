import type { ResultsPublication } from "@/lib/imports/results-contract";

const labels: Record<string, string> = { meta: "Indicadores publicados", points: "Pontos e resultados", ptaxa: "Táxons por ponto", municipios: "Municípios", alerts: "Alertas", top_ciano: "Cianobactérias — maiores registros", top_bact: "Bactérias — maiores registros", top_coi: "COI — maiores registros", freq_ciano: "Frequência de cianobactérias", freq_bact: "Frequência de bactérias", freq_coi: "Frequência de COI", tox: "Associações com toxinas", odor: "Associações com odor", invasores: "Invasores", heat_ciano: "Matriz de cianobactérias", heat_bact: "Matriz de bactérias", heat_coi: "Matriz de COI", coi_all: "Táxons COI", coi_groups: "Grupos COI", score: "Score publicado", classe: "Classe publicada", ponto: "Ponto", municipio: "Município", sia: "SIA" };

/** Read-only rendering of the original DTO: no V2 conversion, recalculation or local asset. */
export function LegacyPublishedResults({ publication }: { publication: ResultsPublication }) {
  return <section className="min-w-0 space-y-3" aria-label={`Resultados legados de ${publication.campaignTitle}`}>
    <h2 className="type-section-title">{publication.campaignTitle} — resultados publicados</h2>
    <p role="status" className="type-metadata">Publicação legada preservada. O arquivo-fonte e os catálogos necessários às novas análises não estão disponíveis neste ambiente. Os valores abaixo são os originais publicados; nenhum índice ou classe foi recalculado.</p>
    <p className="type-metadata">Reads não comprovam abundância, viabilidade, toxina ou dano local. Score e classe pertencem ao método da publicação legada, não ao novo índice.</p>
    {Object.entries(publication.viewModel).map(([key, value]) => <details key={key} open={key === "meta" || key === "points"} className="min-w-0 border-t border-[var(--line-ghost)] py-2">
      <summary className="type-label min-h-11 cursor-pointer content-center">{labels[key] ?? key}{Array.isArray(value) ? ` (${value.length})` : ""}</summary>
      <LegacyValue value={value} />
    </details>)}
    <details><summary className="type-label min-h-11 cursor-pointer content-center">Metodologia e proveniência da publicação legada</summary><LegacyValue value={{ arquivo: publication.fileName, importadoEm: publication.importedAt, metodologia: publication.methodology }} /></details>
  </section>;
}

function LegacyValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span>Não informado na publicação</span>;
  if (Array.isArray(value)) {
    if (!value.length) return <p className="type-metadata">Nenhum registro nesta seção publicada.</p>;
    if (value.every((row) => row && typeof row === "object" && !Array.isArray(row))) {
      const rows = value as Record<string, unknown>[];
      const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      return <div className="max-w-full overflow-x-auto" role="region" aria-label="Tabela legada com rolagem horizontal" tabIndex={0}><table className="w-full text-left text-sm"><thead><tr>{columns.map((key) => <th key={key} scope="col" className="px-3 py-2">{labels[key] ?? key}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-t border-[var(--line-ghost)]">{columns.map((key) => <td key={key} className="min-w-24 max-w-xs break-words px-3 py-2 align-top"><LegacyValue value={row[key]} /></td>)}</tr>)}</tbody></table></div>;
    }
    return <ul className="space-y-1">{value.map((item, index) => <li key={index}><LegacyValue value={item} /></li>)}</ul>;
  }
  if (typeof value === "object") return <dl className="grid min-w-0 gap-2 sm:grid-cols-2">{Object.entries(value).map(([key, item]) => <div key={key} className="min-w-0"><dt className="type-label">{labels[key] ?? key}</dt><dd className="type-metadata break-words"><LegacyValue value={item} /></dd></div>)}</dl>;
  return <span className="whitespace-pre-wrap">{typeof value === "boolean" ? (value ? "Sim" : "Não") : String(value)}</span>;
}
