"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  FlaskConical,
  MapPinned,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CampaignMapSection } from "@/components/campaign-map-section";
import {
  CampaignHydroMap,
  type CampaignHydroMapPoint,
} from "@/components/campaign-hydro-map";
import {
  currentStageColor,
  MetabarcodingStagesIndicator,
} from "@/components/metabarcoding-stages";
import {
  FIELD_DIARY_UPDATED_EVENT,
  readFieldDiaryEntries,
  readFieldDiaryEntriesFromStorage,
  type FieldDiaryEntry,
} from "@/lib/field-diary";

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

const SELECTED_CAMPAIGN_STORAGE_KEY = "yvae:selected-campaign-id";

export function CampaignsPageContent({
  campaignPoints,
  campaigns = defaultCampaigns,
  view = "campo",
  eyebrow = "Campanha selecionada",
  selectorLabel = "Campanha exibida",
  emptyMapTitle = "Mapa aguardando dados de campo",
  emptyMapDescription = "A planilha de Campo deve ser importada pela aba Dados para que o mapa, os pontos efetivos, as rotas e as evidências desta campanha sejam liberados.",
}: {
  campaignPoints: CampaignHydroMapPoint[];
  campaigns?: CampaignView[];
  view?: "campo" | "resultados";
  eyebrow?: string;
  selectorLabel?: string;
  emptyMapTitle?: string;
  emptyMapDescription?: string;
}) {
  const [selectedCampaignId, setSelectedCampaignId] = useState(() => {
    if (typeof window === "undefined") {
      return campaigns[0].id;
    }

    const stored = window.localStorage.getItem(SELECTED_CAMPAIGN_STORAGE_KEY);
    return stored && campaigns.some((campaign) => campaign.id === stored)
      ? stored
      : campaigns[0].id;
  });
  const [diaryEntries, setDiaryEntries] = useState<FieldDiaryEntry[]>(() =>
    readFieldDiaryEntriesFromStorage(),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SELECTED_CAMPAIGN_STORAGE_KEY, selectedCampaignId);
  }, [selectedCampaignId]);

  useEffect(() => {
    let isMounted = true;

    async function loadDiaryEntries() {
      const entries = await readFieldDiaryEntries();

      if (isMounted) {
        setDiaryEntries(entries);
      }
    }

    void loadDiaryEntries();

    function handleUpdate() {
      setDiaryEntries(readFieldDiaryEntriesFromStorage());
    }
    window.addEventListener(FIELD_DIARY_UPDATED_EVENT, handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener(FIELD_DIARY_UPDATED_EVENT, handleUpdate);
    };
  }, []);

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? campaigns[0],
    [campaigns, selectedCampaignId],
  );

  const selectedDiaryEntries = useMemo(
    () =>
      diaryEntries.filter(
        (e) =>
          e.campaignId === selectedCampaignId ||
          e.campaignName === selectedCampaign.title,
      ),
    [diaryEntries, selectedCampaignId, selectedCampaign.title],
  );

  const selectedCampaignPoints = useMemo(
    () =>
      campaignPoints.filter((point) =>
        campaignPointMatchesSelectedCampaign(point, selectedCampaignId, selectedCampaign.title),
      ),
    [campaignPoints, selectedCampaignId, selectedCampaign.title],
  );

  const diaryMapPoints = useMemo(
    () =>
      selectedDiaryEntries
        .map(diaryEntryToMapPoint)
        .filter((p): p is CampaignHydroMapPoint => p !== null),
    [selectedDiaryEntries],
  );

  const visiblePoints = useMemo(() => {
    if (!diaryMapPoints.length) return selectedCampaignPoints;
    if (!selectedCampaign.hasFieldData) return diaryMapPoints;

    const merged = [...selectedCampaignPoints];
    for (const dp of diaryMapPoints) {
      const idx = dp.code
        ? merged.findIndex((p) => p.code.toLowerCase() === dp.code.toLowerCase())
        : -1;
      if (idx >= 0) {
        if (!merged[idx].effective && dp.effective) {
          merged[idx] = { ...merged[idx], effective: dp.effective };
        }
      } else {
        merged.push(dp);
      }
    }
    return merged;
  }, [diaryMapPoints, selectedCampaign.hasFieldData, selectedCampaignPoints]);

  const fieldRowCount =
    selectedCampaignPoints.length ||
    selectedDiaryEntries.length ||
    Number(selectedCampaign.metrics.fieldRows) ||
    0;
  const effectivePointCount =
    selectedCampaignPoints.filter((point) => point.effective).length ||
    diaryMapPoints.length ||
    Number(selectedCampaign.metrics.effectivePoints) ||
    0;

  return (
    <div className="space-y-6">
      {/* Header: title + campaign selector */}
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
            {eyebrow}
          </p>
          <h2 className="heading-font text-3xl font-extrabold tracking-tight text-[var(--brand-navy-strong)]">
            {selectedCampaign.title}
          </h2>
        </div>

        <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500 lg:min-w-96">
          {selectorLabel}
          <select
            className="rounded-xl border border-[var(--line-strong)] bg-white px-4 py-3 text-sm font-bold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none transition focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20"
            value={selectedCampaignId}
            onChange={(event) => setSelectedCampaignId(event.target.value)}
          >
            {campaigns.map((campaign) => {
              const statusMark =
                campaign.status === "Concluída" ? "✓ " :
                campaign.status === "Em preparação" ? "⏳ " : "· ";
              return (
                <option key={campaign.id} value={campaign.id}>
                  {statusMark}{campaign.selectorLabel}
                </option>
              );
            })}
          </select>
        </label>
      </section>

      {/* Metrics cards */}
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
          value={`${effectivePointCount}/${selectedCampaign.metrics.plannedPoints}`}
          detail="Efetivos / previstos"
          tone="success"
        />
        <CampaignMetricCard
          icon={FileSpreadsheet}
          label="Planilha de campo"
          value={String(fieldRowCount)}
          detail="Registros importados"
          tone={fieldRowCount > 0 || selectedCampaign.hasFieldData ? "success" : "neutral"}
        />
        <CampaignMetricCard
          icon={FlaskConical}
          label="Planilha de resultados"
          value={selectedCampaign.metrics.resultRows}
          detail="Resultados importados"
          tone={selectedCampaign.hasResultData ? "success" : "warning"}
        />
      </section>

      {/* Campo view */}
      {view === "campo" && (
        <div className="space-y-6">
          <section>
            {selectedCampaign.hasFieldData || diaryMapPoints.length > 0 ? (
              <CampaignMapSection
                points={visiblePoints}
                useLocalImportCache={diaryMapPoints.length === 0}
              />
            ) : (
              <EmptyCampaignPanel
                title={emptyMapTitle}
                description={emptyMapDescription}
              />
            )}
          </section>

          <CollectionsSummary
            campaignName={selectedCampaign.title}
            entries={selectedDiaryEntries}
          />
        </div>
      )}

      {/* Resultados view */}
      {view === "resultados" && (
        <div className="space-y-6">
          <MetabarcodingStagesIndicator />

          <AnalyticResultsMap
            points={visiblePoints}
            pointColor={currentStageColor()}
          />

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
              title="Resultados Críticos"
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
      )}
    </div>
  );
}

