import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, BookOpenText, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";
import { ResultsInterpretationHelp } from "@/modules/results/components/results-interpretation-help";
import { bandNames, bands } from "@/modules/results/components/capture-map-scale";
import { IndexPlainExplanation } from "@/modules/results/components/index-plain-explanation";

/** Metodologia do índice de captação (IR-CAPTACAO-3.0). A leitura completa fica em /resultados/calculos/3-0.
 * A página mostra o método em três passos; os detalhes de cada passo abrem no "?" ao lado do título. */
export default function CalculationsPage() {
  const card = "app-card min-w-0 space-y-3 p-4 sm:p-5";
  const title = "heading-font type-panel-title text-[var(--brand-navy-strong)]";
  const step = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-navy-strong)] text-sm font-bold text-white";
  const formula = "rounded-lg bg-[var(--surface-soft)] px-3 py-2 font-mono text-sm leading-relaxed text-[var(--brand-navy-strong)]";
  return <div className="app-container min-w-0 space-y-5">
    <PageHeader
      eyebrow="Ciência e método"
      title="Como o índice é calculado"
      description="Metodologia 3.0, a mesma em todas as telas: mapa, ficha, tabela e planilha."
      help={<ResultsInterpretationHelp title="Como ler o cálculo">
        <p>O índice ordena a atenção entre os pontos de captação. Não é porcentagem, não é probabilidade de dano e não descreve a água tratada.</p>
        <p>Cada campanha é calculada só com os seus próprios dados, ponto a ponto (SIA). Mapa, ficha, tabela, planilha e exportações mostram a mesma nota de cada campanha e ponto.</p>
        <p>Os números de cada ponto, com as fichas que formam cada nota, estão em <strong>Resultados</strong>.</p>
      </ResultsInterpretationHelp>}
      tabs={<SectionTabs />}
    />

    {/* Para quem opera: a mesma conta, sem fórmula. A descrição técnica vem logo abaixo. */}
    <section id="linguagem-simples" aria-labelledby="linguagem-simples-titulo" className={card + " scroll-mt-24 type-body text-[var(--ink)]"}>
      <h2 id="linguagem-simples-titulo" className={title}>Em linguagem simples</h2>
      <IndexPlainExplanation />
    </section>

    <h2 className="type-section-title">A conta, passo a passo</h2>
    <section aria-label="O cálculo em três passos" className="grid gap-4 lg:grid-cols-3">
      <article className={card}>
        <div className="flex items-center gap-2"><span className={step}>1</span><h2 className={title}>Cada organismo vira uma massa</h2>
          <ResultsInterpretationHelp title="Passo 1 · a massa de cada organismo">
            <p>Cada organismo detectado contribui com a sua participação nos reads válidos da biblioteca, multiplicada pela gravidade do efeito (1 a 3, dividida por 3) e pela aplicabilidade registrada na ficha (1, 0,5, 0,1 ou 0).</p>
            <p>Só pontua organismo com efeito documentado em fonte lida. Organismo sem ficha decidida contribui com zero e reduz a cobertura da curadoria, não a nota.</p>
            <p>Diatomáceas e a assinatura de esgoto somam como grupos e só pontuam o que passa da base da rede.</p>
            <p>Ocorrência com menos de 10 reads ou menos de 0,01% da biblioteca vira alerta, sem elevar a nota.</p>
          </ResultsInterpretationHelp></div>
        <p className={formula}>massa = participação × (gravidade ÷ 3) × aplicabilidade</p>
        <Symbols items={[
          ["participação", <>os reads do organismo divididos pelos reads válidos da biblioteca. Ex.: 3.000 de 100.000 dá 0,03, ou 3%.</>],
          ["gravidade ÷ 3", <>a gravidade da ficha (1 leve, 2 moderada, 3 grave) dividida por 3, para a mais grave valer 1: dá 0,33, 0,67 ou 1.</>],
          ["aplicabilidade", <>quanto do grupo detectado carrega o efeito, conforme a ficha: 1, 0,5, 0,1 ou 0.</>],
          ["massa", <>o resultado: a fatia do DNA, descontada pela gravidade e pela aplicabilidade. Fica entre 0 e 1.</>],
        ]} />
        <p className="border-t border-[var(--line-ghost)] pt-3 type-caption text-[var(--ink-soft)]">Só entra organismo com efeito documentado.</p>
      </article>
      <article className={card}>
        <div className="flex items-center gap-2"><span className={step}>2</span><h2 className={title}>A massa vira a nota da categoria</h2>
          <ResultsInterpretationHelp title="Passo 2 · a nota de cada categoria">
            <p>Em cada marcador utilizável somam-se as massas, e a soma passa por uma curva logarítmica que leva o resultado para a escala de 0 a 1.</p>
            <p>São três categorias: danos físicos e ambientais, riscos operacionais e perigo potencial à saúde, identificado na captação. A nota de cada categoria é a do marcador de maior nota entre os utilizáveis.</p>
            <p>A escala é fixa e tem folga: uma nota de 0,15 corresponde a cerca de 1% de participação ponderada, 0,35 a 4% e 0,60 a 15%.</p>
            <p><strong>Por que um logaritmo.</strong> Com uma régua reta, 1% de massa daria nota 0,01 e quase todo ponto ficaria grudado no zero. O logaritmo cresce rápido no começo e devagar depois: separa bem os sinais pequenos, que são a maioria, e deixa espaço para situações piores que as já vistas.</p>
            <p><strong>Por que 100 e 101.</strong> O 100 amplia a massa antes do logaritmo, de modo que 1% já pese na escala. O 101 é o valor de 1 + 100 × Q quando Q é 1, a amostra inteira com gravidade e aplicabilidade máximas; dividir por ln(101) faz esse caso extremo dar exatamente 1. O “1 +” faz Q igual a zero dar nota zero, porque ln(1) é 0.</p>
          </ResultsInterpretationHelp></div>
        <p className={formula}>Q = soma das massas da categoria<br />nota = ln(1 + 100 × Q) ÷ ln(101)</p>
        <Symbols items={[
          ["Q", <>a soma das massas dos organismos daquela categoria, entre 0 e 1. Q = 0,01 quer dizer 1%.</>],
          ["ln", <>logaritmo natural (neperiano), a tecla “ln” da calculadora. Cresce rápido no começo e devagar depois.</>],
          ["100", <>amplia Q antes do logaritmo, para que 1% já conte: 100 × 0,01 = 1.</>],
          ["1 +", <>garante que, sem massa, a nota seja zero, porque ln(1) = 0.</>],
          ["ln(101)", <>vale 4,615. É o valor de cima quando Q = 1 (1 + 100 × 1 = 101); dividir por ele faz a nota máxima ser 1.</>],
        ]} />
        <CurveSketch />
      </article>
      <article className={card}>
        <div className="flex items-center gap-2"><span className={step}>3</span><h2 className={title}>As três categorias viram o índice geral</h2>
          <ResultsInterpretationHelp title="Passo 3 · o índice geral">
            <p>A maior das três notas é o piso do índice geral. Um dano distinto e documentado em outra categoria pode reforçar esse piso; repetir o mesmo dano não reforça.</p>
            <p>Cada categoria com nota positiva é testada como primária. Conserva-se o maior resultado elegível, nunca abaixo do piso.</p>
            <p>O índice geral não é a média das três categorias. O número de uma campanha é a média dos seus pontos, com um voto por ponto.</p>
          </ResultsInterpretationHelp></div>
        <p className={formula}>geral = P + (1 − P) × (R₁ + R₂) ÷ 2</p>
        <Symbols items={[
          ["P", <>a nota de uma categoria, testada como a principal. Testam-se as três e fica o maior resultado.</>],
          ["R₁ e R₂", <>os reforços das outras duas categorias: a mesma curva do passo 2, aplicada só aos danos diferentes do da principal. Sem dano diferente, valem 0.</>],
          ["1 − P", <>o espaço que falta até 1; o reforço só ocupa parte dele.</>],
          ["÷ 2", <>tira a média dos dois reforços.</>],
          ["piso", <>a maior das três notas. O geral nunca fica abaixo dele.</>],
        ]} />
        <p className="border-t border-[var(--line-ghost)] pt-3 type-caption text-[var(--ink-soft)]">Repetir o mesmo dano não reforça. O geral nunca é a média das três categorias.</p>
      </article>
    </section>

    <WorkedExample card={card} title={title} />

    <section className={card} aria-labelledby="escala-titulo">
      <div className="flex items-center gap-2"><h2 id="escala-titulo" className={title}>A escala de 0 a 1</h2>
        <ResultsInterpretationHelp title="A escala e os três estados">
          <p>A escala é fixa: vale igual para todas as campanhas e categorias. As cinco faixas orientam a investigação; não são classes de risco comprovado.</p>
          <p><strong>Zero é nota calculada:</strong> nenhuma contribuição pontuada. Não é ausência demonstrada de risco.</p>
          <p><strong>Sem estimativa:</strong> há leitura no ponto, mas a nota não pode ser afirmada. Não é zero.</p>
          <p><strong>Sem medição:</strong> não há biblioteca utilizável naquele ponto e campanha. Não é zero.</p>
        </ResultsInterpretationHelp></div>
      <div className="flex h-3 overflow-hidden rounded-full" aria-hidden>
        {bands.map((band, i) => <span key={band.label} className={i ? "ml-0.5" : ""} style={{ backgroundColor: band.color, flexGrow: [5, 10, 20, 35, 30][i] }} />)}
      </div>
      <ul className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-5">
        {bands.map((band, i) => <li key={band.label} className="flex items-center gap-2 type-metadata"><span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: band.color }} /><span><strong className="text-[var(--ink)]">{bandNames[i]}</strong><span className="block text-[var(--ink-soft)]">{band.label}</span></span></li>)}
      </ul>
      <ul className="flex flex-wrap gap-2 border-t border-[var(--line-ghost)] pt-3 type-metadata">
        {["Zero é nota calculada", "Sem estimativa não é zero", "Sem medição não é zero"].map(text => <li key={text} className="rounded-full border border-[var(--line-ghost)] bg-white px-3 py-1 font-semibold text-[var(--ink)]">{text}</li>)}
      </ul>
    </section>

    <section aria-label="Regras e limites" className="app-card divide-y divide-[var(--line-ghost)] p-0">
      {[
        ["Regras de evidência", ["Só pontua organismo com efeito documentado em fonte lida. Organismo sem ficha decidida contribui com zero e reduz a cobertura da curadoria, não a nota.", "Evidência de espécie não vale para o gênero, salvo quando só uma espécie do gênero ocorre no Brasil, como o mexilhão-dourado.", "Diatomáceas e a assinatura de esgoto somam como grupos e só pontuam o que passa da base da rede.", "Ocorrência com menos de 10 reads ou menos de 0,01% da biblioteca vira alerta, sem elevar a nota.", "Zero significa nenhuma contribuição pontuada, não ausência demonstrada de risco."]],
        ["Dados usados", ["Marcadores 16S e COI das campanhas C1 a C3, da reanálise do laboratório. Quando há duas corridas da mesma amostra, usa-se o NextSeq e, na falta dele, o MiSeq.", "Organismos marinhos identificados no COI foram retirados da leitura, porque não têm como ocorrer nas captações.", "Espécies exóticas são listadas por ponto, sem nota."]],
        ["O que o índice não enxerga", ["Protozoários como Cryptosporidium e Giardia.", "Algas cujo cloroplasto não foi classificado. Não há marcador próprio para diatomáceas.", "A dominância compara cada táxon com as bibliotecas utilizáveis do mesmo componente e gera apenas alerta. A classificação exploratória do cloroplasto não substitui medição de biomassa nem confirmação do efeito.", "A comparação é retrospectiva; o desempenho para antecipar episódios não foi demonstrado."]],
      ].map(([heading, items]) => <details key={heading as string} className="group px-4 sm:px-5">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2 [&::-webkit-details-marker]:hidden"><span className={title}>{heading}</span><ChevronRight aria-hidden className="size-5 shrink-0 text-[var(--ink-soft)] transition-transform group-open:rotate-90" /></summary>
        <ul className="list-disc space-y-1.5 pb-4 pl-5 type-body text-[var(--ink)]">{(items as string[]).map(item => <li key={item}>{item}</li>)}</ul>
      </details>)}
    </section>

    <div className="flex flex-wrap gap-3">
      <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--brand-navy-strong)] px-4 text-sm font-bold text-white" href="/campanhas/resultados">Consultar resultados por campanha e ponto<ArrowRight aria-hidden className="size-4" /></Link>
      <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-4 text-sm font-bold text-[var(--brand-navy-strong)]" href="/resultados/calculos/3-0"><BookOpenText aria-hidden className="size-4" />Ler a metodologia 3.0 completa</Link>
    </div>
  </div>;
}

