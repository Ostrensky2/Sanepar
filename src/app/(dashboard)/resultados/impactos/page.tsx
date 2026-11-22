import Link from "next/link";
import { campaignFromQuery } from "@/lib/campaign-identity";
import { InvalidCampaignNotice } from "@/components/invalid-campaign-notice";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";
import { ResearchBrowser } from "@/modules/results/components/research-browser";
import { ResultsInterpretationHelp } from "@/modules/results/components/results-interpretation-help";

export default async function ImpactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const campaign = campaignFromQuery(params.campaignCode ?? params.campaign);
  if (campaign === null || (!campaign && (params.publicationId !== undefined || params.sourceHash !== undefined)) || (params.campaign !== undefined && campaignFromQuery(params.campaign)?.id !== campaign?.id)) {
    return <InvalidCampaignNotice href="/resultados/impactos" label="Escolher campanha na consulta" />;
  }
  const number = campaign?.id.split("-")[1];
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, item);
  if (number) query.set("campaignCode", `C${number}`);
  return <div className="app-container min-w-0 space-y-5">
    <PageHeader
      eyebrow="Ciência e método"
      title="Impactos potenciais"
      description="Consulte o índice vigente ou explore a evidência bibliográfica do catálogo histórico."
      help={<ResultsInterpretationHelp title="Como ler o catálogo histórico de impactos">
        <p><strong>Impactos:</strong> cada linha liga um organismo a um efeito descrito na literatura (ambiental, operacional ou à saúde), com nota de 1 (fraca) a 3 (forte). “Sem nota” (NA) quer dizer que ninguém avaliou ainda, não que o risco é zero.</p>
        <p><strong>Na campanha:</strong> em quantos pontos e com quantos reads o organismo apareceu na campanha escolhida. A lista abre só com os detectados, dos que tiveram mais reads para os que tiveram menos; em “Mostrar” você vê o catálogo inteiro, com os detectados primeiro.</p>
        <p><strong>Onde ocorrem:</strong> em que pontos o organismo foi detectado e qual a fatia dele nos reads daquele ponto. <strong>Referências:</strong> as publicações que sustentam cada efeito.</p>
        <p>Detectar o DNA de um organismo com efeito descrito na literatura não confirma o efeito no local.</p>
        <p>Duas opções marcadas no mesmo filtro mostram as duas. Dois filtros diferentes mostram só o que atende aos dois.</p>
      </ResultsInterpretationHelp>}
      tabs={<SectionTabs />}
    />
    <section className="app-card p-4">
      <h2 className="type-section-title">Índice de captação atual</h2>
      <p>Consulte o escore, os marcadores e a evidência da amostra no índice vigente.</p>
      <Link className="inline-flex min-h-11 items-center font-semibold underline" href={number ? `/resultados/indice-captacao?campaign=${number}` : "/resultados/indice-captacao"}>Abrir índice de captação</Link>
    </section>
    <h2 className="type-section-title">Catálogo histórico de impactos potenciais</h2>
    <ResearchBrowser key={query.toString()} module="impacts" initialQuery={query.toString()} />
  </div>;
}
