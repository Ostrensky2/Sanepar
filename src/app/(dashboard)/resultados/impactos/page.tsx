import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";
import { EffectsCatalog } from "@/modules/results/components/effects-catalog";
import { ResultsInterpretationHelp } from "@/modules/results/components/results-interpretation-help";

/** Catálogo de impactos (ciência e método): as fichas de efeito da metodologia 0.8. O que foi detectado em cada campanha fica em Resultados > Organismos. */
export default async function ImpactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // Links antigos para "Onde ocorrem" (resultado de campanha) seguem para Resultados > Organismos.
  if (params.section === "occurrences") {
    const number = String(params.campaignCode ?? params.campaign ?? "").match(/[1-9]/)?.[0];
    redirect(`/campanhas/resultados?${new URLSearchParams({ vista: "organismos", ...(number ? { campaign: number } : {}) })}`);
  }
  return <div className="app-container min-w-0 space-y-5">
    <PageHeader
      eyebrow="Ciência e método"
      title="Impactos potenciais"
      description="Fichas de efeito que entram no índice, com a gravidade e a fonte de cada uma."
      help={<ResultsInterpretationHelp title="Como ler o catálogo de impactos">
        <p><strong>O que é:</strong> cada linha é uma ficha: liga um organismo a um efeito descrito na literatura, numa das três categorias do índice. São as fichas que a metodologia 0.8 usa para calcular as notas.</p>
        <p><strong>Nível do organismo:</strong> gênero, família ou grupo. Espécie só aparece para exóticas com identificação sustentada pelo laboratório.</p>
        <p><strong>Gravidade:</strong> de 1 (fraca) a 3 (forte). <strong>Aplicabilidade:</strong> quanto do grupo tem o efeito: todo (1), parte substancial (0,5) ou minoria (0,1). Ficha contestada ou indeterminada fica registrada, mas não pontua.</p>
        <p><strong>Tipo de efeito:</strong> abre o quadro de efeitos da campanha em Resultados. A justificativa de cada ficha fica recolhida na própria linha.</p>
        <p>O que foi detectado em cada campanha, e em que pontos, está em <strong>Resultados › Organismos</strong>. Detectar o DNA de um organismo com ficha não confirma o efeito no local.</p>
      </ResultsInterpretationHelp>}
      tabs={<SectionTabs />}
    />
    <EffectsCatalog />
  </div>;
}