/** O que cada símbolo da fórmula quer dizer, em palavras. */
function Symbols({ items }: { items: Array<[string, ReactNode]> }) {
  return <dl className="space-y-2 type-metadata">
    {items.map(([term, text]) => <div key={term}>
      <dt className="inline font-mono text-sm font-bold text-[var(--brand-navy-strong)]">{term}</dt><dd className="inline text-[var(--ink-soft)]">: {text}</dd>
    </div>)}
  </dl>;
}

/**
 * Exemplo resolvido, com números inventados para ilustrar. Os resultados foram conferidos com o núcleo do cálculo
 * (evaluateResultsIndex em src/lib/results-08-core.ts): operacional 0,1985; saúde 0,1502; geral 0,2587.
 */
function WorkedExample({ card, title }: { card: string; title: string }) {
  const rows: Array<[string, string, string]> = [
    ["Participação do organismo A", "3.000 ÷ 100.000", "0,03"],
    ["Massa de A (gravidade 2, aplicabilidade 0,5)", "0,03 × (2 ÷ 3) × 0,5", "0,010"],
    ["Participação do organismo B", "500 ÷ 100.000", "0,005"],
    ["Massa de B (gravidade 3, aplicabilidade 1)", "0,005 × (3 ÷ 3) × 1", "0,005"],
    ["Q, a soma das massas", "0,010 + 0,005", "0,015"],
    ["Dentro do logaritmo", "1 + 100 × 0,015", "2,5"],
    ["Logaritmo natural", "ln(2,5)", "0,916"],
    ["Divisor fixo", "ln(101)", "4,615"],
    ["Nota de riscos operacionais", "0,916 ÷ 4,615", "0,20"],
  ];
  return <section className={card} aria-labelledby="exemplo-titulo">
    <div className="flex items-center gap-2"><h2 id="exemplo-titulo" className={title}>Exemplo resolvido, do read à nota</h2>
      <ResultsInterpretationHelp title="Sobre o exemplo">
        <p>Os números são inventados para mostrar a conta; não são de um ponto real. As notas de cada ponto, com as fichas que formam cada uma, estão em <strong>Resultados</strong>.</p>
        <p>Os resultados deste exemplo foram conferidos com o mesmo cálculo usado no aplicativo.</p>
      </ResultsInterpretationHelp></div>
    <p className="type-body text-[var(--ink)]">Uma amostra tem 100.000 reads válidos no 16S. Dois organismos com ficha de riscos operacionais aparecem nela: A, com 3.000 reads, e B, com 500.</p>
    <ol className="divide-y divide-[var(--line-ghost)] rounded-lg border border-[var(--line-ghost)]">
      {rows.map(([label, math, result], i) => <li key={label} className={"grid gap-x-4 gap-y-0.5 px-3 py-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_4.5rem] sm:items-baseline " + (i === rows.length - 1 ? "bg-[var(--surface-soft)]" : "")}>
        <span className="type-metadata text-[var(--ink)]">{label}</span>
        <span className="font-mono text-sm text-[var(--ink-soft)]">{math}</span>
        <span className="font-mono text-sm font-bold text-[var(--brand-navy-strong)] sm:text-right">= {result}</span>
      </li>)}
    </ol>
    <p className="type-body text-[var(--ink)]">A nota 0,20 cai na faixa <strong>Atenção</strong> (0,15 a menos de 0,35).</p>
    <div className="space-y-2 rounded-lg bg-[var(--surface-soft)] p-3 type-body text-[var(--ink)]">
      <p><strong>E o índice geral?</strong> Suponha que, no mesmo ponto, a categoria de saúde tenha um dano diferente, com massa 0,01, e a ambiental não tenha nada. O reforço da saúde é ln(1 + 100 × 0,01) ÷ ln(101) = ln(2) ÷ 4,615 = <strong>0,15</strong>; o ambiental é 0.</p>
      <p className="font-mono text-sm text-[var(--brand-navy-strong)]">geral = 0,20 + (1 − 0,20) × (0,15 + 0) ÷ 2 = 0,20 + 0,80 × 0,075 = 0,26</p>
      <p>O geral fica em 0,26, acima da maior categoria (0,20) porque o problema de saúde é outro. Se fosse o mesmo dano, não haveria reforço e o geral seria 0,20.</p>
    </div>
  </section>;
}

