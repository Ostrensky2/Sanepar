import { categories, reconciliationIndexHash, reconciliationRows, sourceHashes } from "@/lib/capture-index/exotics-reconciliation";

export function CaptureExoticsReconciliation({ campaign }: { campaign: number }) {
  const hash = sourceHashes[campaign];
  const rows = reconciliationRows.filter(([c]) => c === campaign);
  return <section className="app-card space-y-4 p-4 sm:p-6" aria-label="Reconciliação de exóticas por campanha">
    <h2 className="text-xl font-bold text-[var(--brand-navy-strong)]">Exóticas: origem dos registros de COI</h2>
    {!hash || !rows.length ? <p>Sem reconciliação documentada para esta campanha. Não equivale a zero registros.</p> : <>
      <p>Campanha {campaign} · conferência de 22/11/2026. Cada registro representa um táxon em um ponto da campanha, na corrida de COI selecionada e utilizável. Não é uma contagem de organismos.</p>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map(([, run, category, records, reads]) =>
        <li key={run + category} className="rounded-xl border border-[var(--line-ghost)] bg-white p-4"><details>
          <summary className="flex min-h-11 cursor-pointer items-center gap-3"><strong className="text-3xl font-extrabold tabular-nums text-[var(--brand-navy-strong)]">{records}</strong><span className="font-semibold leading-snug">{categories[category]}</span></summary>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">{reads.toLocaleString("pt-BR")} reads {category.startsWith("reassigned") ? "reatribuídos por curadoria" : "na coluna taxonômica do laboratório"}. Corrida na planilha: {run}.</p>
        </details></li>)}</ul>
      <p>Reatribuição de <i>Perna</i> para <i>Limnoperna fortunei</i> é uma decisão de curadoria, não uma identificação direta. {campaign === 1 && "Nenhum registro adicional por essa regra na C1."}{campaign === 2 && "Nos três casos mistos, o detalhe original lista apenas os 410 reads nominais. Os 257 reads reatribuídos são apresentados à parte; não acrescentam três registros à lista."}</p>
      <details><summary className="min-h-11 cursor-pointer py-2 font-semibold">Fontes e limites da conferência</summary>
        <p>Aba Exóticas COI do arquivo final, confrontada com os descritores de espécies exóticas do índice. A coluna total não entra. As categorias candidatas e regionais conservam a incerteza; sinal molecular não comprova invasão estabelecida nem dano. O quadro não altera o índice.</p>
        {campaign === 3 && <p>O COI utilizável inclui 47 pontos NextSeq e um MiSeq. As categorias com registros positivos deste quadro ocorreram na NextSeq; as corridas não foram somadas.</p>}
        <p className="break-all">SHA-256 do XLSX: <code>{hash}</code>. SHA-256 das linhas do índice: <code>{reconciliationIndexHash}</code>.</p>
      </details>
    </>}
  </section>;
}
