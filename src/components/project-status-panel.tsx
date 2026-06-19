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

export function ProjectStatusPanel() {
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
          currentStage: currentStage?.label ?? "Etapas não informadas",
        };
      }),
    [campaignManagement, campaigns],
  );

  const highlightedRows = campaignRows.slice(0, 4);

  return (
    <SectionCard
      title="Campanhas, etapas e evolução"
      description="Leitura operacional alimentada pela Entrada de dados."
      className="p-4"
    >

      <div className="grid gap-3 xl:grid-cols-4">
        {highlightedRows.map(({ campaign, management, progress, currentStage }) => (
          <article
            key={campaign.id}
            className="rounded-2xl border border-[var(--line-ghost)] bg-white p-3 shadow-[0_18px_52px_-42px_rgba(0,66,98,0.28)]"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-caption font-bold uppercase tracking-[0.16em] text-slate-500">
                  {campaign.selectorLabel}
                </p>
                <p className="mt-1 heading-font text-base font-black text-[var(--brand-navy-strong)]">
                  {management?.status ?? campaign.status}
                </p>
              </div>
              <StatusIcon status={management?.status ?? campaign.status} />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
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
            <div className="mt-2 grid gap-1.5 text-xs text-[var(--ink-soft)]">
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
      </div>
    </SectionCard>
  );
}

function progressGradient(progress: number) {
  const opacity = Math.min(0.95, 0.32 + progress / 160);
  return `linear-gradient(90deg, rgba(20,184,166,0.22), rgba(20,184,166,${opacity}), var(--brand-teal))`;
}

function StatusIcon({ status }: { status: string }) {
  const isDone = status === "Concluída" || status === "Resultados publicados";
  const className = isDone
    ? "bg-[var(--brand-green-soft)] text-[var(--brand-green)]"
    : "bg-[var(--surface-soft)] text-[var(--brand-teal)]";

  return (
    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${className}`}>
      {isDone ? <CheckCircle2 className="h-4.5 w-4.5" /> : <Activity className="h-4.5 w-4.5" />}
    </span>
  );
}

