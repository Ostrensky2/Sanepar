import Link from "next/link";
import { bandNames, bands } from "./capture-map-scale";

/**
 * O índice de captação (método 3.0) explicado em linguagem simples, para quem opera e não é da área.
 * Cada afirmação segue o que o cálculo faz (src/lib/results-08-core.ts e as fichas do índice):
 * peso = fatia do DNA × gravidade ÷ 3 × aplicabilidade; nota = ln(1 + 100 × soma) ÷ ln(101);
 * nota geral = maior categoria, com reforço por problema diferente e documentado.
 * A descrição científica completa continua na Metodologia 3.0; este texto não a substitui.
 * "As notas não são fixas": as notas de todas as campanhas são geradas juntas a partir do catálogo de fichas
 * (scripts/indice-08/gerar_pontos_08.py); o texto não diz como nem quando o recálculo é disparado.
 */
const steps: Array<{ title: string; text: React.ReactNode }> = [
  { title: "Leitura do DNA", text: <>A água coletada é filtrada e o DNA que ficou no filtro é sequenciado. Cada trecho lido (um <em>read</em>) é atribuído a um organismo, em geral no nível de gênero ou de família.</> },
  { title: "Consulta às fichas", text: <>Para cada organismo encontrado, o aplicativo procura uma ficha no catálogo, feita a partir da literatura científica. A ficha diz o tipo de problema (ambiental, operacional ou de saúde), a gravidade, de 1 a 3, e a aplicabilidade. Organismo sem ficha não soma nada.</> },
  { title: "Peso de cada organismo", text: <>O peso é a fatia do DNA da amostra que pertence àquele organismo, multiplicada pela gravidade e pela aplicabilidade. Organismo perigoso e abundante pesa muito; perigoso e raro pesa pouco. Achado com pouquíssimo DNA (menos de 10 reads ou menos de 0,01% da amostra) vira só um alerta, sem mexer na nota.</> },
  { title: "Nota de cada categoria", text: <>Os pesos são somados e a soma vira uma nota de 0 a 1. A escala é sensível no começo e exigente no topo: uma soma de pesos de 1% já dá nota 0,15, 4% dá 0,35, a nota 0,70 pede cerca de 24% e a nota 1 pediria a amostra inteira com gravidade e aplicabilidade máximas. Quando a amostra foi lida por mais de um marcador de DNA, vale o marcador com a maior nota.</> },
  { title: "Nota geral", text: <>É a maior das três categorias. Ela sobe um pouco quando outra categoria traz um problema diferente e documentado; repetir o mesmo problema não acrescenta nada. Não é a média das três.</> },
  { title: "Faixa e cor", text: <>A nota cai em uma faixa, que é a cor do ponto no mapa e nos gráficos.</> },
];

const applicability: Array<[string, string]> = [
  ["1", "todo o grupo detectado carrega o problema"],
  ["0,5", "uma parte grande do grupo carrega"],
  ["0,1", "só uma minoria carrega"],
  ["0", "nenhum efeito sustentado pela literatura; não soma"],
];

function Bands() {
  return <ul className="flex flex-wrap gap-x-4 gap-y-1">
    {bands.map((band, i) => <li key={band.label} className="inline-flex items-center gap-1.5"><span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: band.color }} /><strong>{bandNames[i]}</strong> {band.label}</li>)}
  </ul>;
}

