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
  const fichas: CatalogFicha[] = captureFichas().map(ficha => ({ id: ficha.id, taxon: ficha.taxon, level: ficha.level, domain: ficha.domain, code: ficha.code, severity: ficha.severity, applicability: ficha.applicability,
    contested: ficha.contested, source: ficha.source, rationale: ficha.rationale, scores: ficha.scores ?? true, note: ficha.note ?? null, used: ficha.used ?? false,
    theme: ficha.theme ?? null, effect: effectOf.get(ficha.id) ?? null }));
  const initialQuery = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  return <div className="app-container min-w-0 space-y-5">
    <PageHeader
      eyebrow="Ciência e método"
      title="Impactos potenciais"
      description="Escolha um tipo de efeito para ver os organismos ligados a ele e abrir as fichas."
      help={<ResultsInterpretationHelp title="Como ler o catálogo de impactos">
        <p><strong>O que é:</strong> o cadastro de fichas, a base das notas do índice. Cada ficha liga um organismo a um efeito descrito na literatura, numa das três categorias. É o cadastro inteiro, não só o que apareceu nas campanhas.</p>
        <p><strong>Como usar:</strong> escolha a categoria e o tipo de efeito. Os organismos ligados àquele efeito aparecem em quadrinhos, em ordem alfabética. Clique em um quadrinho para abrir as fichas do organismo, com gravidade, aplicabilidade, descrição e fontes. Os pontinhos coloridos mostram em quais categorias o organismo tem ficha. A busca por nome fica em “Mais filtros”.</p>
        <p><strong>Entram na nota:</strong> as fichas com gravidade e aplicabilidade definidas. As demais ficam registradas, sem nota: busca sem evidência, resultado nulo, medição contestada ou só ocorrência.</p>
        <p><strong>Nível do organismo:</strong> gênero, família ou grupo. Espécie só aparece para exóticas com identificação sustentada pelo laboratório.</p>
        <p><strong>Gravidade:</strong> de 1 (fraca) a 3 (forte). <strong>Aplicabilidade:</strong> quanto do grupo tem o efeito: todo (1), parte substancial (0,5) ou minoria (0,1).</p>
        <p>O que foi detectado em cada campanha, e em que pontos, está em <strong>Resultados › Organismos</strong>. Detectar o DNA de um organismo com ficha não confirma o efeito no local.</p>
      </ResultsInterpretationHelp>}
      tabs={<SectionTabs />}
    />
    <EffectsCatalog fichas={fichas} initialQuery={initialQuery} />
  </div>;
}
