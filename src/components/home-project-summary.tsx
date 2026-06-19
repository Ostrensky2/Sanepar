"use client";

import {
  CalendarCheck2,
  CheckCircle2,
  ListChecks,
  FlaskConical,
  Target,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildInitialCampaignManagement,
  defaultCampaigns,
  getCurrentCampaignStage,
  isCampaignActive,
  readCampaignManagement,
  type CampaignManagementById,
  type CampaignOperationalStatus,
} from "@/lib/campaign-management";

type HomeProjectSummaryProps = {
  pointSummary: {
    total: number;
    original: number;
    effective: number;
    monitored: number;
    fieldCampaigns: number;
  };
};

export function HomeProjectSummary({ pointSummary }: HomeProjectSummaryProps) {
  const campaigns = defaultCampaigns;
  const [campaignManagement, setCampaignManagement] = useState<CampaignManagementById>(() =>
    buildInitialCampaignManagement(campaigns),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    function sync() {
      void readCampaignManagement(campaigns).then(setCampaignManagement);
    }

    sync();
    window.addEventListener("yvae:campaign-management-updated", sync);
    return () => window.removeEventListener("yvae:campaign-management-updated", sync);
  }, [campaigns]);

  const summary = useMemo(() => {
    const managementRows = campaigns.map((campaign) => ({
      campaign,
      management: campaignManagement[campaign.id],
    }));
    const resultsFinalized = managementRows.filter((management) =>
      management.management ? isResultFinalized(management.management.status) : false,
    ).length;
    const activeRows = managementRows.filter(
      ({ management }) => management && isCampaignActive(management.status),
    );
    const activeStageSummary = activeRows
      .map(({ campaign, management }) => {
        const campaignNumber = campaign.id.match(/campanha-(\d+)/)?.[1] ?? campaign.selectorLabel;
        const stage = management ? getCurrentCampaignStage(management.stages) : undefined;
        return `Campanha ${campaignNumber}: ${stage?.label ?? "Etapa não informada"}`;
      })
      .join("; ");
    const firstActiveStage = activeRows[0]?.management
      ? getCurrentCampaignStage(activeRows[0].management.stages)?.label
      : undefined;

    return {
      plannedCampaigns: campaigns.length,
      activeCampaigns: activeRows.length,
      resultsFinalized,
      currentStageLabel: firstActiveStage ?? "Sem campanha ativa",
      activeCampaignLabel:
        activeRows.map(({ campaign }) => formatCampaignLabel(campaign.selectorLabel)).join(", ") ||
        "Todas elegíveis",
      activeStageSummary: activeStageSummary || "Sem campanha ativa",
    };
  }, [campaignManagement, campaigns]);

  return (
    <section className="glass-panel radius-panel border border-[var(--line-ghost)] p-4">
      <div className="mb-3 flex flex-col gap-[var(--space-3)] sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-caption font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
            Síntese do projeto
          </p>
          <h2 className="heading-font mt-1 text-xl font-bold tracking-tight text-[var(--brand-navy-strong)]">
            Monitoramento sazonal Yva&apos;e
          </h2>
        </div>
        <span className="inline-flex w-fit max-w-full items-center rounded-full border border-[var(--brand-teal)]/20 bg-white/80 px-3 py-1.5 text-label font-black text-[var(--brand-navy-strong)] shadow-[0_12px_30px_-24px_rgba(0,66,98,0.34)]">
          <span className="mr-2 h-2 w-2 rounded-full bg-[var(--brand-teal)]" />
          <span className="truncate">Campanha: {summary.activeCampaignLabel}</span>
        </span>
      </div>

      <div className="grid items-stretch gap-[var(--space-3)] sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={Target}
          label="Previstas"
          value={String(summary.plannedCampaigns)}
          detail="campanhas ordinárias"
          tone="primary"
        />
        <SummaryCard
          icon={CalendarCheck2}
          label="Campo realizadas"
          value={String(pointSummary.fieldCampaigns)}
          detail="com coleta efetiva"
          tone="success"
        />
        <SummaryCard
          icon={FlaskConical}
          label="Resultados finais"
          value={String(summary.resultsFinalized)}
          detail="publicados ou concluídos"
          tone={summary.resultsFinalized > 0 ? "success" : "warning"}
        />
        <SummaryCard
          icon={ListChecks}
          label="Etapa atual"
          value={summary.currentStageLabel}
          detail={summary.activeStageSummary}
          tone="neutral"
        />
      </div>
    </section>
  );
}

function isResultFinalized(status: CampaignOperationalStatus) {
  return status === "Resultados publicados" || status === "Concluída";
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
  detail: string;
  tone: "primary" | "success" | "warning" | "neutral";
}) {
  const toneClass = {
    primary: "border-[var(--brand-blue)] text-[var(--brand-navy)]",
    success: "border-[var(--brand-green)] text-[var(--brand-teal)]",
    warning: "border-[var(--brand-amber)] text-[var(--brand-amber)]",
    neutral: "border-slate-300 text-slate-500",
  }[tone];

  return (
    <article className={`flex h-full min-h-32 flex-col radius-card border border-[var(--line-ghost)] border-b-2 bg-white p-3 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-caption font-bold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </p>
        <Icon className="h-4 w-4 flex-shrink-0" />
      </div>
      <p className="heading-font mt-2 text-xl font-black text-[var(--brand-navy-strong)]">
        {value}
      </p>
      <p className="mt-1 text-label font-semibold leading-4 text-[var(--ink-soft)]">{detail}</p>
    </article>
  );
}

function formatCampaignLabel(label: string) {
  return label.replace(" - ", " – ");
}

