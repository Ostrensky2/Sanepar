"use client";

import { Activity, AlertTriangle, CircleDot, FlaskConical, MapPinned, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildInitialCampaignManagement,
  calculateProjectProgress,
  defaultCampaigns,
  isCampaignActive,
  readCampaignManagement,
  type CampaignManagementById,
} from "@/lib/campaign-management";
import { laboratoryRiskColor, type LaboratoryRiskPoint } from "@/lib/laboratory-risk";

type HomeCanonicalKpisProps = {
  pointSummary: {
    monitored: number;
  };
  laboratoryRiskPoints: LaboratoryRiskPoint[];
};

export function HomeCanonicalKpis({
  pointSummary,
  laboratoryRiskPoints,
}: HomeCanonicalKpisProps) {
  const campaigns = defaultCampaigns;
  const [campaignManagement, setCampaignManagement] = useState<CampaignManagementById>(() =>
    buildInitialCampaignManagement(campaigns),
  );

  useEffect(() => {
    function sync() {
      void readCampaignManagement(campaigns).then(setCampaignManagement);
    }

    sync();
    window.addEventListener("yvae:campaign-management-updated", sync);
    return () => window.removeEventListener("yvae:campaign-management-updated", sync);
  }, [campaigns]);

  const metrics = useMemo(() => {
    const activeCampaigns = campaigns.filter((campaign) => {
      const management = campaignManagement[campaign.id];
      return management ? isCampaignActive(management.status) : false;
    }).length;
    const scores = laboratoryRiskPoints
      .map((point) => point.score)
      .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
    const averageScore = scores.length
      ? scores.reduce((total, score) => total + score, 0) / scores.length
      : null;

    return {
      monitoredPoints: pointSummary.monitored,
      etas: new Set(laboratoryRiskPoints.map((point) => point.eta).filter(Boolean)).size,
      highRisk: laboratoryRiskPoints.filter((point) => point.riskLevel === "alto").length,
      averageScore,
      projectProgress: calculateProjectProgress(campaignManagement),
      activeCampaigns,
    };
  }, [campaignManagement, campaigns, laboratoryRiskPoints, pointSummary.monitored]);

  return (
    <section
      className="grid grid-cols-2 items-stretch gap-[var(--space-3)] md:grid-cols-3 2xl:grid-cols-6"
      aria-label="Indicadores canônicos da operação"
    >
      <CanonicalKpi
        icon={MapPinned}
        label="Pontos monitorados"
        value={formatInteger(metrics.monitoredPoints)}
        detail="Fonte: coletas efetivas deduplicadas"
      />
      <CanonicalKpi
        icon={Target}
        label="ETAs"
        value={formatInteger(metrics.etas)}
        detail="Inferidas dos pontos com resultado"
      />
      <CanonicalKpi
        icon={AlertTriangle}
        label="Risco alto"
        value={formatInteger(metrics.highRisk)}
        detail="Pontos eDNA homologados"
        accentColor={laboratoryRiskColor("alto")}
        tone="danger"
      />
      <CanonicalKpi
        icon={FlaskConical}
        label="Escore médio"
        value={formatScore(metrics.averageScore)}
        detail="Média dos resultados válidos"
      />
      <CanonicalKpi
        icon={Activity}
        label="Avanço total"
        value={`${metrics.projectProgress}%`}
        detail="Campanhas e etapas"
      />
      <CanonicalKpi
        icon={CircleDot}
        label="Campanhas ativas"
        value={formatInteger(metrics.activeCampaigns)}
        detail="Gestão operacional"
      />
    </section>
  );
}

function CanonicalKpi({
  icon: Icon,
  label,
  value,
  detail,
  accentColor,
  tone = "default",
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  detail: string;
  accentColor?: string;
  tone?: "default" | "danger";
}) {
  const toneClass =
    tone === "danger"
      ? "text-[var(--brand-navy-strong)]"
      : "border-[var(--line-ghost)] text-[var(--brand-navy-strong)]";

  return (
    <article
      className={`app-card flex h-full min-h-32 flex-col justify-between gap-2 p-3 ${toneClass}`}
      style={accentColor ? { borderColor: `${accentColor}66` } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-caption font-bold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </p>
        <Icon
          className="h-4 w-4 flex-shrink-0"
          style={accentColor ? { color: accentColor } : undefined}
        />
      </div>
      <p className="heading-font text-2xl font-black tracking-0 text-[var(--brand-navy-strong)]">
        {value}
      </p>
      <p className="text-label font-semibold leading-4 text-[var(--ink-soft)]">
        {detail}
      </p>
    </article>
  );
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

function formatScore(score: number | null) {
  return score === null
    ? "--"
    : new Intl.NumberFormat("pt-BR", {
        maximumFractionDigits: 3,
        minimumFractionDigits: 3,
      }).format(score);
}
