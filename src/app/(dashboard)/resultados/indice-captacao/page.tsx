import Link from "next/link";
import { CaptureIndexPanel } from "@/components/capture-index-panel";
import { PageHeader } from "@/components/page-header";
import { SectionTabs } from "@/components/section-tabs";
import { ResultsInterpretationHelp } from "@/modules/results/components/results-interpretation-help";

const campaigns = [1, 2, 3];

export default async function CaptureIndexPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const value = (await searchParams).campaign;
  const selected = typeof value === "string" && campaigns.includes(Number(value)) ? Number(value) : undefined;
  const tab = (active: boolean) => `inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-bold ${active ? "bg-[var(--brand-navy-strong)] text-white" : "text-[var(--brand-navy-strong)]"}`;
  return <div className="app-container min-w-0 space-y-5">
    <PageHeader
      eyebrow="Ciência e método"
      title="Índice de risco na captação"
      description="Triagem de risco da biota por ponto de captação, nas campanhas C1 a C3, em três categorias e um índice geral."
      help={<ResultsInterpretationHelp title="Como ler o índice de risco na captação">
        <p><strong>O que é:</strong> um escore de 0 a 1 que ordena a atenção entre os pontos. Não é porcentagem, não é probabilidade de dano e não descreve a água tratada.</p>
        <p><strong>Três categorias:</strong> danos físicos e ambientais, riscos operacionais e perigo potencial à saúde. O índice geral do ponto é a maior das três notas.</p>
        <p><strong>Zero</strong> significa nenhuma contribuição pontuada, não ausência demonstrada de risco. <strong>Sem medição</strong> só aparece quando não há biblioteca utilizável.</p>
        <p>Versão piloto, ainda não confrontada com ocorrências reais. O que o índice não enxerga está listado no fim da página.</p>
      </ResultsInterpretationHelp>}
      tabs={<SectionTabs />}
    />
    <nav aria-label="Campanha" className="flex flex-wrap gap-2">
      <Link className={tab(selected === undefined)} href="/resultados/indice-captacao">Visão da rede</Link>
      {campaigns.map(campaign => <Link key={campaign} className={tab(selected === campaign)} href={`/resultados/indice-captacao?campaign=${campaign}`}>Campanha {campaign}</Link>)}
    </nav>
    <section className="app-card p-4"><CaptureIndexPanel key={selected ?? "rede"} campaign={selected} /></section>
  </div>;
}
