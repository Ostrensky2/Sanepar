"use client";

import {
  CalendarCheck2,
  CheckCircle2,
  FlaskConical,
  Target,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildInitialCampaignManagement,
  defaultCampaigns,
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
  reserveRightRail?: boolean;
};

export function HomeProjectSummary({
  pointSummary,
  reserveRightRail = false,
}: HomeProjectSummaryProps) {
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
    const resultsFinalized = managementRows.filter((m) =>
      m.management ? isResultFinalized(m.management.status) : false,
    ).length;
    const activeRows = managementRows.filter(
      ({ management }) => management && isCampaignActive(management.status),
    );

    return {
      plannedCampaigns: campaigns.length,
      activeCampaigns: activeRows.length,
      resultsFinalized,
      activeCampaignLabel:
        activeRows.map(({ campaign }) => formatCampaignLabel(campaign.selectorLabel)).join(", ") ||
        "Todas elegíveis",
    };
  }, [campaignManagement, campaigns]);

  return (
    <div className={reserveRightRail ? "lg:pr-[calc(30%+var(--layout-gutter))]" : ""}>
      <section className="glass-panel radius-panel border border-[var(--line-ghost)] p-4">
        <div className="mb-4 flex flex-col gap-[var(--space-3)] sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="type-eyebrow text-[var(--brand-teal)]">
              Síntese do projeto
            </p>
            <h2 className="heading-font type-section-title mt-1 text-[var(--brand-navy-strong)]">
              Monitoramento sazonal Yva&apos;e
            </h2>
          </div>
        </div>

        {/* A fase de cada campanha já aparece nos cartões acima; aqui fica só a síntese do projeto. */}
            <div className="grid grid-cols-3 gap-3">
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
            </div>
      </section>
    </div>
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
        <p className="text-caption font-bold text-slate-500">
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
