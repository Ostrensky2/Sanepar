import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";
import { ResultsInterpretationHelp } from "@/modules/results/components/results-interpretation-help";

/** Metodologia do índice de captação (IR-CAPTACAO-0.8). A leitura completa fica em /resultados/calculos/0-8.
 * O passo a passo do índice anterior (SANEPAR-INDICE-0.3) saiu desta página: a metodologia mudou e os resultados também. */
export default function CalculationsPage() {
  const card = "app-card space-y-2 p-4";
  const title = "heading-font type-panel-title text-[var(--brand-navy-strong)]";
  return <div className="app-container min-w-0 space-y-5">
    <PageHeader
      eyebrow="Ciência e método"
      title="Como o índice é calculado"
      description="Todo o aplicativo usa a metodologia 0.8: mapa, ficha, tabela, planilha e agregados mostram a mesma nota de cada campanha e ponto."
      help={<ResultsInterpretationHelp title="Como ler o cálculo">
        <p>O índice ordena a atenção entre os pontos de captação. Não é porcentagem, não é probabilidade de dano e não descreve a água tratada.</p>
        <p>Os números de cada ponto, com as fichas que formam cada nota, estão em <strong>Índice de risco na captação</strong>.</p>
      </ResultsInterpretationHelp>}
      tabs={<SectionTabs />}
    />
    <section className={card}>
      <h2 className={title}>Método 0.8 · versão em uso</h2>
      <p>Cada campanha é calculada só com os seus próprios dados, ponto a ponto (SIA). Zero é nota calculada; “sem estimativa” e “sem medição” não são zero. A média pode esconder picos; o máximo descreve o maior índice observado. A capacidade preditiva ainda exige validação independente.</p>
      <Link className="underline" href="/resultados/calculos/0-8">Consultar a versão 0.8 para leitura ou impressão</Link>
    </section>
    <section className={card}>
      <h2 className={title}>Fórmula</h2>
      <p>Cada organismo detectado contribui com a sua participação nos reads válidos da biblioteca × a gravidade do efeito (1 a 3, dividida por 3) × a aplicabilidade registrada na ficha (1, 0,5, 0,1 ou 0). A soma passa por uma curva logarítmica e vira a nota da categoria, de 0 a 1.</p>
      <p>São três categorias: danos físicos e ambientais, riscos operacionais e perigo potencial à saúde, identificado na captação. A nota de cada categoria é a do marcador de maior nota entre os utilizáveis. A maior das três notas é o piso do índice geral. Um dano distinto e documentado em outra categoria pode reforçar esse piso; repetir o mesmo dano não reforça. O índice geral não é a média das três categorias. O número da rede é a média dos pontos da campanha, com um voto por ponto.</p>
      <p>A escala é fixa e tem folga: uma nota de 0,15 corresponde a cerca de 1% de participação ponderada, 0,35 a 4% e 0,60 a 15%.</p>
    </section>
    <section className={card}>
      <h2 className={title}>Regras de evidência</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Só pontua organismo com efeito documentado em fonte lida. Organismo sem ficha decidida contribui com zero e reduz a cobertura da curadoria, não a nota.</li>
        <li>Evidência de espécie não vale para o gênero, salvo quando só uma espécie do gênero ocorre no Brasil, como o mexilhão-dourado.</li>
        <li>Diatomáceas e a assinatura de esgoto somam como grupos e só pontuam o que passa da base da rede.</li>
        <li>Ocorrência com menos de 10 reads ou menos de 0,01% da biblioteca vira alerta, sem elevar a nota.</li>
        <li>Zero significa nenhuma contribuição pontuada, não ausência demonstrada de risco.</li>
      </ul>
    </section>
    <section className={card}>
      <h2 className={title}>Dados usados</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Marcadores 16S e COI das campanhas C1 a C3, da reanálise do laboratório. Quando há duas corridas da mesma amostra, usa-se o NextSeq e, na falta dele, o MiSeq.</li>
        <li>Organismos marinhos identificados no COI foram retirados da leitura, porque não têm como ocorrer nas captações.</li>
        <li>Espécies exóticas são listadas por ponto, sem nota.</li>
      </ul>
    </section>
    <section className={card}>
      <h2 className={title}>O que o índice não enxerga</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Mosquito-fantasma (Chaoboridae), problema conhecido da ETA Passaúna.</li>
        <li>Protozoários como Cryptosporidium e Giardia.</li>
        <li>Algas cujo cloroplasto não foi classificado. Não há marcador próprio para diatomáceas.</li>
      </ul>
      <p>Diatomáceas e assinatura de esgoto podem contribuir para a nota acima de bases fixadas com C1–C3. A dominância compara cada táxon com as bibliotecas utilizáveis do mesmo componente nas três campanhas e gera apenas alerta. A classificação exploratória do cloroplasto não substitui medição de biomassa nem confirmação do efeito. A comparação é retrospectiva; desempenho para antecipar episódios não foi demonstrado.</p>
    </section>
    <p><Link className="inline-flex min-h-11 items-center rounded-lg bg-[var(--brand-navy-strong)] px-4 text-sm font-bold text-white" href="/resultados/indice-captacao">Consultar resultados por campanha e ponto</Link></p>
  </div>;
}
