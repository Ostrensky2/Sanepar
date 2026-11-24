import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";
import { ResultsInterpretationHelp } from "@/modules/results/components/results-interpretation-help";
import { bandNames, bands } from "@/modules/results/components/capture-map-scale";

/**
 * Metodologia científica do trabalho, do ponto de coleta à nota do índice (método 3.0).
 * Cada número desta página vem de um documento do projeto; nada é suposto:
 * - coleta: docs/padrao-coleta-de-campo.md (padrão de campo, versão 3, 13/11/2026);
 * - laboratório, bioinformática e identificação: relatórios do Márcio de 12/11/2026
 *   (MetaReports 16S e COI, Proveniencia/Pipeline_16S_revisado, Auditoria_pipeline, cópia do Google Docs de métodos);
 * - matrizes: LEIA_ME das matrizes por SIA, entrega de 13/11/2026;
 * - fichas e cálculo: src/lib/capture-index/indice-captacao.json (contagens do catálogo e parâmetros)
 *   e src/lib/results-08-core.ts (fórmulas).
 * O que os documentos não trazem (protocolo de extração e PCR, volume filtrado em C1 a C3) não é descrito aqui.
 */
type Stage = { title: string; lead: string; items: ReactNode[]; help: ReactNode };

const stages: Stage[] = [
  {
    title: "Coleta em campo",
    lead: "Cada ponto de captação é identificado pelo seu código SIA.",
    items: [
      <>No ponto, a equipe toca em <strong>Iniciar coleta</strong> no aplicativo de campo, que grava a data, a hora e a coordenada do GPS.</>,
      <>Cada amostra recebe um código único gerado pelo aplicativo, como <span className="font-mono text-[0.9em]">YVA-0136-071126-0905-AG1</span>: projeto, SIA, data, hora, tipo e número.</>,
      <>Padrão atual do aplicativo, por ponto: 5 réplicas de água de 250 mL, 1 branco de 250 mL e 1 amostra de plâncton, com conservante Longmire e guarda em Criobox.</>,
      <>O <strong>branco</strong> é o controle negativo de campo: água ultrapura tratada como amostra, para revelar contaminação.</>,
    ],
    help: <>
      <p>O código da amostra segue o formato projeto, SIA com 4 dígitos, dia/mês/ano, hora e minuto, tipo (AG água, BR branco, PL plâncton) e número da réplica. Ele é gerado pelo aplicativo, nunca digitado, e não se repete.</p>
      <p>O volume do plâncton é o de água que passou pela rede (1.000 L no padrão). Os parâmetros medidos no ponto, como temperatura da água, pH, condutividade, oxigênio dissolvido, turbidez e transparência (Secchi), são gravados com valor, unidade, profundidade e equipamento.</p>
      <p>A planilha exportada pelo aplicativo vai para o laboratório, que segue com o rastreio da amostra. O padrão descrito é o do aplicativo de campo desde a versão 3 (13/11/2026).</p>
      <p>Nas campanhas C1 a C3, cada biblioteca de DNA foi ligada ao SIA pelos registros de campo e do laboratório. Na C1, o número do extrato foi convertido em SIA pela tabela de correspondência do laboratório. O mesmo SIA em campanhas diferentes não é a mesma coleta.</p>
    </>,
  },
  {
    title: "Laboratório: DNA e sequenciamento",
    lead: "Dois trechos de genes, os marcadores, são lidos em cada amostra.",
    items: [
      <><strong>16S rRNA</strong>, para bactérias e cianobactérias. Na C1, região V3–V4 (primers 341F e 785R); na C2 e na C3, região V4 (515F e 806R).</>,
      <><strong>COI</strong> (citocromo c oxidase I), para invertebrados e outros organismos com núcleo. Na C1, primers BF3 e BR2; na C2 e na C3, primers de Leray.</>,
      <>Sequenciamento Illumina em pares: cada fragmento é lido pelas duas pontas. C1 e C2 no MiSeq; a C3 no MiSeq e de novo no NextSeq, com as mesmas amostras.</>,
      <>534 bibliotecas ambientais. 16S: 73 (C1), 75 (C2), 76 (C3 MiSeq) e 76 (C3 NextSeq). COI: 59, 75, 50 e 50.</>,
    ],
    help: <>
      <p><strong>Biblioteca</strong> é o DNA de uma amostra preparado para um marcador e lido em uma corrida. Por isso um mesmo ponto pode ter até quatro bibliotecas (dois marcadores, duas corridas na C3).</p>
      <p>As duas corridas da C3 são um novo sequenciamento das mesmas amostras, não réplicas biológicas independentes, e são analisadas em separado. Os primers da C1 são diferentes dos da C2 e da C3; por isso as comparações entre campanhas são exploratórias.</p>
      <p>Controles negativos do laboratório utilizáveis no 16S: nenhum na C1, dois na C2 e três em cada corrida da C3.</p>
      <p>Os relatórios de análise começam nos arquivos de sequência entregues pelo laboratório. O protocolo de extração do DNA, da PCR e do preparo das bibliotecas é do laboratório e não está descrito nesses relatórios.</p>
    </>,
  },
  {
    title: "Processamento das leituras",
    lead: "Análise bioinformática do Márcio, revisão de 12/11/2026, a única usada no aplicativo.",
    items: [
      <>Retirada dos primers (Cutadapt) e filtro de qualidade (DADA2 1.38, em R 4.5.3): sai a leitura com base indeterminada, com erro esperado acima do limite ou com menos de 100 bases.</>,
      <>Um modelo de erro para cada corrida corrige as leituras e gera as <strong>ASVs</strong>, variantes exatas de sequência. As duas pontas são unidas e as quimeras, removidas.</>,
      <>Descontaminação com os controles negativos de cada corrida (decontam, prevalência): sai a ASV com escore abaixo de 0,1; entre 0,1 e 0,5, fica marcada como ambígua.</>,
      <>No COI, triagem própria do gene: fragmento de 299 a 320 bases, fase de leitura e códons de parada.</>,
    ],
    help: <>
      <p><strong>Leitura (read)</strong> é cada sequência produzida pelo aparelho. <strong>ASV</strong> é cada sequência distinta que sobra depois da correção dos erros. Uma ASV não é uma espécie: uma espécie pode ter várias ASVs, e espécies diferentes podem ter a mesma.</p>
      <p>Parâmetros do filtro: nenhuma base indeterminada; erro esperado máximo de 2 nas duas pontas do 16S e de 2 e 4 no COI; corte de qualidade 2; comprimento mínimo de 100 bases; remoção do PhiX. As pontas são unidas com sobreposição mínima de 20 bases e nenhuma discordância; as quimeras saem pelo método de consenso.</p>
      <p>Na C1 não havia controle negativo identificado, e a contaminação não pôde ser avaliada por esse método. Isso não quer dizer que não houve contaminação.</p>
      <p>No COI da C1, o fragmento lido é recortado para a mesma região usada na C2 e na C3, para que as três campanhas sejam classificadas do mesmo jeito.</p>
      <p>Reads do 16S retidos ao final: 9,8 milhões na C1, 4,1 milhões na C2, 1,6 milhão na C3 MiSeq e 26,0 milhões na C3 NextSeq.</p>
      <p>A auditoria documental de 12/11/2026 considerou o processamento defensável como análise exploratória. Acurácia, limite de detecção e taxa de erro não foram demonstrados por ensaio independente. No 16S do NextSeq da C3, o modelo de erro estimou taxas altas de troca de base nas leituras de melhor qualidade; essa ressalva foi mantida.</p>
    </>,
  },
  {
    title: "Identificação dos organismos",
    lead: "Cada ASV é comparada com bancos de referência de organismos já identificados.",
    items: [
      <><strong>16S:</strong> classificador do DADA2 contra o CyanoSeq 1.3 com o SILVA 138.2, com suporte mínimo de 80 em 100, até o nível de gênero.</>,
      <><strong>COI:</strong> uma referência única para as três campanhas, com 556.794 fragmentos do MIDORI2, BOLD e GenBank. Família e gênero com suporte mínimo de 0,8; espécie só com pelo menos 99% de identidade e sem alternativa compatível.</>,
      <><strong>Recorte de água doce do COI:</strong> conta só o organismo com vida aquática em água doce e registro documentado no Paraná.</>,
      <>Os resultados ficam em gênero, família ou grupo. <strong>Espécie, só para as exóticas</strong> com identificação sustentada.</>,
    ],
    help: <>
      <p>Quando o suporte não basta para um nível, fica o nível acima que foi sustentado; nada é completado por suposição. O que não chega a nenhum nível fica como “sem classificação” e continua no total de reads.</p>
      <p>No 16S, a espécie só é aceita por um painel dirigido de referências (identidade mínima de 98,7% e nenhuma outra espécie compatível). Na C1 esse painel não se aplica, porque a região lida é outra.</p>
      <p>No COI, o registro de ocorrência no Paraná vem do GBIF e do speciesLink. Ele decide se o organismo entra no recorte, mas não serve para escolher o nome: referências de outras regiões continuam na comparação.</p>
      <p>Exóticas em espécie: <em>Aquarana catesbeiana</em>, <em>Cordylophora caspia</em>, <em>Craspedacusta sowerbii</em>, <em>Kellicottia bostoniensis</em>, <em>Limnoperna fortunei</em> (mexilhão-dourado) e <em>Micropterus salmoides</em>. <em>Corbicula</em> fica em gênero, porque o trecho lido não separa as espécies.</p>
      <p>Na leitura do índice, 25 grupos marinhos que apareceram no COI são retirados, porque não têm como ocorrer nas captações, e os reads de <em>Perna</em> contam como mexilhão-dourado. O banco do laboratório não é alterado.</p>
      <p>Suporte e identidade não são probabilidade de acerto. Encontrar DNA de um organismo não comprova que ele vive ali em população estabelecida.</p>
    </>,
  },
  {
    title: "Matrizes por ponto e planilha unificada",
    lead: "Entrega do Márcio de 13/11/2026: 16 matrizes com a contagem de reads por SIA.",
    items: [
      <>Uma matriz por marcador (16S e COI), conjunto (C1, C2, C3 MiSeq e C3 NextSeq) e nível (gênero e família). Linha é o SIA; célula é a contagem de reads.</>,
      <>O 16S traz também os grupos de risco do laboratório; o COI traz as exóticas.</>,
      <>O total de cada ponto inclui os reads não classificados: a fatia de um organismo é sempre sobre o total.</>,
      <>Em <strong>Central de dados › Planilhas de resultados</strong>, as matrizes viram uma planilha por campanha. É a única fonte de resultados do aplicativo.</>,
    ],
    help: <>
      <p>As células são contagens de reads, não número de organismos, células ou biomassa.</p>
      <p>Grupos de risco do 16S: toxinas, gosto e odor, patogenicidade, nitrificação, ferro e manganês, enxofre e corrosão, e biofilmes. Um mesmo organismo pode estar em mais de um grupo; por isso os grupos não se somam.</p>
      <p>Pontos do COI sem reads úteis ficam como inconclusivos (por exemplo, na C2 os SIAs 559, 590 e 780). Zero nesses pontos não demonstra ausência.</p>
      <p>O índice usa exatamente estes dados. As análises anteriores das mesmas campanhas não são usadas, nem para comparação.</p>
    </>,
  },
  {
    title: "Catálogo de fichas",
    lead: "Uma ficha liga um organismo a um efeito documentado em fonte científica.",
    items: [
      <><strong>399 fichas</strong>: 104 de danos físicos e ambientais, 94 de riscos operacionais e 201 de perigo potencial à saúde.</>,
      <>Por nível: 354 de gênero, 19 de família, 10 de grupo e 16 de espécie exótica.</>,
      <>Cada ficha tem gravidade (1 leve, 2 moderada, 3 grave), aplicabilidade (1, 0,5, 0,1 ou 0) e a fonte (DOI, PubMed ou endereço).</>,
      <>302 fichas pontuam; as outras registram o organismo sem efeito sustentado e não somam. 189 são de organismos detectados em C1 a C3.</>,
    ],
    help: <>
      <p>A busca bibliográfica usa Google Acadêmico, Web of Science, SciELO e repositórios. O resumo publicado pelos autores é aceito quando a afirmação está nele, para o organismo e o ambiente em questão.</p>
      <p><strong>Aplicabilidade</strong> diz quanto do grupo detectado carrega o efeito. Efeito demonstrado no próprio nível detectado: 1 com evidência forte, 0,5 moderada e 0,1 fraca. Efeito demonstrado só em uma espécie do gênero: 0,5 com evidência forte e 0,1 nos demais casos. Efeito plausível por parentesco: 0,1.</p>
      <p>Evidência de uma espécie não vale para o gênero inteiro, salvo quando só uma espécie do gênero ocorre no Brasil, como o mexilhão-dourado.</p>
      <p>Presença de espécie exótica não é dano: as exóticas são listadas por ponto e só pontuam com dano documentado. Medição contestada entre corridas da mesma amostra não pontua.</p>
      <p>As fichas acompanham a literatura. Quando uma ficha entra ou muda, as notas de todas as campanhas são recalculadas com o catálogo atualizado.</p>
      <p>As fichas estão em <Link className="font-semibold underline" href="/resultados/impactos">Impactos potenciais</Link>.</p>
    </>,
  },
  {
    title: "Cálculo do índice, método 3.0",
    lead: "Por campanha e por ponto (SIA), sem misturar campanhas.",
    items: [
      <>225 observações: 73 pontos na C1, 76 na C2 e 76 na C3.</>,
      <>Em cada ponto e marcador vale o NextSeq quando a biblioteca é utilizável e o MiSeq na falta dele. A escolha é feita antes de olhar a nota.</>,
      <>Cada organismo com ficha vira uma massa; as massas viram a nota de cada categoria; a maior categoria, com reforço por dano distinto, é o índice geral.</>,
      <>O número de uma campanha é a média dos seus pontos, com um voto por ponto.</>,
    ],
    help: <>
      <p>Há três leituras por ponto: <strong>16S</strong> (bactérias, sem os reads de cloroplasto), <strong>ALGAS</strong> (o cloroplasto que aparece no 16S) e <strong>COI</strong>. Reads de marcadores diferentes nunca são somados; a nota de cada categoria é a do marcador com a maior nota.</p>
      <p>Achado com menos de 10 reads ou menos de 0,01% da biblioteca vira alerta, sem mexer na nota. Diatomáceas e a assinatura de esgoto contam como grupo e só pontuam o que passa da base da rede. Organismo que domina a amostra fora do seu padrão gera alerta, não nota.</p>
      <p>Só a C3 tem duas corridas; nela, nas mesmas amostras, as cianobactérias são 0,30% do 16S no MiSeq e 2,07% no NextSeq. Um zero válido na corrida escolhida não é trocado por um positivo da outra.</p>
      <p>A conta, com cada símbolo explicado e um exemplo resolvido, está em <Link className="font-semibold underline" href="/resultados/calculos">Como o índice é calculado</Link>.</p>
    </>,
  },
];

