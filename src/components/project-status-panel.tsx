"use client";

import { Activity, CalendarDays, CheckCircle2, CircleDot, FlaskConical } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildInitialCampaignManagement,
  calculateCampaignProgress,
  calculateProjectProgress,
  defaultCampaigns,
  getCurrentCampaignStage,
  isCampaignActive,
  readCampaignManagement,
  type CampaignManagementById,
} from "@/lib/campaign-management";

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

  const activeRows = campaignRows.filter(({ management }) =>
    management ? isCampaignActive(management.status) : false,
  );
  const highlightedRows = campaignRows.slice(0, 4);
  const projectProgress = calculateProjectProgress(campaignManagement);

  return (
    <section className="glass-panel rounded-[28px] p-4">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
            Status do projeto
          </p>
          <h2 className="heading-font mt-1 text-3xl font-extrabold tracking-tight text-[var(--brand-navy-strong)]">
            Campanhas, etapas e evolução
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--ink-soft)]">
            Leitura operacional alimentada pela Entrada de dados.
          </p>
        </div>
        <div className="grid min-w-52 grid-cols-2 gap-2">
          <MiniStatus label="Avanço total" value={`${projectProgress}%`} icon={Activity} />
          <MiniStatus label="Ativas" value={String(activeRows.length).padStart(2, "0")} icon={CircleDot} />
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-4">
        {highlightedRows.map(({ campaign, management, progress, currentStage }) => (
          <article
            key={campaign.id}
            className="rounded-2xl border border-[var(--line-ghost)] bg-white p-3 shadow-[0_18px_52px_-42px_rgba(0,66,98,0.28)]"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
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
              <span className="w-8 text-right text-[10px] font-black text-[var(--brand-navy-strong)]">
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
    </section>
  );
}

function progressGradient(progress: number) {
  const opacity = Math.min(0.95, 0.32 + progress / 160);
  return `linear-gradient(90deg, rgba(20,184,166,0.22), rgba(20,184,166,${opacity}), var(--brand-teal))`;
}

function MiniStatus({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-2xl bg-[var(--surface-soft)] p-3">
      <Icon className="mb-1.5 h-4 w-4 text-[var(--brand-teal)]" />
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="heading-font text-xl font-black text-[var(--brand-navy-strong)]">{value}</p>
    </div>
  );
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
