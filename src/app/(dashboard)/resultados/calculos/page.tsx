import Link from "next/link";
import { ArrowRight, BookOpenText, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";
import { ResultsInterpretationHelp } from "@/modules/results/components/results-interpretation-help";
import { bandNames, bands } from "@/modules/results/components/capture-map-scale";

/** Metodologia do índice de captação (IR-CAPTACAO-0.8). A leitura completa fica em /resultados/calculos/0-8.
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
      description="Metodologia 0.8, a mesma em todas as telas: mapa, ficha, tabela e planilha."
      help={<ResultsInterpretationHelp title="Como ler o cálculo">
        <p>O índice ordena a atenção entre os pontos de captação. Não é porcentagem, não é probabilidade de dano e não descreve a água tratada.</p>
        <p>Cada campanha é calculada só com os seus próprios dados, ponto a ponto (SIA). Mapa, ficha, tabela, planilha e exportações mostram a mesma nota de cada campanha e ponto.</p>
        <p>Os números de cada ponto, com as fichas que formam cada nota, estão em <strong>Índice de risco na captação</strong>.</p>
      </ResultsInterpretationHelp>}
      tabs={<SectionTabs />}
    />

    <section aria-label="O cálculo em três passos" className="grid gap-4 lg:grid-cols-3">
      <article className={card}>
        <div className="flex items-center gap-2"><span className={step}>1</span><h2 className={title}>Cada organismo vira uma massa</h2>
          <ResultsInterpretationHelp title="Passo 1 · a massa de cada organismo">
            <p>Cada organismo detectado contribui com a sua participação nos reads válidos da biblioteca, multiplicada pela gravidade do efeito (1 a 3, dividida por 3) e pela aplicabilidade registrada na ficha (1, 0,5, 0,1 ou 0).</p>
            <p>Só pontua organismo com efeito documentado em fonte lida. Organismo sem ficha decidida contribui com zero e reduz a cobertura da curadoria, não a nota.</p>
            <p>Diatomáceas e a assinatura de esgoto somam como grupos e só pontuam o que passa da base da rede.</p>
            <p>Ocorrência com menos de 10 reads ou menos de 0,01% da biblioteca vira alerta, sem elevar a nota.</p>
          </ResultsInterpretationHelp></div>
        <p className={formula}>participação × gravidade ÷ 3 × aplicabilidade</p>
        <dl className="space-y-2 type-metadata">
          {[["participação", "parte dos reads válidos da biblioteca"], ["gravidade", "1 a 3, conforme a ficha do efeito"], ["aplicabilidade", "1 · 0,5 · 0,1 · 0, conforme a ficha"]].map(([term, text]) => <div key={term} className="flex items-baseline gap-3">
            <dt className="w-28 shrink-0 font-mono text-xs font-semibold text-[var(--brand-navy-strong)]">{term}</dt><dd className="text-[var(--ink-soft)]">{text}</dd>
          </div>)}
        </dl>
        <p className="border-t border-[var(--line-ghost)] pt-3 type-caption text-[var(--ink-soft)]">Só entra organismo com efeito documentado.</p>
      </article>
      <article className={card}>
        <div className="flex items-center gap-2"><span className={step}>2</span><h2 className={title}>A massa vira a nota da categoria</h2>
          <ResultsInterpretationHelp title="Passo 2 · a nota de cada categoria">
            <p>Em cada marcador utilizável somam-se as massas, e a soma passa por uma curva logarítmica que leva o resultado para a escala de 0 a 1.</p>
            <p>São três categorias: danos físicos e ambientais, riscos operacionais e perigo potencial à saúde, identificado na captação. A nota de cada categoria é a do marcador de maior nota entre os utilizáveis.</p>
            <p>A escala é fixa e tem folga: uma nota de 0,15 corresponde a cerca de 1% de participação ponderada, 0,35 a 4% e 0,60 a 15%.</p>
          </ResultsInterpretationHelp></div>
        <p className={formula}>nota = ln(1 + 100·Q) ÷ ln(101)</p>
        <CurveSketch />
      </article>
      <article className={card}>
        <div className="flex items-center gap-2"><span className={step}>3</span><h2 className={title}>As três categorias viram o índice geral</h2>
          <ResultsInterpretationHelp title="Passo 3 · o índice geral">
            <p>A maior das três notas é o piso do índice geral. Um dano distinto e documentado em outra categoria pode reforçar esse piso; repetir o mesmo dano não reforça.</p>
            <p>Cada categoria com nota positiva é testada como primária. Conserva-se o maior resultado elegível, nunca abaixo do piso.</p>
            <p>O índice geral não é a média das três categorias. O número de uma campanha é a média dos seus pontos, com um voto por ponto.</p>
          </ResultsInterpretationHelp></div>
        <p className={formula}>piso + reforço por dano distinto</p>
        <div aria-hidden className="space-y-3">
          <ul className="space-y-1.5 type-caption text-[var(--ink-soft)]">
            {([["Danos físicos e ambientais", 26, false], ["Riscos operacionais", 58, true], ["Perigo à saúde", 38, false]] as const).map(([label, width, top]) => <li key={label} className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] items-center gap-2">
              <span className={top ? "font-semibold text-[var(--ink)]" : ""}>{label}</span>
              <span className="h-2 overflow-hidden rounded-full bg-[var(--surface-soft)]"><span className="block h-full rounded-full" style={{ width: `${width}%`, backgroundColor: top ? "var(--brand-navy-strong)" : "var(--line-strong)" }} /></span>
            </li>)}
          </ul>
          <div className="flex h-7 overflow-hidden rounded-md text-xs font-bold text-white">
            <span className="flex flex-[58] items-center justify-center bg-[var(--brand-navy-strong)]">piso</span>
            <span className="ml-0.5 flex flex-[16] items-center justify-center bg-[var(--brand-teal)]">reforço</span>
            <span className="ml-0.5 flex-[26] bg-[var(--surface-soft)]" />
          </div>
        </div>
        <p className="border-t border-[var(--line-ghost)] pt-3 type-caption text-[var(--ink-soft)]">Exemplo ilustrativo. A maior categoria dá o piso; nunca é a média das três.</p>
      </article>
    </section>

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
      <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--brand-navy-strong)] px-4 text-sm font-bold text-white" href="/resultados/indice-captacao">Consultar resultados por campanha e ponto<ArrowRight aria-hidden className="size-4" /></Link>
      <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-4 text-sm font-bold text-[var(--brand-navy-strong)]" href="/resultados/calculos/0-8"><BookOpenText aria-hidden className="size-4" />Ler a metodologia 0.8 completa</Link>
    </div>
  </div>;
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
