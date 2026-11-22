import { categories, reconciliationIndexHash, reconciliationRows, sourceHashes } from "@/lib/capture-index/exotics-reconciliation";

export function CaptureExoticsReconciliation({ campaign }: { campaign: number }) {
  const hash = sourceHashes[campaign];
  const rows = reconciliationRows.filter(([c]) => c === campaign);
  return <section className="app-card space-y-3 p-4" aria-label="Reconciliação de exóticas por campanha">
    <h2 className="text-lg font-semibold">Exóticas: origem dos registros de COI</h2>
    {!hash || !rows.length ? <p>Sem reconciliação documentada para esta campanha. Não equivale a zero registros.</p> : <>
      <p>Campanha {campaign} · índice 0.7 · conferência de 22/11/2026. Cada registro representa um táxon em um ponto da campanha, na corrida de COI selecionada e utilizável. Não é uma contagem de organismos.</p>
      <ul className="space-y-2">{rows.map(([, run, category, records, reads]) =>
        <li key={run + category}><details>
          <summary className="cursor-pointer"><strong>{records}</strong> · {categories[category]}</summary>
          <p className="pl-4">{reads.toLocaleString("pt-BR")} reads {category.startsWith("reassigned") ? "reatribuídos por curadoria" : "na coluna taxonômica do laboratório"}. Corrida na planilha: {run}.</p>
        </details></li>)}</ul>
      <p>Reatribuição de <i>Perna</i> para <i>Limnoperna fortunei</i> é uma decisão de curadoria, não uma identificação direta. {campaign === 1 && "Nenhum registro adicional por essa regra na C1."}{campaign === 2 && "Nos três casos mistos, o detalhe original lista apenas os 410 reads nominais. Os 257 reads reatribuídos são apresentados à parte; não acrescentam três registros à lista."}</p>
      <details><summary className="cursor-pointer">Fontes e limites da conferência</summary>
        <p>Aba Exóticas COI do arquivo final, confrontada com os descritores da versão 0.7. A coluna total não entra. As categorias candidatas e regionais conservam a incerteza; sinal molecular não comprova invasão estabelecida nem dano. O quadro não altera o índice.</p>
        {campaign === 3 && <p>O COI utilizável inclui 47 pontos NextSeq e um MiSeq. As categorias com registros positivos deste quadro ocorreram na NextSeq; as corridas não foram somadas.</p>}
        <p className="break-all">SHA-256 do XLSX: <code>{hash}</code>. SHA-256 das linhas do índice: <code>{reconciliationIndexHash}</code>.</p>
      </details>
    </>}
  </section>;
}
