import { FileSpreadsheet, MapPinned } from "lucide-react";
import type { CampaignMapPoint } from "@/lib/imports/campaigns";
import { loadDashboardData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function PontosPage() {
  const { campaignPoints, campaignSummary, pointSummary } = await loadDashboardData();
  const points = [...campaignPoints].sort(comparePoints);

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
            Pontos de coleta
          </p>
          <h2 className="heading-font text-3xl font-extrabold tracking-tight text-[var(--brand-navy-strong)]">
            Tabela da planilha de campo
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ink-soft)]">
            Os registros abaixo vêm da última planilha de Campo publicada no módulo Dados.
          </p>
        </div>

        <div className="rounded-[18px] border border-[var(--line-ghost)] bg-white px-4 py-3 text-xs font-semibold text-slate-500 shadow-[0_18px_46px_-38px_rgba(0,66,98,0.38)]">
          <span className="block text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
            Origem ativa
          </span>
          <span className="mt-1 block text-[var(--brand-navy-strong)]">
            {campaignSummary.source}
          </span>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard
          icon={MapPinned}
          label="Pontos na tabela"
          value={pointSummary.total}
          detail="Registros importados"
        />
        <MetricCard
          icon={MapPinned}
          label="Latitude / Longitude"
          value={pointSummary.effective}
          detail="Coordenadas efetivas"
        />
        <MetricCard
          icon={FileSpreadsheet}
          label="Linhas da planilha"
          value={campaignSummary.rowCount}
          detail={campaignSummary.period}
        />
      </section>

      <section className="glass-panel overflow-hidden rounded-[28px]">
        <div className="overflow-auto">
          <table className="w-full min-w-[1180px] text-left">
            <thead className="sticky top-0 z-10 bg-slate-50/95">
              <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                <th className="px-4 py-4">Campanha</th>
                <th className="px-4 py-4">Cód. SIA</th>
                <th className="px-4 py-4">Ponto</th>
                <th className="px-4 py-4">Dia</th>
                <th className="px-4 py-4">Data</th>
                <th className="px-4 py-4">Manancial / Corpo Hídrico</th>
                <th className="px-4 py-4">Município</th>
                <th className="px-4 py-4">Latitude</th>
                <th className="px-4 py-4">Longitude</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-xs">
              {points.map((point) => (
                <tr key={point.id} className="transition-colors hover:bg-[var(--surface-soft)]">
                  <td className="px-4 py-3 font-semibold text-[var(--brand-navy-strong)]">
                    {safeText(point.campaign)}
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-[var(--brand-navy)]">
                    {safeText(point.code)}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{safeText(point.point)}</td>
                  <td className="px-4 py-3 text-slate-600">{safeText(point.day)}</td>
                  <td className="px-4 py-3 text-slate-600">{safeText(point.date)}</td>
                  <td className="px-4 py-3 text-slate-700">{safeText(point.waterBody)}</td>
                  <td className="px-4 py-3 text-slate-600">{safeText(point.municipality)}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">
                    {formatCoordinate(point.effective?.lat)}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700">
                    {formatCoordinate(point.effective?.lon)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!points.length ? (
          <div className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center">
            <FileSpreadsheet className="mb-4 h-10 w-10 text-slate-400" />
            <p className="heading-font text-xl font-bold text-[var(--brand-navy-strong)]">
              Nenhum ponto de coleta publicado
            </p>
            <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">
              Publique uma planilha de Campo no módulo Dados para preencher esta tabela.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof MapPinned;
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <article className="glass-panel rounded-[22px] border-l-4 border-[var(--brand-teal)] p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
          {label}
        </p>
        <Icon className="h-4 w-4 text-[var(--brand-navy)]" />
      </div>
      <p className="heading-font text-3xl font-black text-[var(--brand-navy-strong)]">
        {value}
      </p>
      <p className="mt-1 text-[10px] font-semibold text-[var(--brand-teal)]">{detail}</p>
    </article>
  );
}

function comparePoints(left: CampaignMapPoint, right: CampaignMapPoint) {
  return (
    left.campaign.localeCompare(right.campaign, "pt-BR", { numeric: true }) ||
    left.day.localeCompare(right.day, "pt-BR", { numeric: true }) ||
    left.code.localeCompare(right.code, "pt-BR", { numeric: true })
  );
}

function formatCoordinate(value?: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(6)
    : "Não informado";
}

function safeText(value: string) {
  return value.trim() || "Não informado";
}