function CollectionsSummary({
  campaignName,
  entries,
}: {
  campaignName: string;
  entries: FieldDiaryEntry[];
}) {
  return (
    <section className="glass-panel rounded-[28px] p-4">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--brand-teal)]">
            Planilha Diário de Campo
          </p>
          <h3 className="heading-font mt-1 text-2xl font-extrabold text-[var(--brand-navy-strong)]">
            Coletas
          </h3>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--ink-soft)]">
            Tabela síntese dos registros de coleta filtrados para {campaignName}. A inclusão e a
            importação dos registros ficam em Entrada de dados, no módulo Diário de campo.
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--surface-soft)] p-3 text-[var(--brand-navy)]">
          <ClipboardList className="h-5 w-5" />
        </div>
      </div>

      {entries.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line-ghost)] text-[10px] uppercase tracking-[0.16em] text-slate-500">
                <th className="px-3 py-3">Data</th>
                <th className="px-3 py-3">Dia</th>
                <th className="px-3 py-3">Local / SIA</th>
                <th className="px-3 py-3">Município</th>
                <th className="px-3 py-3">Atividades</th>
                <th className="px-3 py-3">Água</th>
                <th className="px-3 py-3">Ocorrência</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-[var(--line-ghost)] align-top">
                  <td className="px-3 py-4 font-bold text-[var(--brand-navy-strong)]">
                    {formatDate(entry.entryDate)}
                  </td>
                  <td className="px-3 py-4">{entry.campaignDay}</td>
                  <td className="px-3 py-4">
                    <span className="block font-semibold">{entry.locationName || "Não informado"}</span>
                    {entry.sia ? <span className="text-xs text-slate-500">{entry.sia}</span> : null}
                  </td>
                  <td className="px-3 py-4">{entry.municipality || "Não informado"}</td>
                  <td className="px-3 py-4">{joinSummary(entry.activities)}</td>
                  <td className="px-3 py-4">{joinSummary(entry.waterVisualConditions)}</td>
                  <td className="px-3 py-4">
                    <span className={entry.hasOccurrence ? occurrenceYesClassName : occurrenceNoClassName}>
                      {entry.hasOccurrence ? entry.occurrenceType || "Sim" : "Não"}
                    </span>
                  </td>
                  <td className="px-3 py-4">{entry.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex min-h-48 flex-col items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-[var(--surface-soft)] p-8 text-center">
          <ClipboardList className="mb-3 h-9 w-9 text-slate-400" />
          <p className="heading-font text-xl font-bold text-[var(--brand-navy-strong)]">
            Nenhuma coleta encontrada
          </p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Importe ou registre a Planilha Diário de Campo em Entrada de dados para preencher esta síntese.
          </p>
        </div>
      )}
    </section>
  );
}

