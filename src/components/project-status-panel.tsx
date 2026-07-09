"use client";

import { Activity, CalendarDays, CheckCircle2, FlaskConical } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildInitialCampaignManagement,
  calculateCampaignProgress,
  defaultCampaigns,
  getCurrentCampaignStage,
  readCampaignManagement,
  type CampaignManagementById,
} from "@/lib/campaign-management";
import { SectionCard } from "@/components/section-card";

export function ProjectStatusPanel({
  compact = false,
  reserveRightRail = false,
}: {
  compact?: boolean;
  reserveRightRail?: boolean;
} = {}) {
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

  const campaignRows = useMemo(
    () =>
      campaigns.map((campaign) => {
        const management = campaignManagement[campaign.id];
        const stages = management?.stages ?? [];
        const progress = management ? calculateCampaignProgress(stages, management.status) : 0;
        const currentStage = getCurrentCampaignStage(stages);

        return {
          campaign,
          management,
          progress,
          currentStage: currentStage?.label ?? "—",
        };
      }),
    [campaignManagement, campaigns],
  );

  const latestCampaignRows = useMemo(() => {
    const started = campaignRows.filter((row) => {
      const status = row.management?.status ?? row.campaign.status;
      return [
        "Em preparação",
        "Em campo",
        "Coleta concluída",
        "Aguardando laboratório",
        "Em análise",
        "Resultados publicados",
        "Concluída",
      ].includes(status);
    });
    return started.slice(-3);
  }, [campaignRows]);

  const { totalStages, completedStages, projectProgressPercent } = useMemo(() => {
    let total = 0;
    let completed = 0;

    campaignRows.forEach((row) => {
      const stages = row.management?.stages ?? [];
      total += stages.length;
      completed += stages.filter((s) => s.status === "done").length;
    });

    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      totalStages: total,
      completedStages: completed,
      projectProgressPercent: percent,
    };
  }, [campaignRows]);

  return (
    <div className={reserveRightRail ? "lg:pr-[calc(30%+var(--layout-gutter))]" : ""}>
    <SectionCard
      title="Campanhas, etapas e evolução"
      description="Leitura operacional alimentada pela Entrada de dados."
      className={compact ? "p-3 [&>div]:mt-3" : "p-4"}
    >

      <div className={`grid ${compact ? "gap-2" : "gap-3"} xl:grid-cols-4`}>
        {latestCampaignRows.map(({ campaign, management, progress, currentStage }) => (
          <article
            key={campaign.id}
            className={`rounded-2xl border border-[var(--line-ghost)] bg-white shadow-[0_18px_52px_-42px_rgba(0,66,98,0.28)] ${compact ? "p-2.5" : "p-3"}`}
          >
            <div className={`${compact ? "mb-1.5" : "mb-2"} flex items-start justify-between gap-3`}>
              <div className={compact ? "min-h-[4.9rem]" : "min-h-[5.3rem]"}>
                <p className="text-caption font-bold uppercase tracking-[0.16em] text-slate-500">
                  {campaign.selectorLabel}
                </p>
                <p className={`${compact ? "mt-0.5 text-sm" : "mt-1 text-base"} heading-font font-black text-[var(--brand-navy-strong)]`}>
                  {management?.status ?? campaign.status}
                </p>
              </div>
              <StatusIcon status={management?.status ?? campaign.status} compact={compact} />
            </div>
            <div className="flex items-center gap-2">
              <div className={`${compact ? "h-1.5" : "h-2"} flex-1 overflow-hidden rounded-full bg-slate-100`}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${progress}%`,
                    background: progressGradient(progress),
                  }}
                />
              </div>
              <span className="w-8 text-right text-caption font-black text-[var(--brand-navy-strong)]">
                {progress}%
              </span>
            </div>
            <div className={`${compact ? "mt-1.5 gap-1 text-[11px]" : "mt-2 gap-1.5 text-xs"} grid text-[var(--ink-soft)]`}>
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-[var(--brand-teal)]" />
                {management?.period ?? campaign.period}
              </span>
              <span className="flex items-center gap-1.5">
                <FlaskConical className="h-3.5 w-3.5 text-[var(--brand-teal)]" />
                {currentStage}
              </span>
            </div>
          </article>
        ))}

        {/* Quarto Card: Total Executado do Projeto */}
        <article
          className={`rounded-2xl border border-[var(--brand-blue-soft)] bg-gradient-to-br from-white to-[var(--surface-base)] shadow-[0_18px_52px_-42px_rgba(0,66,98,0.35)] ${compact ? "p-2.5" : "p-3"}`}
        >
          <div className={`${compact ? "mb-1.5" : "mb-2"} flex items-start justify-between gap-3`}>
            <div className={compact ? "min-h-[4.9rem]" : "min-h-[5.3rem]"}>
              <p className="text-caption font-bold uppercase tracking-[0.16em] text-slate-500">
                Total Executado do Projeto
              </p>
              <p className={`${compact ? "mt-0.5 text-sm" : "mt-1 text-base"} heading-font font-black text-[var(--brand-navy-strong)]`}>
                Progresso Geral
              </p>
            </div>
            <span className={`inline-flex items-center justify-center rounded-full ${compact ? "h-7 w-7" : "h-8 w-8"} bg-[var(--brand-blue-soft)] text-[var(--brand-navy)]`}>
              <Activity className={compact ? "h-4 w-4" : "h-4.5 w-4.5"} />
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className={`${compact ? "h-1.5" : "h-2"} flex-1 overflow-hidden rounded-full bg-slate-100`}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${projectProgressPercent}%`,
                  background: `linear-gradient(90deg, var(--brand-blue-soft), var(--brand-blue), var(--brand-navy-strong))`,
                }}
              />
            </div>
            <span className="w-8 text-right text-caption font-black text-[var(--brand-navy-strong)]">
              {projectProgressPercent}%
            </span>
          </div>
          <div className={`${compact ? "mt-1.5 gap-1 text-[11px]" : "mt-2 gap-1.5 text-xs"} grid text-[var(--ink-soft)]`}>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-[var(--brand-blue)]" />
              {completedStages} de {totalStages} etapas concluídas
            </span>
            <span className="flex items-center gap-1.5">
              <FlaskConical className="h-3.5 w-3.5 text-[var(--brand-blue)]" />
              {campaigns.length} campanhas previstas
            </span>
          </div>
        </article>
      </div>
    </SectionCard>
    </div>
  );
}
function progressGradient(progress: number) {
  const opacity = Math.min(0.95, 0.32 + progress / 160);
  return `linear-gradient(90deg, rgba(20,184,166,0.22), rgba(20,184,166,${opacity}), var(--brand-teal))`;
}

function StatusIcon({ status, compact = false }: { status: string; compact?: boolean }) {
  const isDone = status === "Concluída" || status === "Resultados publicados";
  const className = isDone
    ? "bg-[var(--brand-green-soft)] text-[var(--brand-green)]"
    : "bg-[var(--surface-soft)] text-[var(--brand-teal)]";

  return (
    <span className={`inline-flex items-center justify-center rounded-full ${compact ? "h-7 w-7" : "h-8 w-8"} ${className}`}>
      {isDone ? <CheckCircle2 className={compact ? "h-4 w-4" : "h-4.5 w-4.5"} /> : <Activity className={compact ? "h-4 w-4" : "h-4.5 w-4.5"} />}
    </span>
  );
}

