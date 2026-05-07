"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  FileSpreadsheet,
  FlaskConical,
  MapPinned,
  TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import { CampaignMapSection } from "@/components/campaign-map-section";
import type { CampaignHydroMapPoint } from "@/components/campaign-hydro-map";

export type CampaignView = {
  id: string;
  selectorLabel: string;
  title: string;
  period: string;
  status: "Concluída" | "Em preparação" | "Aguardando calendário";
  description: string;
  hasFieldData: boolean;
  hasResultData: boolean;
  metrics: {
    plannedPoints: string;
    effectivePoints: string;
    fieldRows: string;
    resultRows: string;
  };
};

const defaultCampaigns: CampaignView[] = [
  {
    id: "campanha-1-verao-2026",
    selectorLabel: "1ª Campanha - Verão 2026",
    title: "1ª Campanha - Verão 2026",
    period: "Realizada no Verão de 2026",
    status: "Concluída",
    description:
      "Dados de campo da primeira campanha sazonal. Os resultados laboratoriais ainda aguardam importação da planilha homologada.",
    hasFieldData: true,
    hasResultData: false,
    metrics: {
      plannedPoints: "81",
      effectivePoints: "76",
      fieldRows: "76",
      resultRows: "0",
    },
  },
  {
    id: "campanha-2-outono-2026",
    selectorLabel: "2ª Campanha - Outono 2026",
    title: "2ª Campanha - Outono 2026",
    period: "Em preparação técnica",
    status: "Em preparação",
    description:
      "Campanha aguardando calendário operacional, planilha de campo e planilha de resultados.",
    hasFieldData: false,
    hasResultData: false,
    metrics: {
      plannedPoints: "81",
      effectivePoints: "0",
      fieldRows: "0",
      resultRows: "0",
    },
  },
  ...[
    "3ª Campanha - Inverno 2026",
    "4ª Campanha - Primavera 2026",
    "5ª Campanha - Verão 2027",
    "6ª Campanha - Outono 2027",
    "7ª Campanha - Inverno 2027",
    "8ª Campanha - Primavera 2027",
    "9ª Campanha - Verão 2028",
  ].map((label, index) => ({
    id: `campanha-${index + 3}`,
    selectorLabel: label,
    title: label,
    period: "Aguardando calendário técnico",
    status: "Aguardando calendário" as const,
    description:
      "Campanha sazonal prevista. A visualização será liberada quando os dados forem importados pela aba Dados.",
    hasFieldData: false,
    hasResultData: false,
    metrics: {
      plannedPoints: "81",
      effectivePoints: "0",
      fieldRows: "0",
      resultRows: "0",
    },
  })),
];

