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
  getMostAdvancedCampaignStage,
  isCampaignActive,
  readCampaignManagement,
  type CampaignManagementById,
  type CampaignOperationalStatus,
  type MetabarcodingStage,
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

  const campaignRows = useMemo(() => {
    const rows: Array<{
      id: string;
      label: string;
      advancedStage?: MetabarcodingStage;
      allDone?: boolean;
      isGrouped?: boolean;
    }> = [];
    // First 3 campaigns (C1, C2, C3) are always separate
    for (let i = 0; i < 3; i++) {
      const campaign = campaigns[i];
      if (!campaign) continue;
      const management = campaignManagement[campaign.id];
      const stages = management?.stages ?? [];
      const advancedStage = getMostAdvancedCampaignStage(stages);
      const allDone = stages.length > 0 && stages.every((s) => s.status === "done");
      rows.push({
        id: campaign.id,
        label: campaign.selectorLabel.split(" - ")[0] || campaign.selectorLabel,
        advancedStage,
        allDone,
      });
    }

    // Check C4 to C9
    const remainingCampaigns = campaigns.slice(3); // C4 to C9
    const unstartedRemaining = remainingCampaigns.filter(c => {
      const m = campaignManagement[c.id];
      const stages = m?.stages ?? [];
      return !getMostAdvancedCampaignStage(stages);
    });

    if (unstartedRemaining.length === remainingCampaigns.length) {
      // All C4 to C9 are unstarted, group them!
      rows.push({
        id: "campanhas-4-9",
        label: "4ª a 9ª Campanha",
        advancedStage: undefined,
        allDone: false,
        isGrouped: true,
      });
    } else {
      // Some are started, list them individually
      remainingCampaigns.forEach((campaign) => {
        const m = campaignManagement[campaign.id];
        const stages = m?.stages ?? [];
        const advancedStage = getMostAdvancedCampaignStage(stages);
        const allDone = stages.length > 0 && stages.every((s) => s.status === "done");

        rows.push({
          id: campaign.id,
          label: campaign.selectorLabel.split(" - ")[0] || campaign.selectorLabel,
          advancedStage,
          allDone,
        });
      });
    }

    return rows;
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

        <div className="grid gap-4 lg:grid-cols-3 items-stretch">
          {/* Lado esquerdo: Cards de resumo reduzidos */}
          <div className="lg:col-span-2">
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-3 h-full">
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
          </div>

          {/* Lado direito: Tabela de fase mais avançada por campanha */}
          <div className="lg:col-span-1 h-full">
            <div className="radius-card border border-[var(--line-ghost)] border-b-2 bg-white p-3 shadow-[0_12px_30px_-24px_rgba(0,66,98,0.15)] h-full flex flex-col justify-between">
              <div>
                <h3 className="type-label mb-1.5 text-[var(--ink-soft)]">
                  Etapa atual
                </h3>
                <div className="overflow-x-auto">
                  <table className="type-table w-full border-collapse text-left">
                    <thead>
                      <tr className="border-b border-slate-100 font-semibold text-[var(--ink-soft)]">
                        <th className="pb-1.5 font-bold">Campanha</th>
                        <th className="pb-1.5 font-bold text-left pl-4">Fase atual</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {campaignRows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-1 pr-2 font-bold text-[var(--brand-navy-strong)] border-r border-slate-100/50">
                            {row.label}
                          </td>
                          <td className="py-1 pl-4 text-left font-semibold text-slate-600">
                            {row.isGrouped ? (
                              <span className="text-slate-400">Não iniciadas</span>
                            ) : row.allDone ? (
                              <span className="inline-flex items-center gap-1.5 justify-start">
                                <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-green)]" />
                                Concluída
                              </span>
                            ) : row.advancedStage ? (
                              <span className="inline-flex items-center gap-1.5 justify-start">
                                <span className={`h-1.5 w-1.5 rounded-full ${row.advancedStage.status === 'done' ? 'bg-[var(--brand-green)]' : 'bg-[var(--brand-teal)] animate-pulse'}`} />
                                {row.advancedStage.label}
                              </span>
                            ) : (
                              <span className="text-slate-400">Não iniciada</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
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
