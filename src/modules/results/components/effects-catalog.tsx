import Link from "next/link";
import { captureDomainLabels, captureDomains, captureFichas, type CaptureFicha } from "@/lib/capture-index";
import { effects } from "@/lib/capture-index/effect-catalog";

const levelLabels: Record<string, string> = { genus: "gênero", family: "família", clade: "grupo", species: "espécie exótica" };
const effectOf = new Map<string, { id: string; title: string }>(effects.flatMap(effect => effect.cards.map(card => [card, { id: effect.id, title: effect.title }] as [string, { id: string; title: string }])));

function applicability(ficha: CaptureFicha) {
  if (ficha.contested) return "medição contestada, não pontua";
  const value = ficha.applicability;
  return value === null ? "indeterminada, não pontua" : value === 1 ? "todo o táxon (1)" : value === 0.5 ? "parte substancial (0,5)" : value === 0.1 ? "minoria (0,1)" : "sem efeito sustentado (0)";
}

/** Catálogo de impactos do método 3.0: as fichas de efeito que o índice usa, por categoria.
 * Organismos em gênero, família ou grupo; espécie só para exóticas. Nada vem da planilha antiga do laboratório. */
export function EffectsCatalog() {
  const fichas = captureFichas();
  return <div className="min-w-0 space-y-6">
    {captureDomains.map(domain => {
      const items = fichas.filter(ficha => ficha.domain === domain);
      if (!items.length) return null;
      return <section key={domain} className="min-w-0 space-y-2" aria-labelledby={`catalogo-${domain}`}>
        <h2 id={`catalogo-${domain}`} className="type-section-title">{captureDomainLabels[domain]} <span className="type-metadata font-normal text-[var(--ink-soft)]">· {items.length} {items.length === 1 ? "ficha" : "fichas"}</span></h2>
        <div className="overflow-x-auto rounded border border-[var(--line-ghost)]" role="region" aria-label={`${captureDomainLabels[domain]}: tabela com rolagem horizontal`} tabIndex={0}>
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--surface-soft)]"><tr>
              <th scope="col" className="px-3 py-3">Organismo</th>
              <th scope="col" className="px-3 py-3">Tipo de efeito</th>
              <th scope="col" className="px-3 py-3 text-right">Gravidade</th>
              <th scope="col" className="px-3 py-3">Aplicabilidade</th>
              <th scope="col" className="px-3 py-3">Fonte</th>
            </tr></thead>
            <tbody>{items.map(ficha => {
              const effect = effectOf.get(ficha.id), href = /^https:\/\/[^\s]+$/.test(ficha.source) ? ficha.source : null;
              return <tr key={ficha.id} id={`ficha-${ficha.id}`} className="scroll-mt-24 border-t border-[var(--line-ghost)] align-top target:bg-[var(--surface-soft)]">
                <th scope="row" className="px-3 py-2 font-semibold text-[var(--brand-navy-strong)]"><em>{ficha.taxon}</em>
                  <span className="block text-xs font-normal not-italic text-[var(--ink-soft)]">{levelLabels[ficha.level] ?? ficha.level}</span></th>
                <td className="max-w-[34rem] px-3 py-2">
                  {effect ? <Link className="font-semibold underline underline-offset-4" href={`/campanhas/resultados?vista=efeitos&effect=${effect.id}`}>{effect.title}</Link> : null}
                  <details className="mt-1"><summary className="min-h-11 cursor-pointer content-center text-[var(--ink-soft)]">Justificativa</summary><p className="break-words pb-2">{ficha.rationale}</p></details>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{ficha.severity ?? "—"}</td>
                <td className="px-3 py-2">{applicability(ficha)}</td>
                <td className="px-3 py-2">{href ? <a className="break-all underline underline-offset-4" href={href} target="_blank" rel="noreferrer">{ficha.source.replace(/^https?:\/\/(doi\.org\/)?/, "")}</a> : ficha.source}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>;
    })}
  </div>;
}