export function CampaignsPageContent({
  campaignPoints,
  campaigns = defaultCampaigns,
  eyebrow = "Campanha selecionada",
  selectorLabel = "Campanha exibida",
  emptyMapTitle = "Mapa aguardando dados de campo",
  emptyMapDescription = "A planilha de Campo deve ser importada pela aba Dados para que o mapa, os pontos efetivos, as rotas e as evidências desta campanha sejam liberados.",
}: {
  campaignPoints: CampaignHydroMapPoint[];
  campaigns?: CampaignView[];
  eyebrow?: string;
  selectorLabel?: string;
  emptyMapTitle?: string;
  emptyMapDescription?: string;
}) {
  const [selectedCampaignId, setSelectedCampaignId] = useState(campaigns[0].id);
  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? campaigns[0],
    [campaigns, selectedCampaignId],
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
            {eyebrow}
          </p>
          <h2 className="heading-font text-3xl font-extrabold tracking-tight text-[var(--brand-navy-strong)]">
            {selectedCampaign.title}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-soft)]">
            {selectedCampaign.description}
          </p>
        </div>

        <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500 lg:min-w-96">
          {selectorLabel}
          <select
            className="rounded-xl border border-[var(--line-strong)] bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none transition focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20"
            value={selectedCampaignId}
            onChange={(event) => setSelectedCampaignId(event.target.value)}
          >
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.selectorLabel}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CampaignMetricCard
          icon={CalendarDays}
          label="Status da campanha"
          value={selectedCampaign.status}
          detail={selectedCampaign.period}
          tone="primary"
        />
        <CampaignMetricCard
          icon={MapPinned}
          label="Pontos de campo"
          value={`${selectedCampaign.metrics.effectivePoints}/${selectedCampaign.metrics.plannedPoints}`}
          detail="Efetivos / previstos"
          tone="success"
        />
        <CampaignMetricCard
          icon={FileSpreadsheet}
          label="Planilha de campo"
          value={selectedCampaign.metrics.fieldRows}
          detail="Registros importados"
          tone={selectedCampaign.hasFieldData ? "success" : "neutral"}
        />
        <CampaignMetricCard
          icon={FlaskConical}
          label="Planilha de resultados"
          value={selectedCampaign.metrics.resultRows}
          detail="Resultados importados"
          tone={selectedCampaign.hasResultData ? "success" : "warning"}
        />
      </section>

      <section>
        {selectedCampaign.hasFieldData ? (
          <CampaignMapSection points={campaignPoints} />
        ) : (
          <EmptyCampaignPanel
            title={emptyMapTitle}
            description={emptyMapDescription}
          />
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <ResultPanel
          icon={BarChart3}
          title="Resumo Analítico"
          status={selectedCampaign.hasResultData ? "Disponível" : "Aguardando planilha"}
          items={[
            ["Parâmetros avaliados", selectedCampaign.hasResultData ? "0" : "Previsto"],
            ["Amostras com alerta", selectedCampaign.hasResultData ? "0" : "Aguardando"],
            ["Conformidade geral", selectedCampaign.hasResultData ? "0%" : "Aguardando"],
          ]}
        />
        <ResultPanel
          icon={AlertTriangle}
          title="Parâmetros Críticos"
          status={selectedCampaign.hasResultData ? "Monitorado" : "Sem resultados"}
          items={[
            ["Microbiologia", "Aguardando dados"],
            ["Turbidez / Cor", "Aguardando dados"],
            ["Metais / Nutrientes", "Aguardando dados"],
          ]}
        />
        <ResultPanel
          icon={TrendingUp}
          title="Evolução da Campanha"
          status={selectedCampaign.hasResultData ? "Atualizado" : "Estrutura prevista"}
          items={[
            ["Comparativo sazonal", "Aguardando série"],
            ["Pontos recorrentes", "Aguardando série"],
            ["Tendência operacional", "Aguardando série"],
          ]}
        />
      </section>
    </div>
  );
}

function CampaignMetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
  tone: "primary" | "success" | "warning" | "neutral";
}) {
  const toneClass = {
    primary: "border-[var(--brand-blue)] text-[var(--brand-navy-strong)]",
    success: "border-[var(--brand-green)] text-[var(--brand-navy-strong)]",
    warning: "border-[var(--brand-amber)] text-[var(--brand-amber)]",
    neutral: "border-slate-300 text-slate-500",
  }[tone];

  return (
    <article className={`glass-panel rounded-[28px] border-b-2 p-4 ${toneClass}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
          {label}
        </p>
        <Icon className="h-4 w-4" />
      </div>
      <p className="heading-font text-3xl font-black text-[var(--brand-navy-strong)]">
        {value}
      </p>
      <p className="mt-2 text-[10px] font-semibold text-[var(--brand-teal)]">{detail}</p>
    </article>
  );
}

function EmptyCampaignPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[calc(100vh-14rem)] flex-col items-center justify-center rounded-[30px] border border-dashed border-slate-300 bg-[var(--surface-soft)] p-8 text-center">
      <FileSpreadsheet className="mb-4 h-10 w-10 text-slate-400" />
      <p className="heading-font text-xl font-bold text-[var(--brand-navy-strong)]">{title}</p>
      <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function ResultPanel({
  icon: Icon,
  title,
  status,
  items,
}: {
  icon: typeof Activity;
  title: string;
  status: string;
  items: Array<[string, string]>;
}) {
  return (
    <article className="rounded-[28px] border border-[var(--line-ghost)] bg-white p-5 shadow-[0_24px_70px_-52px_rgba(0,66,98,0.28)]">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="heading-font text-lg font-bold text-[var(--brand-navy-strong)]">
            {title}
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            <CheckCircle2 className="h-3.5 w-3.5 text-[var(--brand-teal)]" />
            {status}
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--surface-soft)] p-3 text-[var(--brand-navy)]">
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="space-y-3">
        {items.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between gap-4 rounded-xl bg-[var(--surface-soft)] px-4 py-3 text-sm"
          >
            <span className="text-[var(--ink-soft)]">{label}</span>
            <span className="font-bold text-[var(--brand-navy-strong)]">{value}</span>
          </div>
        ))}
      </div>
    </article>
  );
}
