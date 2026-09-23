import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";
import { ResearchBrowser } from "@/modules/results/components/research-browser";
import { ResultsInterpretationHelp } from "@/modules/results/components/results-interpretation-help";

export default async function ImpactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  return <div className="app-container min-w-0 space-y-5">
    <PageHeader
      eyebrow="Ciência e método"
      title="Impactos potenciais"
      description="O que a literatura associa a cada organismo detectado e onde ele apareceu nas campanhas."
      help={<ResultsInterpretationHelp title="Como ler os impactos potenciais">
        <p><strong>Impactos:</strong> cada linha liga um organismo a um efeito descrito na literatura (ambiental, operacional ou à saúde), com nota de 1 (fraca) a 3 (forte). “Sem nota” (NA) quer dizer que ninguém avaliou ainda, não que o risco é zero.</p>
        <p><strong>Na campanha:</strong> em quantos pontos e com quantos reads o organismo apareceu na campanha escolhida. A lista abre só com os detectados, dos que tiveram mais reads para os que tiveram menos; em “Mostrar” você vê o catálogo inteiro, com os detectados primeiro.</p>
        <p><strong>Onde ocorrem:</strong> em que pontos o organismo foi detectado e qual a fatia dele nos reads daquele ponto. <strong>Referências:</strong> as publicações que sustentam cada efeito.</p>
        <p>Detectar o DNA de um organismo com efeito descrito na literatura não confirma o efeito no local.</p>
        <p>Duas opções marcadas no mesmo filtro mostram as duas. Dois filtros diferentes mostram só o que atende aos dois.</p>
      </ResultsInterpretationHelp>}
      tabs={<SectionTabs />}
    />
    <ResearchBrowser key={query.toString()} module="impacts" initialQuery={query.toString()} />
  </div>;
}
