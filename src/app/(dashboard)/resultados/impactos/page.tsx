import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";
import { captureFichas } from "@/lib/capture-index";
import { effects } from "@/lib/capture-index/effect-catalog";
import { EffectsCatalog, type CatalogFicha } from "@/modules/results/components/effects-catalog";
import { ResultsInterpretationHelp } from "@/modules/results/components/results-interpretation-help";

/** Catálogo de impactos (ciência e método): as fichas de efeito do método 3.0. O que foi detectado em cada campanha fica em Resultados > Organismos. */
export default async function ImpactsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // Links antigos para "Onde ocorrem" (resultado de campanha) seguem para Resultados > Organismos.
  if (params.section === "occurrences") {
    const number = String(params.campaignCode ?? params.campaign ?? "").match(/[1-9]/)?.[0];
    redirect(`/campanhas/resultados?${new URLSearchParams({ vista: "organismos", ...(number ? { campaign: number } : {}) })}`);
  }
  const effectOf = new Map<string, { id: string; title: string }>(effects.flatMap(effect => effect.cards.map(card => [card, { id: effect.id, title: effect.title }] as [string, { id: string; title: string }])));
  const fichas: CatalogFicha[] = captureFichas().map(ficha => ({ id: ficha.id, taxon: ficha.taxon, level: ficha.level, domain: ficha.domain, severity: ficha.severity, applicability: ficha.applicability,
    contested: ficha.contested, source: ficha.source, rationale: ficha.rationale, origin: ficha.origin ?? "aprovada", evidence: ficha.evidence ?? "aprovada", used: ficha.used ?? false,
    theme: ficha.theme ?? null, effect: effectOf.get(ficha.id) ?? null }));
  const initialQuery = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  return <div className="app-container min-w-0 space-y-5">
    <PageHeader
      eyebrow="Ciência e método"
      title="Impactos potenciais"
      description="O cadastro de fichas de efeito: a base das notas do índice."
      help={<ResultsInterpretationHelp title="Como ler o catálogo de impactos">
        <p><strong>O que é:</strong> cada linha é uma ficha: liga um organismo a um efeito descrito na literatura, numa das três categorias do índice. É o cadastro inteiro, não só o que apareceu nas campanhas.</p>
        <p><strong>Situação:</strong> <em>Aprovada</em> tem gravidade e aplicabilidade decididas pelo administrador. <em>Provisória, a refinar</em> entra na nota com valores provisórios: veio da revisão bibliográfica de 23/11 (leitura de resumos, com a força da evidência indicada) ou foi herdada de uma espécie do gênero. <em>Registrada, sem nota</em> fica no cadastro, mas não pontua (busca sem evidência, resultado nulo, medição contestada ou só ocorrência).</p>
        <p><strong>Nível do organismo:</strong> gênero, família ou grupo. Espécie só aparece para exóticas com identificação sustentada pelo laboratório.</p>
        <p><strong>Gravidade:</strong> de 1 (fraca) a 3 (forte). <strong>Aplicabilidade:</strong> quanto do grupo tem o efeito: todo (1), parte substancial (0,5) ou minoria (0,1). Nas provisórias: efeito demonstrado no próprio nível vale 1, 0,5 ou 0,1 conforme a evidência seja forte, moderada ou fraca; demonstrado só em espécie do gênero, 0,5 se forte e 0,1 nos demais; plausível por parente, 0,1.</p>
        <p>O que foi detectado em cada campanha, e em que pontos, está em <strong>Resultados › Organismos</strong>. Detectar o DNA de um organismo com ficha não confirma o efeito no local.</p>
      </ResultsInterpretationHelp>}
      tabs={<SectionTabs />}
    />
    <EffectsCatalog fichas={fichas} initialQuery={initialQuery} />
  </div>;
}
