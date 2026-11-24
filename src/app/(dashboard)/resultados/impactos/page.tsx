import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";
import { ResearchBrowser } from "@/modules/results/components/research-browser";
import { ResultsInterpretationHelp } from "@/modules/results/components/results-interpretation-help";

/** Catálogo de impactos (ciência e método). O que foi detectado em cada campanha fica em Resultados > Organismos. */
export default async function ImpactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // Links antigos para "Onde ocorrem" (resultado de campanha) seguem para Resultados > Organismos.
  if (params.section === "occurrences") {
    const number = String(params.campaignCode ?? params.campaign ?? "").match(/[1-9]/)?.[0];
    redirect(`/campanhas/resultados?${new URLSearchParams({ vista: "organismos", ...(number ? { campaign: number } : {}) })}`);
  }
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  return <div className="app-container min-w-0 space-y-5">
    <PageHeader
      eyebrow="Ciência e método"
      title="Impactos potenciais"
      description="Catálogo de efeitos descritos na literatura e as referências que os sustentam."
      help={<ResultsInterpretationHelp title="Como ler o catálogo de impactos">
        <p><strong>Efeitos descritos:</strong> cada linha liga um organismo a um efeito descrito na literatura (ambiental, operacional ou à saúde), com nota de 1 (fraca) a 3 (forte). “Sem nota” (NA) quer dizer que ninguém avaliou ainda, não que o risco é zero.</p>
        <p><strong>Referências:</strong> as publicações que sustentam cada efeito.</p>
        <p>O que foi detectado em cada campanha, e em que pontos, está em <strong>Resultados › Organismos</strong>.</p>
        <p>Duas opções marcadas no mesmo filtro mostram as duas. Dois filtros diferentes mostram só o que atende aos dois.</p>
      </ResultsInterpretationHelp>}
      tabs={<SectionTabs />}
    />
    <ResearchBrowser key={query.toString()} module="impacts" mode="catalog" initialQuery={query.toString()} />
  </div>;
}