const limits = [
  "Reads não medem abundância nem biomassa. Encontrar DNA não comprova população estabelecida nem dano ocorrido.",
  "Os primers da C1 são diferentes dos da C2 e da C3, e a C3 foi lida em dois aparelhos. As comparações entre campanhas são exploratórias.",
  "A C1 não tem controle negativo identificado. Os controles não têm composição conhecida e os lotes de extração e PCR não foram identificados.",
  "A maior parte dos reads do COI não chega a família, o que limita o que o COI enxerga.",
  "Os marcadores não detectam protozoários como Cryptosporidium e Giardia. Diatomáceas só aparecem pelo cloroplasto no 16S, com classificação exploratória feita fora da análise do laboratório.",
  "Gravidade e aplicabilidade são pesos convencionados a partir da literatura, não medidas feitas na amostra.",
  "O índice orienta a atenção. A capacidade de antecipar episódios ainda não foi testada contra registros operacionais independentes.",
];

export default function ScientificMethodPage() {
  const card = "app-card min-w-0 space-y-3 p-4 sm:p-5";
  const title = "heading-font type-panel-title text-[var(--brand-navy-strong)]";
  const step = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-navy-strong)] text-sm font-bold text-white";
  return <div className="app-container min-w-0 space-y-5">
    <PageHeader
      eyebrow="Ciência e método"
      title="Metodologia científica"
      description="Do ponto de coleta à nota do índice, etapa por etapa."
      help={<ResultsInterpretationHelp title="De onde vem esta descrição">
        <p>Cada etapa resume o que está registrado nos documentos do projeto: o padrão de coleta do aplicativo de campo, os relatórios de análise do Márcio de 12/11/2026 (16S, COI e auditoria do processamento), as matrizes por SIA entregues em 13/11/2026, o catálogo de fichas e o cálculo do método 3.0.</p>
        <p>O “?” de cada etapa traz os detalhes e os cuidados de leitura.</p>
      </ResultsInterpretationHelp>}
      tabs={<SectionTabs />}
    />

    <ol aria-label="Etapas do trabalho" className="flex flex-wrap gap-2 type-metadata">
      {[...stages.map(stage => stage.title), "Faixas e leitura do resultado"].map((label, i) => <li key={label}><a href={`#etapa-${i + 1}`} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[var(--line-ghost)] bg-white px-3 font-semibold text-[var(--ink)] hover:border-[var(--line-strong)]"><span className="font-mono text-[var(--brand-teal)]">{i + 1}</span>{label}</a></li>)}
    </ol>

    <section aria-label="Etapas" className="grid gap-4 lg:grid-cols-2">
      {stages.map((stage, i) => <article key={stage.title} id={`etapa-${i + 1}`} className={card + " scroll-mt-24"}>
        <div className="flex items-center gap-2"><span className={step}>{i + 1}</span><h2 className={title}>{stage.title}</h2>
          <ResultsInterpretationHelp title={`Etapa ${i + 1} · ${stage.title}`}>{stage.help}</ResultsInterpretationHelp></div>
        <p className="type-body font-semibold text-[var(--ink)]">{stage.lead}</p>
        <ul className="list-disc space-y-1.5 pl-5 type-body text-[var(--ink)]">{stage.items.map((item, k) => <li key={k}>{item}</li>)}</ul>
      </article>)}
      <article id={`etapa-${stages.length + 1}`} className={card + " scroll-mt-24"}>
        <div className="flex items-center gap-2"><span className={step}>{stages.length + 1}</span><h2 className={title}>Faixas e leitura do resultado</h2>
          <ResultsInterpretationHelp title={`Etapa ${stages.length + 1} · Faixas e leitura do resultado`}>
            <p>A escala é fixa: vale igual para todas as campanhas e categorias. As faixas orientam a investigação; não são classes de risco comprovado nem limites sanitários.</p>
            <p><strong>Zero</strong> é nota calculada: nenhum organismo com ficha pontuou. Não prova ausência de risco.</p>
            <p><strong>Sem estimativa:</strong> há leitura no ponto, mas a nota não pode ser afirmada. <strong>Sem medição:</strong> não há biblioteca utilizável naquele ponto e campanha. Nenhum dos dois é zero.</p>
          </ResultsInterpretationHelp></div>
        <p className="type-body font-semibold text-[var(--ink)]">A nota, de 0 a 1, cai em uma das cinco faixas, que dão a cor do ponto no mapa e nos gráficos.</p>
        <ul className="space-y-1.5 type-body">
          {bands.map((band, i) => <li key={band.label} className="flex items-center gap-2"><span aria-hidden className="size-3 shrink-0 rounded-full" style={{ backgroundColor: band.color }} /><strong className="text-[var(--ink)]">{bandNames[i]}</strong><span className="text-[var(--ink-soft)]">{band.label}</span></li>)}
        </ul>
        <p className="border-t border-[var(--line-ghost)] pt-3 type-caption text-[var(--ink-soft)]">O índice é um alerta para orientar a atenção, não a medida de um dano ocorrido.</p>
      </article>
    </section>

    <details className="group app-card px-4 sm:px-5">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2 [&::-webkit-details-marker]:hidden"><span className={title}>Limitações</span><ChevronRight aria-hidden className="size-5 shrink-0 text-[var(--ink-soft)] transition-transform group-open:rotate-90" /></summary>
      <ul className="list-disc space-y-1.5 pb-4 pl-5 type-body text-[var(--ink)]">{limits.map(item => <li key={item}>{item}</li>)}</ul>
    </details>

    <div className="flex flex-wrap gap-3">
      <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--brand-navy-strong)] px-4 text-sm font-bold text-white" href="/resultados/calculos">Ver a conta, passo a passo<ArrowRight aria-hidden className="size-4" /></Link>
      <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-white px-4 text-sm font-bold text-[var(--brand-navy-strong)]" href="/campanhas/resultados">Consultar resultados por campanha e ponto</Link>
    </div>
  </div>;
}