/** Versão completa: Metodologia, "Como o índice é calculado" e Ajuda. */
export function IndexPlainExplanation({ headingClassName = "heading-font type-panel-title text-[var(--brand-navy-strong)]" }: { headingClassName?: string }) {
  return <div className="space-y-4">
    <p>O índice responde a uma pergunta: <strong>quanto do que vive naquela água é organismo capaz de causar problema, e quão grave é esse problema?</strong> Ele é calculado para cada ponto de captação (SIA), em cada campanha, sem misturar campanhas.</p>
    <ol className="space-y-3">
      {steps.map((step, i) => <li key={step.title} className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
        <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-[var(--brand-navy-strong)] text-sm font-bold text-white">{i + 1}</span>
        <div><strong className="block text-[var(--brand-navy-strong)]">{step.title}</strong><span className="block">{step.text}</span>{i === 5 && <div className="mt-2 type-metadata"><Bands /></div>}</div>
      </li>)}
    </ol>
    <div className="space-y-2 rounded-lg bg-[var(--surface-soft)] p-4">
      <h3 className={headingClassName}>O que é a aplicabilidade</h3>
      <p>O DNA costuma identificar o grupo (o gênero), não a espécie exata. A aplicabilidade diz quanto daquele grupo realmente carrega o problema:</p>
      <dl className="space-y-1">
        {applicability.map(([value, text]) => <div key={value} className="flex items-baseline gap-3"><dt className="w-8 shrink-0 font-mono font-bold text-[var(--brand-navy-strong)]">{value}</dt><dd>{text}</dd></div>)}
      </dl>
      <p><strong>Exemplo:</strong> em um gênero em que quase todas as espécies produzem toxina, a aplicabilidade é 1; em um gênero em que só uma ou outra espécie produz, é 0,1. É um peso convencionado a partir da literatura, não uma medida feita na amostra.</p>
    </div>
    <div className="space-y-2 rounded-lg bg-[var(--surface-soft)] p-4">
      <h3 className={headingClassName}>Um exemplo com números</h3>
      <p>Um organismo ocupa 3% do DNA da amostra, tem gravidade 2 e aplicabilidade 0,5. O peso dele é 3% × 2 ÷ 3 × 0,5 = 1%. Se for o único problema daquela categoria, a nota da categoria é 0,15, no começo da faixa Atenção.</p>
    </div>
    <div className="space-y-2 rounded-lg border-2 border-[var(--brand-teal)] bg-white p-4">
      <h3 className={headingClassName}>As notas não são fixas</h3>
      <p>O índice depende das fichas, e as fichas acompanham o conhecimento científico. Quando uma ficha nova é incluída ou uma ficha existente é revisada, as notas são recalculadas com o catálogo atualizado, <strong>inclusive as das campanhas antigas</strong>. Por isso a nota de um ponto pode mudar sem que a amostra tenha mudado: o que mudou foi o que se sabe sobre os organismos encontrados nela.</p>
      <p>Isso é intencional. O método é dinâmico: a cada revisão ele fica mais completo e explica melhor os fatores que podem levar a problemas no tratamento da água, para a população e para o ambiente. Todas as campanhas são sempre lidas com o mesmo catálogo, o mais atual, para que continuem comparáveis entre si.</p>
    </div>
    <div className="space-y-1">
      <h3 className={headingClassName}>Como ler o resultado</h3>
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>O índice é um alerta, não a medida de um dano ocorrido.</strong> Ele diz onde olhar primeiro; não prova que o problema aconteceu nem descreve a água tratada.</li>
        <li><strong>Zero</strong> quer dizer que nenhum organismo com ficha pontuou. Não prova que não há risco.</li>
        <li><strong>Sem estimativa</strong> e <strong>sem medição</strong> não são zero: faltou leitura suficiente para afirmar uma nota.</li>
        <li>A nota não é porcentagem nem probabilidade.</li>
      </ul>
    </div>
  </div>;
}

/** Versão curta para os balões "?": a ideia em poucas linhas e o caminho para a explicação completa. */
export function IndexPlainSummary() {
  return <>
    <p><strong>Em linguagem simples:</strong> o índice mostra quanto do DNA encontrado na água pertence a organismos capazes de causar problema, e quão grave é esse problema. Vale para cada ponto (SIA) em cada campanha.</p>
    <p>Cada organismo com ficha no catálogo pesa pela fatia que ocupa no DNA da amostra, pela gravidade do problema (1 a 3) e pela aplicabilidade (quanto do grupo detectado realmente carrega o problema). Perigoso e abundante pesa muito; perigoso e raro pesa pouco. A soma vira uma nota de 0 a 1 em cada categoria, e a nota geral é a maior das três, com um pequeno acréscimo quando outra categoria traz um problema diferente.</p>
    <p><strong>As notas não são fixas:</strong> quando as fichas são incluídas ou revisadas, com o avanço do conhecimento científico, as notas são recalculadas, inclusive as das campanhas antigas.</p>
    <p>É um alerta para orientar a atenção, não a medida de um dano ocorrido. <Link className="font-semibold underline" href="/resultados/calculos#linguagem-simples">Ver a explicação passo a passo</Link></p>
  </>;
}