function joinSummary(values: string[]) {
  return values.length ? values.join(", ") : "Não informado";
}

function formatDate(date: string) {
  const [year, month, day] = date.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : date;
}

function AnalyticResultsMap({
  points,
  pointColor,
}: {
  points: CampaignHydroMapPoint[];
  pointColor: string;
}) {
  return (
    <section className="relative min-h-[620px] overflow-hidden rounded-[30px] border border-[var(--line-ghost)] bg-[linear-gradient(180deg,#eef5f8,#e6eef3)] shadow-[0_30px_80px_-48px_rgba(0,66,98,0.22)]">
      <CampaignHydroMap
        points={points}
        layers={{
          roadMap: true,
          basins: true,
          dailyRoutes: false,
          dayTransitions: false,
          planned: false,
          effective: true,
          displacement: false,
        }}
        effectivePointColor={pointColor}
        showPointTooltip
        caption="Mapa rodoviário OpenStreetMap · Pontos de coleta da campanha"
      />
    </section>
  );
}

function diaryEntryToMapPoint(entry: FieldDiaryEntry): CampaignHydroMapPoint | null {
  const lat = parseFloat(entry.latitude ?? "");
  const lon = parseFloat(entry.longitude ?? "");
  if (!isFinite(lat) || !isFinite(lon)) return null;
  return {
    id: `diary-${entry.id}`,
    code: entry.sia?.trim() || entry.locationName,
    point: entry.locationName,
    day: String(entry.campaignDay),
    campaign: entry.campaignName,
    date: entry.entryDate,
    waterBody: entry.locationName,
    municipality: entry.municipality,
    original: null,
    effective: { lat, lon },
    accessibility: "",
    waterAspect: entry.waterVisualConditions.join(", "),
    weatherConditions: "",
    problems: entry.hasOccurrence ? (entry.occurrenceDescription ?? "") : "",
    driveUrl: "",
    dropboxUrl: "",
    photoUrl: "",
  };
}

function campaignPointMatchesSelectedCampaign(
  point: CampaignHydroMapPoint,
  selectedCampaignId: string,
  selectedCampaignTitle: string,
) {
  const campaignNumber = selectedCampaignId.match(/campanha-(\d+)/)?.[1];
  const normalizedPointCampaign = normalizeCampaignKey(point.campaign);

  return (
    normalizedPointCampaign === normalizeCampaignKey(selectedCampaignTitle) ||
    (campaignNumber ? normalizedPointCampaign === campaignNumber : false)
  );
}

function normalizeCampaignKey(value: string) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return normalized.match(/^\d+$/)?.[0] ?? normalized.match(/(\d+)\s*(?:a|ª|º)?\s*campanha/)?.[1] ?? normalized;
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
    <div className="flex min-h-80 flex-col items-center justify-center rounded-[30px] border border-dashed border-slate-300 bg-[var(--surface-soft)] p-8 text-center">
      <FileSpreadsheet className="mb-4 h-10 w-10 text-slate-400" />
      <p className="heading-font text-xl font-bold text-[var(--brand-navy-strong)]">{title}</p>
      <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

const occurrenceYesClassName =
  "inline-flex rounded-full bg-[var(--brand-amber)]/12 px-2.5 py-1 text-xs font-bold text-[var(--brand-amber)]";

const occurrenceNoClassName =
  "inline-flex rounded-full bg-[var(--brand-green-soft)] px-2.5 py-1 text-xs font-bold text-[var(--brand-navy-strong)]";

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
