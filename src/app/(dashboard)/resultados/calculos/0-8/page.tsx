import Link from "next/link";

export default function Method08Page() {
  return <article className="app-card mx-auto max-w-3xl space-y-5 p-6 print:border-0 print:shadow-none">
    <h1 className="type-page-title">Índice de captação · método 0.8</h1>
    <p>Documento de leitura da metodologia em uso no aplicativo, por campanha e por ponto (SIA), de C1 a C3.</p>
    <section><h2 className="type-section-title">Resolução da identificação</h2>
      <p>A resolução do marcador e a cobertura e confiabilidade dos bancos de referência limitam a identificação. Use espécie quando sustentada; caso contrário, registre gênero, família, ordem, nível superior ou identificação não resolvida. Se duas espécies do mesmo gênero têm o mesmo trecho lido, aquele trecho não permite escolher entre elas.</p>
      <p>Para a cobertura das bibliotecas de referência de organismos aquáticos europeus, consulte <a className="underline" href="https://doi.org/10.1016/j.scitotenv.2019.04.247">Weigand et al. (2019)</a>. O estudo descreve lacunas nos bancos de sequências de referência; não avaliou as campanhas do Paraná.</p>
      <p>Essa escolha não melhora a sequência nem reclassifica resultados anteriores. A confiança no nome, a evidência de um efeito naquele grupo e a prioridade de triagem são avaliações distintas. Parentesco pode motivar um alerta; não atribui grau automaticamente nem confirma dano.</p>
    </section>
    <section><h2 className="type-section-title">Piso, primária e reforço</h2>
      <p>O piso é a maior das três notas de domínio recompostas na versão 0.8. Cada categoria com nota positiva é testada separadamente como única primária, inclusive se estiver abaixo do piso ou empatada. Conserva-se o maior resultado elegível, nunca inferior ao piso.</p>
      <p>Só uma consequência distinta, sustentada no domínio e admitida pela adjudicação pode reforçar a primária. Repetir uma consequência, mesmo em outro marcador, não dá crédito adicional. Códigos diferentes não comprovam independência.</p>
      <p className="break-words font-mono" aria-label="Expressão do índice geral">max(M, maxᵢ[pᵢ + (1 − pᵢ)(Bᵢ + Cᵢ)/2])</p>
      <dl className="space-y-2">
        <div><dt className="font-bold">M e pᵢ</dt><dd>M é a maior nota de domínio da versão atual. pᵢ é a nota positiva recomposta do domínio candidato a primária.</dd></div>
        <div><dt className="font-bold">Bᵢ e Cᵢ</dt><dd>São as notas de reforço recalculadas nos dois outros domínios. Em cada um, a adjudicação exclui repetição da consequência primária e exige evidência aplicável ao domínio. Para cada classe repetida admitida, conserva-se a maior massa elegível. A soma dessas massas é Q, e a nota de reforço é ln(1 + 100Q) / ln(101).</dd></div>
      </dl>
      <p>Se duas observações descrevem a mesma consequência A, a segunda não reforça A. Uma consequência B distinta pode reforçá-la quando há evidência independente e a adjudicação permite esse uso.</p>
      <p>Sem massa elegível, aquele reforço vale zero e a metade disponível não é redistribuída. Sem ambos os reforços, a candidata vale pᵢ. Zero crédito no cálculo não demonstra ausência de efeito.</p>
      <p>Identificação molecular, concentração de um composto, percepção de gosto ou odor e desfecho de saúde representam observações diferentes. Uma delas, sozinha, não comprova as demais.</p>
    </section>
    <section><h2 className="type-section-title">Como ler a distribuição</h2>
      <p>Escolha uma campanha e um domínio. Confira o total medido e quantos registros têm estimativa para o domínio escolhido. A média usa só estimativas numéricas; as frequências percentuais usam esse mesmo denominador. A campanha continua visível quando faltam estimativas. A média resume o conjunto; o máximo é o maior valor observado e pode ocorrer mais de uma vez.</p>
      <p>Uma faixa com frequência zero tem denominador conhecido e nenhuma observação naquele intervalo. Uma campanha sem medição permanece sem resultado.</p>
    </section>
    <section><h2 className="type-section-title">Quando reforçar a investigação</h2>
      <p>Confira o número de medições, a distribuição e a distância entre média e máximo. Antes de interpretar uma diferença entre campanhas, confira a comparabilidade das medições e procure evidência independente que sustente a interpretação.</p>
      <p>As faixas orientam a triagem. A capacidade de antecipar episódios exige validação preditiva. Adoção pela equipe e publicação de uma versão do software são decisões distintas.</p>
    </section>
    <section><h2 className="type-section-title">Nota por campanha e ponto</h2>
      <p>Mapa, ficha, tabela e planilha mostram a mesma nota 0.8 de cada campanha e SIA. As campanhas são independentes: a nota de um ponto em uma campanha nunca usa dados de outra.</p>
      <p>Zero é nota calculada. “Sem estimativa” indica que há leitura, mas a nota não pode ser afirmada. “Sem medição” indica que não há biblioteca utilizável. Nenhum dos dois é zero.</p>
      <p>Os perfis de risco biológico operacional e sanitário de cada captação reúnem a nota da categoria e os tipos de efeito com contribuição documentada naquela amostra.</p>
    </section>
    <nav className="print:hidden"><Link className="underline" href="/resultados/calculos">Voltar a Ciência e método</Link></nav>
  </article>;
}
