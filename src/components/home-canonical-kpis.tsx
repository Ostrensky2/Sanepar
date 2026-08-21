"use client";

import { AlertOctagon, AlertTriangle, CircleDot, FlaskConical, MapPinned, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  buildInitialCampaignManagement,
  defaultCampaigns,
  readCampaignManagement,
  type CampaignManagementById,
  type CampaignOperationalStatus,
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
    const activeCampaigns = countOperationallyActiveCampaigns(
      campaigns.flatMap((campaign) => {
        const management = campaignManagement[campaign.id];
        return management ? [management.status] : [];
      }),
    );
    const scores = laboratoryRiskPoints
      .map((point) => point.score)
      .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
    const averageScore = scores.length
      ? scores.reduce((total, score) => total + score, 0) / scores.length
      : null;

    const highRiskPoints = laboratoryRiskPoints.filter((point) => point.riskLevel === "alto");
    const uniqueMunicipalities = Array.from(
      new Set(highRiskPoints.map((point) => point.municipality).filter(Boolean))
    );
    const worstPointsLabel = uniqueMunicipalities.length > 0 ? uniqueMunicipalities.join(", ") : "Nenhum";

    return {
      monitoredPoints: pointSummary.monitored,
      etas: new Set(laboratoryRiskPoints.map((point) => point.eta).filter(Boolean)).size,
      highRisk: highRiskPoints.length,
      averageScore,
      activeCampaigns,
      worstPointsLabel,
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
        icon={FlaskConical}
        label="Escore médio"
        value={formatScore(metrics.averageScore)}
        detail="Média dos resultados válidos"
      />
      <CanonicalKpi
        icon={CircleDot}
        label="Campanhas ativas"
        value={formatInteger(metrics.activeCampaigns)}
        detail="Gestão operacional"
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
        icon={AlertOctagon}
        label="Pontos críticos"
        value={metrics.worstPointsLabel}
        detail="Municípios com risco alto"
        accentColor={laboratoryRiskColor("alto")}
        tone="danger"
      />
    </section>
  );
}

export function countOperationallyActiveCampaigns(
  statuses: CampaignOperationalStatus[],
) {
  return statuses.filter((status) =>
    [
      "Em preparação",
      "Em campo",
      "Coleta concluída",
      "Aguardando laboratório",
      "Em análise",
    ].includes(status),
  ).length;
}

function CanonicalKpi({
  icon: Icon,
  label,
  value,
  detail,
  accentColor,
  tone = "default",
}: {
  icon: typeof AlertTriangle;
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

  let fontSizeClass = "type-kpi";
  if (value.length > 25) {
    fontSizeClass = "type-metadata font-bold";
  } else if (value.length > 15) {
    fontSizeClass = "type-label";
  } else if (value.length > 7) {
    fontSizeClass = "type-metadata font-bold";
  }

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
      <p className={`heading-font tracking-0 text-[var(--brand-navy-strong)] ${fontSizeClass}`}>
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