/** A curva da nota: participação ponderada (0 a 20%) no eixo horizontal, nota (0 a 1) no vertical. */
function CurveSketch() {
  const width = 300, height = 120, left = 30, bottom = 22, top = 8, right = 8, maxQ = 0.2, maxY = 0.7;
  const x = (q: number) => left + (q / maxQ) * (width - left - right);
  const y = (note: number) => height - bottom - (note / maxY) * (height - bottom - top);
  const note = (q: number) => Math.log1p(100 * q) / Math.log1p(100);
  const path = Array.from({ length: 81 }, (_, i) => { const q = (i / 80) * maxQ; return `${i ? "L" : "M"}${x(q).toFixed(1)} ${y(note(q)).toFixed(1)}`; }).join(" ");
  const marks = [[0.01, "1%"], [0.04, "4%"], [0.15, "15%"]] as const;
  return <figure className="m-0">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Curva da nota: 1% de participação ponderada dá nota 0,15; 4% dá 0,35; 15% dá 0,60." className="h-auto w-full">
      {[0.15, 0.35, 0.6].map(value => <g key={value}><line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="var(--line-ghost)" strokeWidth="1" /><text x={left - 4} y={y(value) + 3} textAnchor="end" fontSize="9" fill="var(--ink-soft)">{String(value.toFixed(2)).replace(".", ",")}</text></g>)}
      <line x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} stroke="var(--line-strong)" strokeWidth="1" />
      <path d={path} fill="none" stroke="var(--brand-navy-strong)" strokeWidth="2" strokeLinecap="round" />
      {marks.map(([q, label]) => <g key={label}><circle cx={x(q)} cy={y(note(q))} r="4" fill="var(--brand-teal)" stroke="white" strokeWidth="2" /><text x={x(q)} y={height - 8} textAnchor="middle" fontSize="9" fill="var(--ink-soft)">{label}</text></g>)}
    </svg>
    <figcaption className="type-caption text-[var(--ink-soft)]">Participação ponderada → nota. A curva dá mais espaço aos sinais pequenos.</figcaption>
  </figure>;
}
