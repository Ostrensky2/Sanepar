import { MethodologyPdfLink } from "@/modules/results/components/methodology-pdf-link";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";
import { ResearchBrowser } from "@/modules/results/components/research-browser";
import { ResultsInterpretationHelp } from "@/modules/results/components/results-interpretation-help";

export default async function CalculationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  return <div className="app-container min-w-0 space-y-5">
    <PageHeader
      eyebrow="Ciência e método"
      title="Como o índice é calculado"
      description="Do organismo detectado ao índice de 0 a 1, com os números de cada ponto."
      help={<ResultsInterpretationHelp title="Como ler o cálculo">
        <p><strong>Passo a passo:</strong> escolha um ponto no topo e acompanhe, passo a passo, como os organismos detectados nele viram o índice de 0 a 1.</p>
        <p><strong>Valores por ponto:</strong> o valor de cada conjunto (Cianobactérias, Bactérias, COI) em cada domínio, para todos os pontos.</p>
        <p>O índice vai de 0 a 1 e é relativo aos pontos da campanha: não é probabilidade, percentual de dano nem classe de risco. Ponto com menos de três conjuntos mostra uma faixa possível, não um número.</p>
      </ResultsInterpretationHelp>}
      actions={<MethodologyPdfLink />}
      tabs={<SectionTabs />}
    />
    <ResearchBrowser key={query.toString()} module="calculations" initialQuery={query.toString()} />
  </div>;
}
